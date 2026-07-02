import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import {
  ARTIFACT_KINDS,
  CIRCUIT_GATES,
  CIRCUIT_OUTCOMES,
  GHOST_STATES,
  artifactMetadata,
  parseYaml,
  resolveFactoryStatePaths,
  validateAdapterGhost,
  validateArtifactMetadata,
  validateCircuit,
  validateEnvelopeYaml,
  validateRecipe,
  validateRecipePlan,
  withArtifactMetadata,
} from "../scripts/factory-nucleus/schema.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

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

test("valid minimal envelope YAML validates through the schema", () => {
  const result = validateEnvelopeYaml(validEnvelopeYaml);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("parseYaml decodes JSON escapes in double-quoted scalars", () => {
  assert.deepEqual(
    parseYaml('key: "quote: \\" slash: \\\\ newline: \\n tab: \\t"\n'),
    { key: "quote: \" slash: \\ newline: \n tab: \t" },
  );
});

test("parseYaml decodes YAML single-quoted scalar quote escapes", () => {
  assert.deepEqual(parseYaml("key: 'it''s'\n"), { key: "it's" });
});

test("parseYaml rejects malformed double-quoted scalars", () => {
  assert.throws(() => parseYaml('key: "a" tail"\n'), /invalid double-quoted scalar/u);
});

test("envelope YAML keeps colon-bearing list scalars and nested array item mappings intact", () => {
  const hooksFirstCircuitYaml = validEnvelopeYaml.replace(`  - name: proof-required
    gate: proof
    outcome: block
    enforcement: validate`, `  - hooks:
      - name: proof-pass
        surface: proof
    name: proof-required
    gate: proof
    outcome: block
    enforcement: validate`);
  const result = validateEnvelopeYaml(hooksFirstCircuitYaml);
  assert.equal(result.ok, true, result.errors.join("\n"));
});

test("envelope YAML rejects duplicate array item keys instead of overwriting", () => {
  const duplicateCircuitKeyYaml = validEnvelopeYaml.replace(`  - name: proof-required
    gate: proof
    outcome: block
    enforcement: validate`, `  - name: proof-required
    name: tracker-bound
    gate: proof
    outcome: block
    enforcement: validate`);
  const result = validateEnvelopeYaml(duplicateCircuitKeyYaml);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("duplicate key 'name'")), result.errors.join("\n"));
});

test("malformed, unknown, and unsafe envelope config fails clearly", () => {
  assert.deepEqual(validateEnvelopeYaml("schemaVersion 1").ok, false);

  const unknown = validateEnvelopeYaml(`${validEnvelopeYaml}\nextraPolicy: nope\n`);
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((error) => error.includes("unknown property")), unknown.errors.join("\n"));

  const unsafe = validateEnvelopeYaml(`${validEnvelopeYaml}\napiToken: nope\n`);
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.errors.some((error) => error.includes("secret-bearing keys")), unsafe.errors.join("\n"));

  const missingLinearContext = validateEnvelopeYaml(
    validEnvelopeYaml.replace("  team: Loom\n  project: Factory Nucleus\n", ""),
  );
  assert.equal(missingLinearContext.ok, false);
  assert.ok(missingLinearContext.errors.some((error) => error.includes("$.tracker.team")), missingLinearContext.errors.join("\n"));
  assert.ok(missingLinearContext.errors.some((error) => error.includes("$.tracker.project")), missingLinearContext.errors.join("\n"));
});

const proofCircuit = withArtifactMetadata("circuit", {
  name: "proof-required",
  gate: "proof",
  outcome: "block",
  enforcement: "validate",
  hooks: [{ name: "proof-pass", surface: "proof" }],
}, generatedAt);

const mergeCircuit = withArtifactMetadata("circuit", {
  name: "merge-escalation",
  gate: "merge",
  outcome: "escalate",
  enforcement: "runtime-hook",
  reason: "auto-merge is not enabled in the envelope",
}, generatedAt);

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

const recipePlan = withArtifactMetadata("recipe-plan", {
  recipe: "ghost-to-launch",
  mode: "plan",
  stages: [
    {
      name: "build-issue",
      status: "planned",
      circuits: ["proof-required"],
      proof: ["node --test tests/factory-nucleus-schema.test.mjs"],
      plannedActions: ["branch", "pr"],
    },
  ],
  plannedActions: [
    { id: "branch", kind: "branch", target: "LOO-41", durable: true },
    { id: "pr", kind: "pr", target: "LOO-41", durable: true },
  ],
}, generatedAt);

test("recipe and generated recipe-plan schemas validate ghost-to-launch fixtures", () => {
  assert.equal(validateRecipe(recipe).ok, true, validateRecipe(recipe).errors.join("\n"));
  assert.equal(validateRecipePlan(recipePlan).ok, true, validateRecipePlan(recipePlan).errors.join("\n"));
});

test("recipe plan requires a proof circuit", () => {
  assert.equal(validateRecipePlan(recipePlan).ok, true, validateRecipePlan(recipePlan).errors.join("\n"));

  const withoutProof = {
    ...recipePlan,
    stages: recipePlan.stages.map((stage) => ({ ...stage, circuits: ["branch-isolated"] })),
  };
  const result = validateRecipePlan(withoutProof);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("proof")), result.errors.join("\n"));
});

test("recipe-plan launchState is optional and enum-checked", () => {
  assert.equal(validateRecipePlan({ ...recipePlan, launchState: "launch-ready" }).ok, true);
  assert.equal(validateRecipePlan({ ...recipePlan, launchState: "launched" }).ok, true);
  assert.equal(validateRecipePlan({ ...recipePlan, launchState: "merged" }).ok, false);
  assert.equal(validateRecipePlan(recipePlan).ok, true);
});

test("recipe-plan maxSubagents is optional and minimum 0", () => {
  assert.equal(validateRecipePlan({ ...recipePlan, maxSubagents: 2 }).ok, true);
  assert.equal(validateRecipePlan({ ...recipePlan, maxSubagents: -1 }).ok, false);
  assert.equal(validateRecipePlan(recipePlan).ok, true);
});

test("recipe-plan stages carry optional subagent role/scope/objective and reject prompt bodies", () => {
  const withSubagents = {
    ...recipePlan,
    stages: [{ ...recipePlan.stages[0], subagents: [{ role: "implementer", scope: ["tests"], objective: "do x" }] }],
  };
  const okResult = validateRecipePlan(withSubagents);
  assert.equal(okResult.ok, true, okResult.errors.join("\n"));

  const withPromptBody = {
    ...recipePlan,
    stages: [{ ...recipePlan.stages[0], subagents: [{ role: "implementer", scope: ["tests"], objective: "do x", prompt: "You are an implementer; do everything." }] }],
  };
  const promptResult = validateRecipePlan(withPromptBody);
  assert.equal(promptResult.ok, false);
  assert.ok(promptResult.errors.some((error) => error.includes("subagents[0].prompt") && error.includes("unknown property")), promptResult.errors.join("\n"));

  const missingObjective = {
    ...recipePlan,
    stages: [{ ...recipePlan.stages[0], subagents: [{ role: "implementer", scope: ["tests"] }] }],
  };
  const missingResult = validateRecipePlan(missingObjective);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some((error) => error.includes("subagents[0].objective") && error.includes("required")), missingResult.errors.join("\n"));
});

test("recipe-plan subagent reads/writes and stage writeConflicts validate; unknown subagent field rejected", () => {
  const withScopes = {
    ...recipePlan,
    stages: [{
      ...recipePlan.stages[0],
      writeConflicts: ["b"],
      subagents: [{ role: "implementer", scope: ["tests"], objective: "do x", reads: ["a"], writes: ["b"] }],
    }],
  };
  const okResult = validateRecipePlan(withScopes);
  assert.equal(okResult.ok, true, okResult.errors.join("\n"));

  const unknownField = {
    ...recipePlan,
    stages: [{ ...recipePlan.stages[0], subagents: [{ role: "implementer", scope: ["tests"], objective: "do x", danger: "x" }] }],
  };
  const unknownResult = validateRecipePlan(unknownField);
  assert.equal(unknownResult.ok, false);
  assert.ok(unknownResult.errors.some((error) => error.includes("subagents[0].danger") && error.includes("unknown property")), unknownResult.errors.join("\n"));
});

test("recipe stages and recipe-plan stages reject dangling references", () => {
  const danglingCircuitRecipe = {
    ...recipe,
    stages: [{ ...recipe.stages[0], circuits: ["missing-circuit"] }, recipe.stages[1]],
  };
  const recipeResult = validateRecipe(danglingCircuitRecipe);
  assert.equal(recipeResult.ok, false);
  assert.ok(recipeResult.errors.some((error) => error.includes("unknown circuit missing-circuit")), recipeResult.errors.join("\n"));

  const danglingActionPlan = {
    ...recipePlan,
    stages: [{ ...recipePlan.stages[0], plannedActions: ["missing-action"] }],
  };
  const planResult = validateRecipePlan(danglingActionPlan);
  assert.equal(planResult.ok, false);
  assert.ok(planResult.errors.some((error) => error.includes("unknown planned action missing-action")), planResult.errors.join("\n"));
});

test("recipes missing stages or circuits fail validation", () => {
  assert.equal(validateRecipe({ ...recipe, stages: [] }).ok, false);
  const missingCircuits = { ...recipe };
  delete missingCircuits.circuits;
  const result = validateRecipe(missingCircuits);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("$.circuits: required")), result.errors.join("\n"));
});

test("circuit schema covers protected surfaces, proof, branch, tracker, and merge gates", () => {
  assert.deepEqual(CIRCUIT_GATES, ["protected-surface", "proof", "branch", "tracker", "merge"]);
  assert.deepEqual(CIRCUIT_OUTCOMES, ["allow", "block", "escalate"]);
  for (const gate of CIRCUIT_GATES) {
    for (const outcome of CIRCUIT_OUTCOMES) {
      const result = validateCircuit(withArtifactMetadata("circuit", {
        name: `${gate}-${outcome}`,
        gate,
        outcome,
        enforcement: outcome === "allow" ? "validate" : "runtime-hook",
      }, generatedAt));
      assert.equal(result.ok, true, result.errors.join("\n"));
    }
  }
  assert.equal(validateCircuit(proofCircuit).ok, true);
  assert.equal(validateCircuit(mergeCircuit).ok, true);
});

test("local factory state separates durable envelope from refreshable state outside target repos", () => {
  const homeDir = path.join(path.sep, "tmp", "loom-home");
  const targetRepoPath = path.join(homeDir, "work", "target-repo");
  const state = resolveFactoryStatePaths({ homeDir, targetRepoPath, factoryId: "Factory Nucleus", generatedAt });
  assert.equal(state.kind, "local-state");
  assert.ok(state.root.startsWith(path.join(homeDir, ".loom", "factory-nucleus")));
  const relativeToTarget = path.relative(targetRepoPath, state.root);
  assert.ok(relativeToTarget.startsWith("..") || path.isAbsolute(relativeToTarget), relativeToTarget);
  assert.match(state.envelope, /envelope\/envelope\.yaml$/u);
  assert.match(state.scan, /scan\/latest\.json$/u);
  assert.match(state.radar, /radar\/latest\.json$/u);
  assert.match(state.plans, /plans$/u);
  assert.match(state.runs, /runs$/u);
  assert.equal(state.transcripts.saveByDefault, false);
  assert.throws(
    () => resolveFactoryStatePaths({ homeDir: targetRepoPath, targetRepoPath, factoryId: "bad" }),
    /outside the target repo/u,
  );
});

test("structured artifact metadata is required and generated consistently", () => {
  for (const kind of ARTIFACT_KINDS) {
    const metadata = artifactMetadata(kind, generatedAt);
    assert.deepEqual(metadata, { schemaVersion: 1, kind, generatedAt });
    assert.equal(validateArtifactMetadata(metadata, kind).ok, true);
  }
  const stamped = withArtifactMetadata("recipe", { schemaVersion: 99, kind: "envelope", generatedAt: "1999-01-01T00:00:00.000Z" }, generatedAt);
  assert.deepEqual(stamped, { schemaVersion: 1, kind: "recipe", generatedAt });

  const missing = validateArtifactMetadata({ schemaVersion: 1, kind: "factory-scan" }, "factory-scan");
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes("$.generatedAt: required")), missing.errors.join("\n"));
});

test("adapter-ghost schema validates neutral ghost shape and rejects unsafe or unknown fields", () => {
  assert.deepEqual(GHOST_STATES, ["triage", "backlog", "ready", "in-progress", "in-review", "done", "canceled"]);

  const validGhost = withArtifactMetadata("adapter-ghost", {
    id: "G-1",
    title: "Add tracker bind",
    state: "ready",
    projectId: "PRJ-1",
    labels: ["feature"],
    dependsOn: [],
    blocks: ["G-2"],
  }, generatedAt);
  assert.equal(validateAdapterGhost(validGhost).ok, true, validateAdapterGhost(validGhost).errors.join("\n"));

  const missingProject = withArtifactMetadata("adapter-ghost", {
    id: "G-1",
    title: "No project",
    state: "ready",
    labels: [],
    dependsOn: [],
    blocks: [],
  }, generatedAt);
  const missing = validateAdapterGhost(missingProject);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((error) => error.includes("$.projectId: required")), missing.errors.join("\n"));

  const unknownState = validateAdapterGhost({ ...validGhost, state: "shipped" });
  assert.equal(unknownState.ok, false);
  assert.ok(unknownState.errors.some((error) => error.includes("$.state")), unknownState.errors.join("\n"));

  const unknownProperty = validateAdapterGhost({ ...validGhost, tracker: "linear" });
  assert.equal(unknownProperty.ok, false);
  assert.ok(unknownProperty.errors.some((error) => error.includes("$.tracker: unknown property")), unknownProperty.errors.join("\n"));

  const secretLabel = validateAdapterGhost({ ...validGhost, labels: ["ghp_0123456789abcdef0123"] });
  assert.equal(secretLabel.ok, false);
  assert.ok(secretLabel.errors.some((error) => error.includes("secret-looking")), secretLabel.errors.join("\n"));
});
