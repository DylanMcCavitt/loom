import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const contract = JSON.parse(readFileSync(new URL("../nucleus/agents/shared-nucleus-agents.json", import.meta.url), "utf8"));
const markdown = readFileSync(new URL("../nucleus/agents/shared-nucleus-agents.md", import.meta.url), "utf8");

const EXPECTED_ROSTER = [
  "blueprint",
  "roboports",
  "biters",
  "lab",
  "repair-pack",
  "rocket-launch",
  "belt",
];

const REQUEST_MODES = ["shape", "implement", "review", "prove", "repair", "launch"];
const AGENT_NAMES = new Set(EXPECTED_ROSTER);
const EXPECTED_ABSORBED_AGENTS = {
  ghosts: "blueprint lens issue-decomposition",
  "main-bus": "blueprint lens architecture",
  "science-pack": "blueprint lens research-spike",
  research: "blueprint lens research-spike",
  inserter: "blueprint lens triage",
  recycler: "roboports lens refactor",
  quality: "roboports lens refactor",
  modules: "roboports lens performance",
  "pr-review": "biters lens correctness",
  spitters: "biters lens security",
  "bus-first": "biters lens minimal-diff",
  radar: "biters lens drift",
  spidertron: "lab lens ui-proof",
  "proof-pass": "lab lens smoke-proof",
  handoff: "belt lens handoff",
  "thread-control": "belt lens thread-control",
  "resume-thread": "belt lens resume",
};
const REQUIRED_RULE_FIELDS = [
  "status",
  "scope",
  "rule",
  "why",
  "exceptions",
  "source",
  "badExample",
  "goodExample",
  "assumptions",
  "openDecisions",
];
const FORBIDDEN_PREFIXES = ["omp-", "codex-", "claude-"];

test("shared nucleus agent contract records the canonical Factorio roster", () => {
  assert.equal(contract.schemaVersion, 7);
  assert.equal(contract.status, "canonical-repo-source-ready");
  assert.deepEqual(contract.agents.map((agent) => agent.name), EXPECTED_ROSTER);
  assert.equal(new Set(contract.agents.map((agent) => agent.name)).size, EXPECTED_ROSTER.length);
});

test("contract adapts the Vercel article into per-agent skill packages", () => {
  assert.equal(contract.sourcePattern.url, "https://vercel.com/blog/teaching-agents-product-design-at-vercel");
  assert.match(contract.repositoryStructure.mappingDecision, /per canonical nucleus agent/u);
  assert.equal(contract.repositoryStructure.perAgentSkillPackage.pathTemplate, "nucleus/skills/{agent-name}/");
  for (const file of ["AGENTS.md", "SKILL.md", "references/coverage-gaps.md"]) {
    assert.ok(contract.repositoryStructure.perAgentSkillPackage.requiredFiles.includes(file), `${file} must be required`);
  }
  for (const section of ["Operating Contract", "Request Modes", "Decision Authority", "Workflow", "Skill Integrity"]) {
    assert.ok(contract.repositoryStructure.perAgentSkillPackage.skillMdSections.includes(section), `${section} must be required`);
  }
  assert.match(markdown, /https:\/\/vercel\.com\/blog\/teaching-agents-product-design-at-vercel/u);
  assert.match(markdown, /one Vercel-shaped skill package per canonical nucleus agent/u);
});

test("canonical agent names are shared and never harness-prefixed", () => {
  assert.equal(contract.namingRules.canonicalNamesAreSharedAcrossHarnesses, true);
  assert.equal(contract.namingRules.directOmpBundledRolePortsAreSuperseded, true);
  for (const agent of contract.agents) {
    for (const prefix of FORBIDDEN_PREFIXES) {
      assert.ok(!agent.name.startsWith(prefix), `${agent.name} must not use ${prefix}`);
    }
    assert.doesNotMatch(agent.name, /^omp-(designer|planner|reviewer|librarian)$/u);
  }
});

test("request modes are explicit and bounded", () => {
  assert.deepEqual(contract.requestModes.map((entry) => entry.mode), REQUEST_MODES);
  for (const entry of contract.requestModes) {
    assert.ok(entry.typicalRequest, `${entry.mode} missing typical request`);
    assert.ok(entry.requiredBehavior, `${entry.mode} missing required behavior`);
  }
  assert.match(markdown, /\| `shape` \|/u);
  assert.match(markdown, /\| `launch` \|/u);
});

test("delegation policy bounds autonomous waves and forbidden actions", () => {
  assert.equal(contract.delegationPolicy.maxDepth, 3);
  assert.match(contract.delegationPolicy.parentIntegrationOwnership, /parent/u);
  for (const stop of ["max depth reached", "coverage gap blocks a rule, standard, or source needed for the next step"]) {
    assert.ok(contract.delegationPolicy.hardStops.includes(stop), `${stop} must be a hard stop`);
  }
  assert.ok(!contract.delegationPolicy.hardStops.some((stop) => /outside the launch gate/u.test(stop)));
  for (const action of ["merge PRs", "close Linear issues", "apply generated files to live HOME"]) {
    assert.ok(contract.delegationPolicy.forbiddenAutonomousActions.includes(action), `${action} must be forbidden`);
  }
});

test("delegation modes define allowed next agents and boundaries", () => {
  assert.deepEqual(contract.delegationModes.map((entry) => entry.mode), REQUEST_MODES);
  for (const entry of contract.delegationModes) {
    assert.ok(entry.allowedNextAgents.length > 0, `${entry.mode} missing allowed next agents`);
    assert.ok(entry.allowedNextAgents.every((agent) => AGENT_NAMES.has(agent)), `${entry.mode} has unknown child`);
    assert.ok(entry.forbiddenActions.length > 0, `${entry.mode} missing forbidden actions`);
    assert.ok(entry.advanceRule, `${entry.mode} missing advance rule`);
  }
  const allowedByMode = Object.fromEntries(contract.delegationModes.map((entry) => [entry.mode, entry.allowedNextAgents]));
  assert.deepEqual(allowedByMode.shape, ["blueprint", "belt"]);
  assert.deepEqual(allowedByMode.implement, ["roboports", "lab", "biters", "repair-pack", "belt"]);
  assert.deepEqual(allowedByMode.review, ["biters", "belt"]);
  assert.deepEqual(allowedByMode.prove, ["lab", "belt"]);
  assert.deepEqual(allowedByMode.repair, ["repair-pack", "lab"]);
  assert.deepEqual(allowedByMode.launch, ["rocket-launch", "lab", "belt"]);
  const launch = contract.delegationModes.find((entry) => entry.mode === "launch");
  assert.ok(launch.allowedNextAgents.includes("rocket-launch"));
  for (const action of ["merge PRs", "close Linear issues", "live HOME apply", "native agent rendering"]) {
    assert.ok(launch.forbiddenActions.includes(action), `${action} must be forbidden in launch mode`);
  }
});

test("workflow transitions record orchestrator state and stop reasons", () => {
  for (const field of ["parentAgent", "childAgents", "issueOrPr", "mode", "scope", "loadedReferences", "allowedNextAgents", "proofState", "stopReason"]) {
    assert.ok(contract.workflowTransitions.requiredFields.includes(field), `${field} transition field required`);
  }
  for (const state of ["planned", "passed", "failed", "blocked"]) {
    assert.ok(contract.workflowTransitions.proofStates.includes(state), `${state} proof state required`);
  }
  assert.ok(contract.workflowTransitions.stopReasons.includes("coverage-gap"));
  assert.match(markdown, /Every wave transition records parent, child agents, issue\/PR id/u);
});

test("per-agent delegation lists are bounded to the canonical roster", () => {
  assert.deepEqual(Object.keys(contract.agentDelegation), EXPECTED_ROSTER);
  const waveAdvancers = [];
  for (const [agent, delegation] of Object.entries(contract.agentDelegation)) {
    assert.ok(AGENT_NAMES.has(agent), `${agent} must be canonical`);
    assert.ok(delegation.allowedChildren.every((child) => AGENT_NAMES.has(child)), `${agent} has unknown child`);
    assert.equal(typeof delegation.mayAdvanceNextWave, "boolean", `${agent} missing wave authority`);
    if (delegation.mayAdvanceNextWave) waveAdvancers.push(agent);
  }
  assert.deepEqual(waveAdvancers, ["blueprint", "roboports", "repair-pack", "rocket-launch"]);
  assert.deepEqual(contract.agentDelegation.lab.allowedChildren, []);
  assert.deepEqual(contract.agentDelegation.roboports.orderedWaves, [["lab", "biters"], ["biters"], ["repair-pack"], ["lab"]]);
  const rocketLaunch = contract.agents.find((agent) => agent.name === "rocket-launch");
  assert.ok(!rocketLaunch.outputPacket.includes("merge result"));
  assert.ok(!rocketLaunch.outputPacket.includes("tracker closeout"));
  assert.ok(rocketLaunch.outputPacket.includes("tracker bridge evidence"));
});

test("repair-pack defines its Vercel-shaped package and repair-only mode", () => {
  const repairPack = contract.repairPack;
  assert.equal(repairPack.packageShape.path, "nucleus/skills/repair-pack/");
  for (const file of [
    "AGENTS.md",
    "SKILL.md",
    "references/repair-pack.md",
    "references/rules.md",
    "references/coverage-gaps.md",
  ]) {
    assert.ok(repairPack.packageShape.requiredFiles.includes(file), `${file} must be required`);
  }
  assert.ok(repairPack.packageShape.requiredDirectories.includes("exemplars/"));
  assert.deepEqual(repairPack.supportedModes, ["repair"]);
  assert.equal(repairPack.optionalDelegatedModes.length, 1);
  assert.equal(repairPack.optionalDelegatedModes[0].mode, "prove");
  assert.equal(repairPack.optionalDelegatedModes[0].agent, "lab");
  assert.match(repairPack.optionalDelegatedModes[0].condition, /named proof check/u);

  const repairAgent = contract.agents.find((agent) => agent.name === "repair-pack");
  assert.deepEqual(repairAgent.modes, ["repair"]);
  assert.deepEqual(repairAgent.preferredChildren, ["lab"]);
  assert.ok(repairAgent.references.includes("repair-pack"));
  assert.ok(repairAgent.references.includes("coverage-gaps"));
  assert.ok(repairAgent.nonGoals.some((goal) => /native agent files or eval harnesses/u.test(goal)));
  assert.match(markdown, /nucleus\/skills\/repair-pack\//u);
  assert.match(markdown, /supports only `repair` mode/u);
});

test("repair-pack finding packets are concrete and closed-scope", () => {
  const requiredFields = contract.repairPack.findingPacketSchema.requiredFields;
  for (const field of [
    "file",
    "symbol",
    "scope",
    "concreteRisk",
    "minimalExpectedFix",
    "proofCheck",
    "ruleOrSourceId",
    "nonGoals",
    "allowedFiles",
  ]) {
    assert.ok(requiredFields.includes(field), `${field} must be required`);
  }
  assert.match(contract.repairPack.findingPacketSchema.allowedFiles, /Closed list/u);
  assert.match(contract.repairPack.findingPacketSchema.concreteRisk, /Observed failure mode/u);
  assert.match(markdown, /finding packet/u);
  for (const token of ["file", "symbol", "scope", "concrete risk", "proof check", "allowed files"]) {
    assert.match(markdown, new RegExp(token, "u"));
  }
});

test("repair-pack rules and delegation forbid broad fixer swarms", () => {
  assert.ok(contract.repairPack.rules.some((rule) => /exactly one concrete finding/u.test(rule)));
  assert.ok(contract.repairPack.rules.some((rule) => /fresh compact context/u.test(rule)));
  assert.ok(contract.repairPack.rules.some((rule) => /Refuse drive-by cleanup/u.test(rule)));
  assert.ok(contract.repairPack.rules.some((rule) => /Do not spawn broad workflow agents/u.test(rule)));
  assert.deepEqual(contract.repairPack.delegation.allowedChildren, ["lab"]);
  assert.deepEqual(contract.repairPack.delegation.allowedChildModes, ["prove"]);
  assert.equal(contract.repairPack.delegation.maxChildDepth, 1);
  assert.deepEqual(contract.agentDelegation["repair-pack"].allowedChildren, ["lab"]);
  assert.equal(contract.agentDelegation["repair-pack"].maxChildDepth, 1);
  const repairMode = contract.delegationModes.find((entry) => entry.mode === "repair");
  assert.deepEqual(repairMode.allowedNextAgents, ["repair-pack", "lab"]);
  assert.ok(repairMode.forbiddenActions.includes("spawn review agents"));
  assert.match(markdown, /delegate only .*`lab`/u);
});

test("repair-pack post-fix loop routes proof, minimal-diff recheck, and implementer consultation", () => {
  assert.ok(contract.repairPack.postFixLoop.some((step) => /minimal fix inside allowed files/u.test(step)));
  assert.ok(contract.repairPack.postFixLoop.some((step) => /lab reruns the named proof/u.test(step)));
  assert.ok(contract.repairPack.postFixLoop.some((step) => /biters minimal-diff lens only when the diff changed/u.test(step)));
  assert.ok(contract.repairPack.postFixLoop.some((step) => /coordinator integrates/u.test(step)));
  assert.match(contract.repairPack.originalImplementerPolicy.avoidByDefault, /fresh context reduces anchoring/u);
  assert.ok(contract.repairPack.originalImplementerPolicy.consultWhen.some((condition) => /undocumented intent/u.test(condition)));
  assert.ok(contract.repairPack.originalImplementerPolicy.consultWhen.some((condition) => /allowed files are insufficient/u.test(condition)));
  assert.match(contract.repairPack.originalImplementerPolicy.consultHow, /one narrow question/u);
  assert.match(markdown, /The original implementer is avoided by default/u);
});

test("parallel fanout, roboports loop, and coverage gaps are explicit", () => {
  assert.ok(contract.parallelFanout.reviewProofLenses.includes("security"));
  assert.match(contract.parallelFanout.writeScopes, /disjoint files/u);
  assert.ok(contract.roboportsDAG.sequence.some((step) => /fan out lab and biters across proof and review lenses/u.test(step)));
  assert.ok(contract.roboportsDAG.sequence.some((step) => /biters minimal-diff lens after the first proof\/review wave/u.test(step)));
  assert.match(contract.roboportsDAG.loopBack, /repair-pack returns to lab/u);
  assert.match(contract.coverageGapPolicy.defaultAction, /stop or route/u);
  assert.ok(contract.coverageGapPolicy.routes.some((route) => /references\/coverage-gaps\.md/u.test(route)));
  assert.match(markdown, /Coverage gaps stop or route work/u);
});

test("routing has ordered load, skip, and decision-authority sources", () => {
  assert.ok(contract.routing.loadOrder.length >= 5);
  assert.equal(contract.routing.loadOrder[0], "root AGENTS.md and active issue/PR");
  assert.match(contract.routing.loadOrder[1], /agent-specific SKILL\.md/u);
  assert.ok(contract.routing.skipSurfaces.length > 0);
  assert.ok(contract.routing.decisionAuthority.length >= 5);
  assert.match(contract.routing.decisionAuthority[0], /user's explicit goal/u);
  assert.match(contract.routing.decisionAuthority.at(-1), /heuristics/u);
});

test("skills, agents, adapters, checks, and governance have separate responsibilities", () => {
  assert.match(contract.model.skills, /routing, playbooks, triggers, guardrails, references/u);
  assert.match(contract.model.agents, /delegated specialists/u);
  assert.match(contract.model.harnessAdapters, /format translators only/u);
  assert.match(contract.model.deterministicChecks, /lint\/eval fixtures/u);
  assert.match(contract.model.humanGovernance, /human acceptance/u);
});

test("stable rules and automation policy separate deterministic checks from judgment", () => {
  assert.equal(contract.ruleSchema.idFormat, "rule/{stable-id}");
  for (const field of REQUIRED_RULE_FIELDS) {
    assert.ok(contract.ruleSchema.fields.includes(field), `${field} must be a rule field`);
  }
  assert.equal(contract.ruleSchema.stableSourceRequired, true);
  assert.equal(contract.ruleSchema.coverageGapWhenMissing, true);
  assert.ok(contract.automationPolicy.useLinterWhen.length >= 3);
  assert.ok(contract.automationPolicy.useAgentGuidanceWhen.length >= 3);
  assert.ok(contract.automationPolicy.evals.includes("trigger loading"));
  assert.ok(contract.automationPolicy.evals.includes("rule application"));
  assert.ok(contract.automationPolicy.evals.some((entry) => /holdout/u.test(entry)));
});

test("evidence intake describes the practiced retro-packet core", () => {
  assert.equal(contract.evidenceIntake.status, "practiced-core");
  assert.equal(contract.evidenceIntake.candidatePacketHome, "nucleus/retro/pr-{number}/");
  assert.match(contract.evidenceIntake.homeRationale, /not accepted skill guidance/u);
  assert.deepEqual(contract.evidenceIntake.packetKinds, [
    "decision-log",
    "exemplar-candidate",
    "rule-candidate",
    "coverage-gap-candidate",
  ]);
  for (const field of ["schemaVersion", "kind", "status", "sourcePr", "scope", "rationale", "evidence", "targetFile", "checks", "humanReview"]) {
    assert.ok(contract.evidenceIntake.packetRequiredFields.common.includes(field), `${field} must be required`);
  }
  for (const requirement of ["stable evidence", "explicit scope", "rationale", "exceptions", "human PR approval"]) {
    assert.ok(contract.evidenceIntake.acceptedChangeRequirements.includes(requirement), `${requirement} must be required`);
  }
  assert.match(contract.evidenceIntake.humanReviewGate, /retro PR is the HITL gate/u);
  assert.equal(contract.evidenceIntake.aspirationalDesign.status, "aspirational-not-enforced");
  assert.match(contract.evidenceIntake.aspirationalDesign.summary, /no validator or tool treats that machine as live/u);
});

test("every agent has bounded packet-level contract fields and routed modes", () => {
  const modeSet = new Set(REQUEST_MODES);
  for (const agent of contract.agents) {
    assert.ok(agent.role, `${agent.name} missing role`);
    assert.ok(agent.purpose, `${agent.name} missing purpose`);
    assert.ok(agent.modes.length > 0, `${agent.name} missing modes`);
    assert.ok(agent.modes.every((mode) => modeSet.has(mode)), `${agent.name} has an unknown mode`);
    assert.ok(agent.references.length > 0, `${agent.name} missing references`);
    assert.ok(agent.nonGoals.length >= 4, `${agent.name} missing non-goals`);
    assert.ok(agent.inputPacket.length > 0, `${agent.name} missing input packet`);
    assert.ok(agent.outputPacket.length > 0, `${agent.name} missing output packet`);
    assert.ok(agent.nonGoals.some((goal) => /Do not live-apply to real HOME/u.test(goal)), `${agent.name} missing live-HOME guard`);
  }
});

test("lens policy selects packet-named lens references without widening scope", () => {
  assert.equal(contract.lensPolicy.packetField, "lens");
  assert.match(contract.lensPolicy.loading, /Only the named lens references load/u);
  assert.match(contract.lensPolicy.boundaries, /never widen packet scope/u);
  for (const agent of contract.agents) {
    if (!agent.lenses) continue;
    assert.ok(agent.lenses.available.includes(agent.lenses.default), `${agent.name} default lens must be available`);
  }
  const lensed = contract.agents.filter((agent) => agent.lenses).map((agent) => agent.name);
  assert.deepEqual(lensed, ["blueprint", "roboports", "biters", "lab", "belt"]);
});

test("absorbed agents map to consolidated roster lenses", () => {
  assert.deepEqual(contract.absorbedAgents, EXPECTED_ABSORBED_AGENTS);
  for (const [retired, destination] of Object.entries(contract.absorbedAgents)) {
    assert.ok(!AGENT_NAMES.has(retired), `${retired} must not remain on the roster`);
    const [agent, keyword, lens] = destination.split(" ");
    assert.equal(keyword, "lens");
    assert.ok(AGENT_NAMES.has(agent), `${retired} must map to a roster agent`);
    const target = contract.agents.find((entry) => entry.name === agent);
    assert.ok(target.lenses.available.includes(lens), `${retired} must map to an available ${agent} lens`);
  }
});

test("direct OMP-prefixed Codex role candidates are marked superseded", () => {
  const superseded = new Set(contract.supersededCandidates.map((candidate) => candidate.candidate));
  for (const candidate of ["omp-designer", "omp-planner", "omp-reviewer", "omp-librarian"]) {
    assert.ok(superseded.has(candidate), `${candidate} must be marked superseded`);
  }
});


test("packet contract records execution context in markdown and JSON", () => {
  assert.match(markdown, /^## Execution context$/m);
  assert.equal(contract.packetContract.context.default, "live");
  assert.deepEqual(contract.packetContract.context.enum, ["validation", "live"]);
  assert.match(contract.packetContract.context.validation, /fixtures or dry-run surfaces/u);
  assert.match(contract.packetContract.context.absentBehavior, /Assume live/u);
});

test("contract slice records scratch activation gates without authorizing live HOME apply", () => {
  assert.match(contract.activation.scratchHomeApply, /scripts\/render-plugin-bridge\.mjs --write --home <scratch>/u);
  assert.match(contract.activation.markerManifest, /~\/\.loom-harness\/applied-manifest\.json/u);
  assert.match(contract.activation.secondApply, /already-applied/u);
  assert.match(contract.activation.verifier, /verify-loom-install\.mjs/u);
  assert.deepEqual(Object.keys(contract.activation.proofSurfaces), ["omp", "codex", "claude"]);
  assert.match(contract.activation.liveHomePromotionGate, /dry-run -> review -> explicit apply/u);
  assert.match(contract.activation.evidenceDecisionOwner, /pending retro packet -> human PR review/u);
  assert.ok(contract.activation.deterministicChecksBeforeApply.includes("scripts/validate-shared-agent-packages.mjs"));
  assert.ok(contract.activation.deterministicChecksBeforeApply.includes("scripts/validate-shared-agent-evals.mjs"));
  assert.match(contract.activation.evalHarness, /scripts\/validate-shared-agent-evals\.mjs/u);
  assert.match(contract.activation.lintRules, /scripts\/validate-shared-agent-packages\.mjs/u);
  assert.match(contract.activation.liveHomeApply, /explicit HITL approval/u);
  assert.match(markdown, /dry-run -> review -> explicit apply/u);
});
