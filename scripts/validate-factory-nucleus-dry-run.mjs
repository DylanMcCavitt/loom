#!/usr/bin/env node
// End-to-end golden dry-run eval for the `ghost-to-launch` recipe (FN-35).
//
// Proves the V1 ghost-to-launch *dry-run* -- plan mode, which is pure: no
// implementation writes, no target-repo writes, no live tracker/network calls --
// over the SAME ready ghost shape ("Tracker bind") expressed in BOTH the Linear
// and the GitHub Issues fixtures yields one canonical, schema-valid recipe-plan.
//
// The plan is normalized (the tracker-specific ghost id and branch are replaced
// with placeholders) so a single golden fixture pins the end-to-end output and
// both providers must match it. A coverage map then asserts the dry-run exercises
// every element FN-35 lists. There is no live smoke: trackers are fixture-backed
// and plan mode never executes anything (only branch/pr are *represented* as
// durable; every other planned action is an inert read).
//
// Unit-level plan behavior lives in tests/factory-nucleus-recipe.test.mjs; this
// eval is the end-to-end golden regression + acceptance-coverage command, wired
// into `npm run validate` / `npm run check` via the scripts/validate-*.mjs glob.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RADAR_STAGES,
  RECIPE_DESIRED_SUBAGENTS,
  planGhostToLaunch,
} from "./factory-nucleus/recipe.mjs";
import { PROOF_CIRCUIT, validateRecipePlan } from "./factory-nucleus/schema.mjs";
import { createGithubTracker } from "./factory-nucleus/tracker-github.mjs";
import { createLinearTracker } from "./factory-nucleus/tracker-linear.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";
const branchPrefix = "dylanmccavitt2015";

const fixturesDir = fileURLToPath(new URL("../tests/fixtures/", import.meta.url));
const goldenPath = path.join(fixturesDir, "dry-run-ghost-to-launch.golden.json");

// Keys that would smuggle a full subagent prompt into a plan; V1 plans carry
// roles/scopes/objectives only, never prompt bodies.
const PROMPT_KEYS = Object.freeze(["prompt", "promptBody", "systemPrompt", "instructions", "body"]);

// A representative envelope: an explicit launch policy (no autonomous merge) and
// an authoritative subagent cap. Inert data; never read from a live source.
export const DRY_RUN_ENVELOPE = Object.freeze({
  schemaVersion: 1,
  kind: "envelope",
  generatedAt,
  factory: { id: "loom", repo: { name: "loom", root: "." } },
  tracker: { provider: "linear", team: "Loom", project: "Factory Nucleus" },
  delivery: { defaultBranch: "main", branchPrefix, autoMerge: false },
  proof: { commands: ["npm run check"] },
  agents: { maxSubagents: 4, allowFullTranscriptCapture: false },
  circuits: [{ name: "proof-required", gate: "proof", outcome: "block", enforcement: "validate" }],
});

// Effective subagent cap = min(recipe request, envelope cap).
const EXPECTED_MAX_SUBAGENTS = Math.min(RECIPE_DESIRED_SUBAGENTS, DRY_RUN_ENVELOPE.agents.maxSubagents);

// The same logical ready ghost in each provider's native fixture JSON.
export const DRY_RUN_FIXTURES = Object.freeze([
  Object.freeze({ provider: "linear", fixture: "adapter-linear.json", createTracker: createLinearTracker, readyGhostId: "LOO-2" }),
  Object.freeze({ provider: "github", fixture: "adapter-github.json", createTracker: createGithubTracker, readyGhostId: "#2" }),
]);

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}

function allSubagents(plan) {
  return plan.stages.flatMap((stage) => stage.subagents ?? []);
}

// Resolve the ready ghost from a provider fixture and produce its dry-run plan.
// Pure: fixture-backed tracker reads + plan mode only; nothing is executed.
export function dryRunFor({ createTracker, fixture, readyGhostId }) {
  const tracker = createTracker(loadFixture(fixture), { generatedAt });
  const ghost = tracker.getGhost(readyGhostId);
  const readiness = tracker.assessReadiness(readyGhostId);
  const plan = planGhostToLaunch({ ghost, tracker, branchPrefix, generatedAt, envelope: DRY_RUN_ENVELOPE });
  return { tracker, ghost, readiness, plan };
}

// Strip the tracker-specific ghost id and branch from a plan so the two
// providers collapse onto one canonical, comparable shape. Only planned-action
// targets carry id/branch text; every other field is provider-independent.
export function normalizePlan(plan, { ghostId }) {
  const branch = plan.plannedActions.find((action) => action.id === "branch")?.target ?? null;
  const normalizeTarget = (target) => {
    if (typeof target !== "string") return target;
    let out = target;
    if (branch) out = out.split(branch).join("<branch>");
    return out.split(ghostId).join("<ghost>");
  };
  return {
    ...plan,
    plannedActions: plan.plannedActions.map((action) => ({ ...action, target: normalizeTarget(action.target) })),
  };
}

// One coverage check per FN-35 acceptance element. Each returns null when the
// dry-run covers it, or a human-readable reason when it does not. Exported so
// the companion test can prove the coverage map is non-vacuous.
export const COVERAGE_CHECKS = Object.freeze([
  {
    element: "ghost/readiness resolution",
    check: ({ ghost, readiness }) => {
      if (!ghost?.id) return "ghost did not resolve to an id";
      if (ghost.state !== "ready") return `resolved ghost state is ${ghost.state}, not ready`;
      if (readiness?.ready !== true) return `readiness is not ready: ${(readiness?.reasons ?? []).join("; ")}`;
      return null;
    },
  },
  {
    element: "radar preflight",
    check: ({ plan }) => {
      const names = plan.stages.map((stage) => stage.name);
      if (names[0] !== "radar-preflight") return `first stage is ${names[0]}, not radar-preflight`;
      const missing = RADAR_STAGES.filter((stage) => !names.includes(stage));
      return missing.length ? `missing radar stages: ${missing.join(", ")}` : null;
    },
  },
  {
    element: "inserter stage",
    check: ({ plan }) =>
      plan.stages.some((stage) => stage.name === "inserter-readiness") ? null : "no inserter-readiness stage",
  },
  {
    element: "roboports topology",
    check: ({ plan }) => {
      const stage = plan.stages.find((entry) => entry.name === "roboports-implementation");
      if (!stage) return "no roboports-implementation stage";
      if (!(stage.subagents?.length >= 1)) return "roboports stage has no subagents";
      if (plan.maxSubagents !== EXPECTED_MAX_SUBAGENTS) {
        return `maxSubagents is ${plan.maxSubagents}, expected ${EXPECTED_MAX_SUBAGENTS} (min of recipe ${RECIPE_DESIRED_SUBAGENTS} and envelope cap)`;
      }
      return null;
    },
  },
  {
    element: "proof command",
    check: ({ plan }) => {
      const stage = plan.stages.find((entry) => entry.name === "proof-pass");
      if (!stage) return "no proof-pass stage";
      if (!(stage.proof?.length >= 1) || !stage.proof.every((cmd) => typeof cmd === "string" && cmd.length)) {
        return "proof-pass stage carries no proof commands";
      }
      const gated = plan.stages.some((entry) => entry.circuits?.includes(PROOF_CIRCUIT));
      return gated ? null : `no stage is gated by the ${PROOF_CIRCUIT} circuit`;
    },
  },
  {
    element: "launch policy",
    check: ({ plan }) =>
      plan.launchState === "launch-ready"
        ? null
        : `launchState is ${plan.launchState}, expected launch-ready under a no-autoMerge envelope`,
  },
  {
    element: "saved plan / metadata",
    check: ({ plan }) => {
      const result = validateRecipePlan(plan);
      if (!result.ok) return `plan is not save-ready: ${result.errors.join("; ")}`;
      if (plan.schemaVersion !== 1) return `schemaVersion is ${plan.schemaVersion}, expected 1`;
      if (plan.kind !== "recipe-plan") return `kind is ${plan.kind}, expected recipe-plan`;
      if (typeof plan.generatedAt !== "string" || !plan.generatedAt) return "missing generatedAt metadata";
      return null;
    },
  },
  {
    element: "roles/scopes/objectives",
    check: ({ plan }) => {
      const subagents = allSubagents(plan);
      if (subagents.length === 0) return "plan has no subagents";
      for (const sub of subagents) {
        if (typeof sub.role !== "string" || !sub.role) return "a subagent is missing a role";
        if (!Array.isArray(sub.scope) || sub.scope.length === 0) return `subagent ${sub.role} is missing a scope`;
        if (typeof sub.objective !== "string" || !sub.objective) return `subagent ${sub.role} is missing an objective`;
      }
      return null;
    },
  },
  {
    element: "no full prompts",
    check: ({ plan }) => {
      for (const sub of allSubagents(plan)) {
        const leaked = PROMPT_KEYS.find((key) => key in sub);
        if (leaked) return `subagent ${sub.role} carries a prompt-bearing key: ${leaked}`;
        if (typeof sub.objective === "string" && sub.objective.includes("\n")) {
          return `subagent ${sub.role} objective looks like a prompt body (contains newlines)`;
        }
      }
      return null;
    },
  },
  {
    element: "read/write scopes",
    check: ({ plan }) => {
      const subagents = allSubagents(plan);
      if (!subagents.some((sub) => Array.isArray(sub.reads) && sub.reads.length)) return "no subagent declares read scopes";
      if (!subagents.some((sub) => Array.isArray(sub.writes) && sub.writes.length)) return "no subagent declares write scopes";
      return null;
    },
  },
  {
    element: "no implementation run / live smoke",
    check: ({ plan }) => {
      const durable = plan.plannedActions.filter((action) => action.durable).map((action) => action.id).sort();
      const expected = ["branch", "pr"];
      const unexpected = durable.filter((id) => !expected.includes(id));
      if (unexpected.length) return `unexpected durable (executed-looking) actions: ${unexpected.join(", ")}`;
      const nonDurable = plan.plannedActions.filter((action) => !action.durable);
      if (!nonDurable.every((action) => action.kind === "read")) return "a non-durable action is not an inert read";
      return null;
    },
  },
]);

// Run all coverage checks for one provider's dry-run, prefixing failures with the
// provider so a single red shape is unambiguous.
export function checkCoverage(provider, context) {
  const failures = [];
  for (const { element, check } of COVERAGE_CHECKS) {
    let reason;
    try {
      reason = check(context);
    } catch (error) {
      reason = `threw ${error.message}`;
    }
    if (reason) failures.push(`${provider}/${element}: ${reason}`);
  }
  return failures;
}

function readGolden() {
  try {
    return JSON.parse(readFileSync(goldenPath, "utf8"));
  } catch {
    return null;
  }
}

// Run the end-to-end golden dry-run eval across every tracker fixture: coverage
// per provider, cross-provider parity of the normalized plan, and a match
// against the committed golden. Returns the canonical normalized plan plus the
// number of checks run and any failures.
export function runDryRunEval() {
  const failures = [];
  const runs = DRY_RUN_FIXTURES.map((fixture) => ({ fixture, ...dryRunFor(fixture) }));

  for (const run of runs) {
    failures.push(...checkCoverage(run.fixture.provider, run));
  }

  const normalized = runs.map((run) => ({
    provider: run.fixture.provider,
    plan: normalizePlan(run.plan, { ghostId: run.ghost.id }),
  }));

  // Cross-provider parity: every normalized plan must equal the first.
  const canonical = normalized[0]?.plan ?? null;
  for (const entry of normalized.slice(1)) {
    if (JSON.stringify(entry.plan) !== JSON.stringify(canonical)) {
      failures.push(`parity: ${entry.provider} normalized plan differs from ${normalized[0].provider}`);
    }
  }

  // Golden: the canonical normalized plan must match the committed fixture.
  const golden = readGolden();
  if (!golden) {
    failures.push(`golden: missing ${path.basename(goldenPath)} (regenerate with --update-golden)`);
  } else if (JSON.stringify(golden) !== JSON.stringify(canonical)) {
    failures.push(`golden: canonical dry-run plan differs from ${path.basename(goldenPath)} (review, then --update-golden if intended)`);
  }

  const checks = runs.length * COVERAGE_CHECKS.length + Math.max(0, normalized.length - 1) + 1;
  return { checks, providers: DRY_RUN_FIXTURES.length, failures, canonical };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  if (process.argv.includes("--update-golden")) {
    const runs = DRY_RUN_FIXTURES.map((fixture) => ({ fixture, ...dryRunFor(fixture) }));
    const canonical = normalizePlan(runs[0].plan, { ghostId: runs[0].ghost.id });
    writeFileSync(goldenPath, `${JSON.stringify(canonical, null, 2)}\n`);
    console.log(`Wrote golden ${path.basename(goldenPath)}`);
    process.exit(0);
  }
  try {
    const { checks, providers, failures } = runDryRunEval();
    if (failures.length) {
      console.error("Factory Nucleus ghost-to-launch dry-run eval failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log(
      `Factory Nucleus ghost-to-launch dry-run eval passed: ${checks} checks across ${providers} tracker fixtures (linear, github); plan matches golden`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
