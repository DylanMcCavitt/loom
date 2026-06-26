import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const contract = JSON.parse(readFileSync(new URL("../docs/harness/shared-nucleus-agents.json", import.meta.url), "utf8"));
const markdown = readFileSync(new URL("../docs/harness/shared-nucleus-agents.md", import.meta.url), "utf8");

const EXPECTED_ROSTER = [
  "blueprint",
  "ghosts",
  "inserter",
  "roboports",
  "radar",
  "lab",
  "biters",
  "spitters",
  "spidertron",
  "bus-first",
  "repair-pack",
  "main-bus",
  "science-pack",
  "belt",
  "recycler",
  "modules",
  "rocket-launch",
];

const REQUEST_MODES = ["shape", "implement", "review", "prove", "repair", "launch"];
const AGENT_NAMES = new Set(EXPECTED_ROSTER);
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
  assert.equal(contract.schemaVersion, 4);
  assert.equal(contract.generatedForIssue, "LOO-98");
  assert.equal(contract.status, "contract-only");
  assert.deepEqual(contract.agents.map((agent) => agent.name), EXPECTED_ROSTER);
  assert.equal(new Set(contract.agents.map((agent) => agent.name)).size, EXPECTED_ROSTER.length);
});

test("contract adapts the Vercel article into per-agent skill packages", () => {
  assert.equal(contract.sourcePattern.url, "https://vercel.com/blog/teaching-agents-product-design-at-vercel");
  assert.match(contract.repositoryStructure.mappingDecision, /per canonical nucleus agent/u);
  assert.equal(contract.repositoryStructure.perAgentSkillPackage.pathTemplate, ".agents/skills/{agent-name}/");
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
  for (const agent of ["blueprint", "ghosts", "roboports", "repair-pack", "rocket-launch"]) {
    assert.ok(waveAdvancers.includes(agent), `${agent} must be able to advance a wave`);
  }
  assert.deepEqual(contract.agentDelegation.lab.allowedChildren, []);
  assert.deepEqual(contract.agentDelegation.roboports.orderedWaves, [["lab", "biters", "spitters", "spidertron"], ["bus-first"], ["repair-pack"], ["lab"]]);
  const rocketLaunch = contract.agents.find((agent) => agent.name === "rocket-launch");
  assert.ok(!rocketLaunch.outputPacket.includes("merge result"));
  assert.ok(!rocketLaunch.outputPacket.includes("tracker closeout"));
  assert.ok(rocketLaunch.outputPacket.includes("tracker bridge evidence"));
});

test("repair-pack defines its Vercel-shaped package and repair-only mode", () => {
  const repairPack = contract.repairPack;
  assert.equal(repairPack.packageShape.path, ".agents/skills/repair-pack/");
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
  assert.match(markdown, /\.agents\/skills\/repair-pack\//u);
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

test("repair-pack post-fix loop routes proof, bus-first, and implementer consultation", () => {
  assert.ok(contract.repairPack.postFixLoop.some((step) => /minimal fix inside allowed files/u.test(step)));
  assert.ok(contract.repairPack.postFixLoop.some((step) => /lab reruns the named proof/u.test(step)));
  assert.ok(contract.repairPack.postFixLoop.some((step) => /bus-first rechecks only when the diff changed/u.test(step)));
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
  assert.ok(contract.roboportsDAG.sequence.some((step) => /lab, biters, spitters, and spidertron/u.test(step)));
  assert.ok(contract.roboportsDAG.sequence.some((step) => /run bus-first after the first proof\/review wave/u.test(step)));
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

test("evidence intake separates collector, judge, and human review", () => {
  assert.match(contract.evidenceIntake.collector, /without scoring or proposing rules/u);
  assert.match(contract.evidenceIntake.judge, /separates facts\/inferences\/open questions/u);
  assert.match(contract.evidenceIntake.humanReview, /rule, reference, exemplar, lint rule, eval, coverage gap, or no change/u);
  for (const requirement of ["stable evidence", "explicit scope", "exceptions", "approver"]) {
    assert.ok(contract.evidenceIntake.acceptedChangeRequirements.includes(requirement), `${requirement} must be required`);
  }
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

test("direct OMP-prefixed Codex role candidates are marked superseded", () => {
  const superseded = new Set(contract.supersededCandidates.map((candidate) => candidate.candidate));
  for (const candidate of ["omp-designer", "omp-planner", "omp-reviewer", "omp-librarian"]) {
    assert.ok(superseded.has(candidate), `${candidate} must be marked superseded`);
  }
});

test("contract slice does not claim rendering evals linters intake automation or live activation", () => {
  assert.equal(contract.activation.nativeAgentRendering, "future issue");
  assert.equal(contract.activation.evalHarness, "future issue");
  assert.equal(contract.activation.lintRules, "future issue when rules are mechanical");
  assert.equal(contract.activation.evidenceIntakeAutomation, "future issue");
  assert.equal(contract.activation.liveHomeApply, "forbidden in this contract slice");
  assert.match(markdown, /does not render or activate/u);
  for (const issue of ["LOO-97", "LOO-98", "LOO-99", "LOO-100", "LOO-101", "LOO-102"]) {
    assert.match(markdown, new RegExp(issue, "u"));
  }
});
