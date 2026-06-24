#!/usr/bin/env node
// Ghost-to-launch recipe plan mode for Factory Nucleus.
//
// V1 plan mode takes ONE ready ghost (blueprint optional) and emits a
// schema-valid `recipe-plan` artifact describing the ghost-to-launch pipeline as
// ordered stages and inert planned actions. Plan mode NEVER executes anything:
// no implementation writes, no target-repo writes, no live tracker/network
// calls. Only the branch/PR actions are marked `durable` (they represent writes
// a later run mode would perform) -- here they are represented, not run. Saving
// the plan under local factory state is FN-19's job, not this one.

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { redactSecrets } from "./scan.mjs";
import { PROOF_CIRCUIT, resolveFactoryStatePaths, validateRecipePlan, withArtifactMetadata } from "./schema.mjs";
import { branchForGhost } from "./tracker.mjs";
import { createGithubTracker } from "./tracker-github.mjs";
import { createLinearTracker } from "./tracker-linear.mjs";

export const RECIPE_NAME = "ghost-to-launch";
const READY_STATE = "ready";
const DEFAULT_BRANCH_PREFIX = "factory";

// GitHub write actions (branch + PR) gated by the envelope's branch circuit.
const GITHUB_WRITE_ACTIONS = Object.freeze(["branch", "pr"]);

// ghost-to-launch's requested subagent topology (the recipe's desired count).
export const RECIPE_DESIRED_SUBAGENTS = 3;

// The ordered ghost-to-launch pipeline. Each stage names its step, the circuits
// that gate it, and the ids of the planned actions it would drive. `blueprintAware`
// stages additionally read the blueprint when one is supplied.
export const GHOST_TO_LAUNCH_STAGES = Object.freeze([
  Object.freeze({ name: "radar-preflight", circuits: Object.freeze(["radar-clean", "tracker-bound"]), actions: Object.freeze(["read-radar"]), blueprintAware: true }),
  Object.freeze({ name: "inserter-readiness", circuits: Object.freeze(["tracker-bound"]), actions: Object.freeze(["assess-readiness"]) }),
  Object.freeze({ name: "roboports-implementation", circuits: Object.freeze(["branch-isolated", PROOF_CIRCUIT]), actions: Object.freeze(["branch", "pr"]), subagents: Object.freeze([Object.freeze({ role: "implementer", scope: Object.freeze(["acceptance-criteria"]), objective: "Implement the ghost's acceptance criteria on its isolated branch", reads: Object.freeze(["acceptance-criteria"]), writes: Object.freeze(["src"]) }), Object.freeze({ role: "test-author", scope: Object.freeze(["tests"]), objective: "Add tests that prove the acceptance criteria", reads: Object.freeze(["src"]), writes: Object.freeze(["tests"]) })]) }),
  Object.freeze({ name: "radar-drift-check", circuits: Object.freeze(["radar-clean"]), actions: Object.freeze(["check-drift"]) }),
  Object.freeze({ name: "proof-pass", circuits: Object.freeze([PROOF_CIRCUIT]), actions: Object.freeze(["run-proof"]), proof: Object.freeze(["targeted node --test", "npm run check"]), subagents: Object.freeze([Object.freeze({ role: "proof-runner", scope: Object.freeze(["proof"]), objective: "Run targeted and full proof checks and record evidence", reads: Object.freeze(["src", "tests"]) })]) }),
  Object.freeze({ name: "rocket-launch-eligibility", circuits: Object.freeze(["merge-gated", PROOF_CIRCUIT]), actions: Object.freeze(["check-merge"]) }),
  Object.freeze({ name: "radar-post-launch-sync", circuits: Object.freeze(["radar-clean"]), actions: Object.freeze(["sync-radar"]) }),
]);

export const GHOST_TO_LAUNCH_STAGE_NAMES = Object.freeze(GHOST_TO_LAUNCH_STAGES.map((stage) => stage.name));

// The radar touchpoints in the ghost-to-launch pipeline (check-only in V1):
// a preflight scan, a mid-pipeline drift check, and a post-launch sync check.
export const RADAR_STAGES = Object.freeze(["radar-preflight", "radar-drift-check", "radar-post-launch-sync"]);

// Build the planned-action record for an id. Only branch/pr are durable (they
// represent the sole writes a run would make); every check is an inert read.
function plannedAction(id, ghost, branch, blueprint) {
  const ghostId = ghost.id;
  switch (id) {
    case "read-radar":
      return { id, kind: "read", target: `${ghostId} radar`, durable: false };
    case "read-blueprint":
      return { id, kind: "read", target: blueprint ?? "blueprint", durable: false };
    case "assess-readiness":
      return { id, kind: "read", target: ghostId, durable: false };
    case "branch":
      return { id, kind: "branch", target: branch, durable: true };
    case "pr":
      return { id, kind: "pr", target: ghostId, durable: true };
    case "check-drift":
      return { id, kind: "read", target: `${ghostId} drift`, durable: false };
    case "run-proof":
      return { id, kind: "read", target: `${ghostId} proof`, durable: false };
    case "check-merge":
      return { id, kind: "read", target: `${ghostId} merge-eligibility`, durable: false };
    case "sync-radar":
      return { id, kind: "read", target: `${ghostId} post-launch`, durable: false };
    case "request-writes":
      return { id, kind: "read", target: `${ghostId} github-writes`, durable: false };
    default:
      throw new Error(`internal: no planned action spec for ${id}`);
  }
}

// Write scopes claimed by more than one subagent in a stage. Reads never
// conflict (many readers are fine); only overlapping WRITES contend.
export function assessWriteScopes(subagents = []) {
  const counts = new Map();
  for (const sub of subagents) {
    for (const scope of new Set(sub.writes ?? [])) {
      counts.set(scope, (counts.get(scope) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([scope]) => scope).sort();
}

// V1 policy: a stage whose subagents contend for the same write scope is
// escalated (hub must resolve), with the contended scopes recorded. Disjoint
// writes leave the stage unchanged.
export function resolveStageWriteScopes(stage) {
  const conflicts = assessWriteScopes(stage.subagents);
  if (conflicts.length === 0) return stage;
  return { ...stage, status: "escalated", writeConflicts: conflicts };
}

// GitHub writes (branch + PR, short of merge) are gated by the envelope's
// "branch" circuit. No envelope / no branch circuit => unconstrained planning.
// The separate "merge" gate is intentionally NOT consulted here.
export function permitsGithubWrites(envelope) {
  const circuits = envelope?.circuits;
  if (!Array.isArray(circuits)) return true;
  const branchGate = circuits.find((c) => c?.gate === "branch");
  return !branchGate || branchGate.outcome === "allow";
}

// Autonomous merge is allowed ONLY when the envelope explicitly enables it AND
// every quality gate is satisfied: green CI, clean radar, proven proof. Strict
// === true checks mean any missing/false signal (or no envelope) denies merge,
// so autonomous merge is never enabled by default.
export function permitsAutonomousMerge({ envelope, ciGreen, radarClean, proofProven } = {}) {
  return (
    envelope?.delivery?.autoMerge === true &&
    ciGreen === true &&
    radarClean === true &&
    proofProven === true
  );
}

// Effective max subagents = the minimum of the recipe's requested topology and
// the envelope's authoritative cap (envelope.agents.maxSubagents). V1 circuits
// carry no numeric subagent limit, so they do not further constrain this.
export function selectMaxSubagents({ envelope, requested = RECIPE_DESIRED_SUBAGENTS } = {}) {
  const limits = [requested];
  const cap = envelope?.agents?.maxSubagents;
  if (Number.isInteger(cap)) limits.push(cap);
  return Math.min(...limits);
}

// Produce a schema-valid ghost-to-launch recipe-plan for one ready ghost. Pure:
// no filesystem, no network, no mutation of the ghost or tracker. Throws if the
// ghost is not ready (by neutral state, and by tracker readiness when a tracker
// is supplied so an undone dependency also blocks planning).
export function planGhostToLaunch({ ghost, tracker, blueprint, branchPrefix = DEFAULT_BRANCH_PREFIX, generatedAt, envelope, launch = {} } = {}) {
  if (!ghost || typeof ghost !== "object") throw new Error("planGhostToLaunch requires a ghost");
  if (!ghost.id) throw new Error("planGhostToLaunch requires a ghost with an id");
  if (ghost.state !== READY_STATE) {
    throw new Error(`ghost ${ghost.id} is not ready (state: ${ghost.state}); ghost-to-launch plans one ready ghost`);
  }
  if (tracker && typeof tracker.assessReadiness === "function") {
    const readiness = tracker.assessReadiness(ghost.id);
    if (!readiness.ready) throw new Error(`ghost ${ghost.id} is not ready: ${readiness.reasons.join("; ")}`);
  }

  const branch = branchForGhost({ ghostId: ghost.id, title: ghost.title, branchPrefix });
  const writesAllowed = permitsGithubWrites(envelope);
  const launched = permitsAutonomousMerge({ envelope, ...launch });
  const maxSubagents = selectMaxSubagents({ envelope });

  const stages = GHOST_TO_LAUNCH_STAGES.map((spec) => {
    const plannedActions = [...spec.actions];
    if (spec.blueprintAware && blueprint) plannedActions.push("read-blueprint");
    const stage = { name: spec.name, status: "planned", circuits: [...spec.circuits], plannedActions };
    if (spec.proof) stage.proof = [...spec.proof];
    if (spec.subagents) {
      stage.subagents = spec.subagents.map((sub) => ({
        role: sub.role,
        scope: [...sub.scope],
        objective: sub.objective,
        ...(sub.reads ? { reads: [...sub.reads] } : {}),
        ...(sub.writes ? { writes: [...sub.writes] } : {}),
      }));
    }
    if (!writesAllowed && stage.plannedActions.some((id) => GITHUB_WRITE_ACTIONS.includes(id))) {
      stage.plannedActions = ["request-writes"];
      stage.status = "escalated";
    }
    return resolveStageWriteScopes(stage);
  });

  // Top-level plannedActions are exactly the ids the stages reference, in first
  // appearance order, so every stage action resolves and none dangle.
  const referenced = [];
  for (const stage of stages) {
    for (const id of stage.plannedActions) if (!referenced.includes(id)) referenced.push(id);
  }
  const plannedActions = referenced.map((id) => plannedAction(id, ghost, branch, blueprint));

  const plan = withArtifactMetadata("recipe-plan", { recipe: RECIPE_NAME, mode: "plan", launchState: launched ? "launched" : "launch-ready", maxSubagents, stages, plannedActions }, generatedAt);
  const result = validateRecipePlan(plan);
  if (!result.ok) throw new Error(`invalid ghost-to-launch plan for ${ghost.id}: ${result.errors.join("; ")}`);
  return plan;
}

// Readable, redacted summary of a plan. Pure string builder.
export function renderPlanSummary(plan, { ghost } = {}) {
  const lines = [
    "Factory recipe plan",
    "Mode: plan (no implementation writes; no target-repo writes)",
    `Recipe: ${plan.recipe}`,
  ];
  if (ghost) lines.push(`Ghost: ${ghost.id} (${redactSecrets(ghost.title ?? ghost.id)})`);
  lines.push(`Stages: ${plan.stages.length}`);
  for (const stage of plan.stages) {
    let line = `  - ${stage.name} [${stage.status}] circuits: ${stage.circuits.join(", ")}; actions: ${stage.plannedActions.join(", ")}`;
    if (stage.writeConflicts?.length) line += `; write-conflicts: ${stage.writeConflicts.join(", ")}`;
    lines.push(line);
  }
  const durable = plan.plannedActions.filter((action) => action.durable).map((action) => action.id);
  lines.push(`Durable actions (represented, not executed): ${durable.length ? durable.join(", ") : "none"}`);
  lines.push("Remote APIs: none");
  lines.push("");
  return lines.join("\n");
}

// Resolve the enclosing git repo root, or null when not inside a repo.
function gitToplevel(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function slugGhost(ghostId) {
  const slug = String(ghostId).toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
  if (!slug) throw new Error("ghost id must contain at least one alphanumeric character");
  return slug;
}

// Save a recipe-plan under local factory state (homeDir/.loom/...), keyed by the
// same factory id as scan/envelope so they share one state root. Writes ONLY
// under the home factory state root -- never the target repo
// (resolveFactoryStatePaths refuses a root inside it). Returns the saved path.
export function savePlan(plan, { homeDir = process.env.HOME || os.homedir(), root = process.cwd(), ghostId, generatedAt } = {}) {
  const requestedRoot = path.resolve(root);
  const repoRoot = path.resolve(gitToplevel(requestedRoot) || requestedRoot);
  const state = resolveFactoryStatePaths({
    homeDir,
    targetRepoPath: repoRoot,
    factoryId: redactSecrets(path.basename(repoRoot)),
    generatedAt,
  });
  const file = path.join(state.plans, `${slugGhost(ghostId)}.json`);
  mkdirSync(state.plans, { recursive: true });
  writeFileSync(file, `${redactSecrets(JSON.stringify(plan, null, 2))}\n`);
  return { path: file };
}

function planArgs(argv) {
  const flags = {
    "--provider": "provider",
    "--tracker": "tracker",
    "--ghost": "ghost",
    "--branch-prefix": "branchPrefix",
    "--blueprint": "blueprint",
  };
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--no-save") {
      options.noSave = true;
      continue;
    }
    const key = flags[arg];
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = next;
    index += 1;
  }
  return options;
}

function buildTracker(provider, fixturePath) {
  if (provider !== "linear" && provider !== "github") {
    throw new Error(`Unknown tracker provider: ${provider} (expected linear or github)`);
  }
  const resolved = fixturePath.startsWith("file://") ? fileURLToPath(fixturePath) : fixturePath;
  const fixture = JSON.parse(readFileSync(resolved, "utf8"));
  return provider === "linear" ? createLinearTracker(fixture) : createGithubTracker(fixture);
}

const PLAN_USAGE = "Usage: node scripts/factory-nucleus/factory.mjs plan --provider <linear|github> --tracker <fixture.json> --ghost <id> [--branch-prefix <prefix>] [--blueprint <ref>] [--no-save]";

export function planMain(argv = process.argv.slice(2)) {
  const options = planArgs(argv);
  if (options.help) {
    process.stdout.write(`${PLAN_USAGE}\n`);
    return 0;
  }
  if (!options.provider) throw new Error("plan requires --provider <linear|github>");
  if (!options.tracker) throw new Error("plan requires --tracker <fixture.json>");
  if (!options.ghost) throw new Error("plan requires --ghost <id>");

  const tracker = buildTracker(options.provider, options.tracker);
  const ghost = tracker.getGhost(options.ghost);
  if (!ghost) throw new Error(`ghost not found: ${options.ghost}`);

  const plan = planGhostToLaunch({
    ghost,
    tracker,
    blueprint: options.blueprint,
    branchPrefix: options.branchPrefix ?? DEFAULT_BRANCH_PREFIX,
  });
  const saved = options.noSave ? null : savePlan(plan, { ghostId: options.ghost });
  process.stdout.write(renderPlanSummary(plan, { ghost }));
  process.stdout.write(`Local state: ${saved ? "plan saved" : "not saved (--no-save)"}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = planMain();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
