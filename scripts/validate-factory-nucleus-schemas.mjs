#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LOCAL_STATE_SCHEMA,
  resolveFactoryStatePaths,
  validateArtifact,
  validateCircuit,
  validateEnvelopeYaml,
  validateRadarCheck,
  validateRecipe,
  validateRunSummary,
  withArtifactMetadata,
} from "./factory-nucleus/schema.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

export const SHAPES = Object.freeze([
  "envelope",
  "local-state",
  "recipe",
  "circuit",
  "radar-check",
  "run-summary",
]);

function omit(object, key) {
  const { [key]: _removed, ...rest } = object;
  return rest;
}

// --- Valid fixtures (mirror tests/factory-nucleus-schema.test.mjs) ---

const validEnvelopeYaml = `
schemaVersion: 1
kind: envelope
generatedAt: "${generatedAt}"
factory:
  id: loom
  repo:
    name: loom
    root: .
tracker:
  provider: linear
  team: Loom
  project: Factory Nucleus
delivery:
  defaultBranch: main
  branchPrefix: dylanmccavitt2015
  autoMerge: false
proof:
  commands:
    - npm run test:unit
agents:
  maxSubagents: 4
  allowFullTranscriptCapture: false
circuits:
  - name: proof-required
    gate: proof
    outcome: block
    enforcement: validate
`;

const homeDir = path.join(path.sep, "tmp", "loom-home");
const targetRepoPath = path.join(homeDir, "work", "target-repo");
const localState = resolveFactoryStatePaths({
  homeDir,
  targetRepoPath,
  factoryId: "Factory Nucleus",
  generatedAt,
});

const recipe = withArtifactMetadata("recipe", {
  name: "ghost-to-launch",
  mode: "plan",
  stages: [
    {
      name: "route-ready-ghost",
      agent: "inserter",
      scopes: ["tracker"],
      circuits: ["tracker-bound"],
      actions: ["confirm ready-for-agent"],
    },
    {
      name: "build-issue",
      agent: "roboports",
      scopes: ["repo"],
      circuits: ["proof-required"],
      proof: ["targeted checks"],
      actions: ["branch", "test", "pr"],
    },
  ],
  circuits: [
    { name: "tracker-bound", gate: "tracker", outcome: "block", enforcement: "validate" },
    { name: "proof-required", gate: "proof", outcome: "block", enforcement: "validate" },
  ],
}, generatedAt);

const circuit = withArtifactMetadata("circuit", {
  name: "proof-required",
  gate: "proof",
  outcome: "block",
  enforcement: "validate",
  hooks: [{ name: "proof-pass", surface: "proof" }],
}, generatedAt);

const radarCheck = withArtifactMetadata("radar-check", {
  driftClass: "none",
  affectedGhosts: [],
  suggestedSyncActions: [],
  suggestedRoute: "rocket-launch",
  evidence: [],
}, generatedAt);

const runSummary = withArtifactMetadata("run-summary", {
  proof: ["npm test"],
  result: "passed",
  gaps: [],
}, generatedAt);

// Assembled at runtime so no secret-shaped literal is committed to tracked
// source: the repo safety gate (scripts/dry-run-harness-safety-gate.mjs) scans
// tracked files and rejects secret-looking text. The runtime string still trips
// schema.mjs's secret-value detection (gh[pousr]_ needs no trailing length).
const leakySecretValue = ["ghp", "z".repeat(36)].join("_");

// --- Eval matrix: each listed shape gets >=1 valid + >=1 invalid case. ---
// Invalid cases cover the two acceptance pillars: missing required metadata,
// and unsafe policy fields (enum/const/secret) where applicable.

export const EVAL_CASES = Object.freeze([
  // envelope (YAML text in, validated through ENVELOPE_SCHEMA)
  { shape: "envelope", label: "valid envelope", expect: "valid", run: () => validateEnvelopeYaml(validEnvelopeYaml) },
  {
    shape: "envelope",
    label: "missing schemaVersion metadata",
    expect: "invalid",
    errorIncludes: "schemaVersion: required",
    run: () => validateEnvelopeYaml(validEnvelopeYaml.replace("schemaVersion: 1\n", "")),
  },
  {
    shape: "envelope",
    label: "secret-bearing config key",
    expect: "invalid",
    errorIncludes: "secret-bearing keys",
    run: () => validateEnvelopeYaml(`${validEnvelopeYaml}\napiToken: nope\n`),
  },
  {
    shape: "envelope",
    label: "unknown policy property",
    expect: "invalid",
    errorIncludes: "unknown property",
    run: () => validateEnvelopeYaml(`${validEnvelopeYaml}\nextraPolicy: nope\n`),
  },

  // local-state (validateArtifact against LOCAL_STATE_SCHEMA)
  { shape: "local-state", label: "valid local state", expect: "valid", run: () => validateArtifact(localState, LOCAL_STATE_SCHEMA) },
  {
    shape: "local-state",
    label: "missing schemaVersion metadata",
    expect: "invalid",
    errorIncludes: "schemaVersion: required",
    run: () => validateArtifact(omit(localState, "schemaVersion"), LOCAL_STATE_SCHEMA),
  },
  {
    shape: "local-state",
    label: "transcript capture flipped on (const:false)",
    expect: "invalid",
    errorIncludes: "expected false",
    run: () => validateArtifact(
      { ...localState, transcripts: { ...localState.transcripts, saveByDefault: true } },
      LOCAL_STATE_SCHEMA,
    ),
  },
  {
    shape: "local-state",
    label: "unknown top-level property",
    expect: "invalid",
    errorIncludes: "unknown property",
    run: () => validateArtifact({ ...localState, surprise: "nope" }, LOCAL_STATE_SCHEMA),
  },

  // recipe (validateRecipe)
  { shape: "recipe", label: "valid recipe", expect: "valid", run: () => validateRecipe(recipe) },
  {
    shape: "recipe",
    label: "missing generatedAt metadata",
    expect: "invalid",
    errorIncludes: "generatedAt: required",
    run: () => validateRecipe(omit(recipe, "generatedAt")),
  },
  {
    shape: "recipe",
    label: "missing circuits structure",
    expect: "invalid",
    errorIncludes: "circuits: required",
    run: () => validateRecipe(omit(recipe, "circuits")),
  },

  // circuit (validateCircuit)
  { shape: "circuit", label: "valid circuit", expect: "valid", run: () => validateCircuit(circuit) },
  {
    shape: "circuit",
    label: "missing kind metadata",
    expect: "invalid",
    errorIncludes: "kind: required",
    run: () => validateCircuit(omit(circuit, "kind")),
  },
  {
    shape: "circuit",
    label: "outcome outside the allowed enum",
    expect: "invalid",
    errorIncludes: "expected one of",
    run: () => validateCircuit(withArtifactMetadata("circuit", {
      name: "bad-outcome",
      gate: "proof",
      outcome: "ignore",
      enforcement: "validate",
    }, generatedAt)),
  },

  // radar-check (validateRadarCheck)
  { shape: "radar-check", label: "valid radar check", expect: "valid", run: () => validateRadarCheck(radarCheck) },
  {
    shape: "radar-check",
    label: "missing schemaVersion metadata",
    expect: "invalid",
    errorIncludes: "schemaVersion: required",
    run: () => validateRadarCheck(omit(radarCheck, "schemaVersion")),
  },
  {
    shape: "radar-check",
    label: "driftClass outside the allowed enum",
    expect: "invalid",
    errorIncludes: "expected one of",
    run: () => validateRadarCheck(withArtifactMetadata("radar-check", {
      driftClass: "catastrophic",
      affectedGhosts: [],
      suggestedSyncActions: [],
      suggestedRoute: "rocket-launch",
      evidence: [],
    }, generatedAt)),
  },

  // run-summary (validateRunSummary)
  { shape: "run-summary", label: "valid run summary", expect: "valid", run: () => validateRunSummary(runSummary) },
  {
    shape: "run-summary",
    label: "missing generatedAt metadata",
    expect: "invalid",
    errorIncludes: "generatedAt: required",
    run: () => validateRunSummary(omit(runSummary, "generatedAt")),
  },
  {
    shape: "run-summary",
    label: "secret-looking value in proof",
    expect: "invalid",
    errorIncludes: "secret-looking values",
    run: () => validateRunSummary(withArtifactMetadata("run-summary", {
      proof: [leakySecretValue],
      result: "passed",
      gaps: [],
    }, generatedAt)),
  },
]);

// Compare a single case's actual validation result against its expectation.
// Returns a human-readable failure string, or null when the case holds.
// Exported so the companion test can prove the harness is non-vacuous.
export function checkCase(evalCase) {
  const { shape, label, expect, errorIncludes } = evalCase;
  let result;
  try {
    result = evalCase.run();
  } catch (error) {
    return `${shape}/${label}: run() threw ${error.message}`;
  }
  const wantOk = expect === "valid";
  if (result.ok !== wantOk) {
    const detail = result.errors?.length ? ` (${result.errors.join("; ")})` : "";
    return `${shape}/${label}: expected ${expect}, got ok=${result.ok}${detail}`;
  }
  if (!wantOk && errorIncludes && !result.errors.some((error) => error.includes(errorIncludes))) {
    return `${shape}/${label}: expected an error containing "${errorIncludes}", got: ${result.errors.join("; ")}`;
  }
  return null;
}

export function runSchemaEvals() {
  const failures = [];
  for (const evalCase of EVAL_CASES) {
    const failure = checkCase(evalCase);
    if (failure) failures.push(failure);
  }
  return { checked: EVAL_CASES.length, failures };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    const { checked, failures } = runSchemaEvals();
    if (failures.length) {
      console.error("Factory Nucleus schema evals failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log(
      `Factory Nucleus schema evals passed: ${checked} cases across ${SHAPES.length} shapes (valid + invalid fixtures)`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
