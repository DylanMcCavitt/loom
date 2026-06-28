#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const contractPath = path.join(repoRoot, "docs/harness/shared-nucleus-agents.json");
const fixturesPath = path.join(repoRoot, "tests/fixtures/shared-agent-evals.json");

const contract = JSON.parse(readFileSync(contractPath, "utf8"));

export const ACCEPTANCE_GROUPS = Object.freeze([
  "trigger-loading",
  "request-mode-routing",
  "reference-retrieval",
  "rule-application",
  "parallel-fanout",
  "anti-fanout",
  "nested-depth-bounds",
  "allowed-child-lists",
  "repair-pack-finding-packets",
  "context-packet-compactness",
  "proof-quality",
  "cross-harness-portability",
  "scope-boundary",
  "evidence-intake-decision-log",
]);

export const FIXTURES = Object.freeze(JSON.parse(readFileSync(fixturesPath, "utf8")));

const agentNames = new Set(contract.agents.map((agent) => agent.name));
const agentModes = new Map(contract.agents.map((agent) => [agent.name, new Set(agent.modes)]));
const supersededNames = new Set(contract.supersededCandidates.map((candidate) => candidate.name));
const requestModes = new Set(contract.requestModes.map((mode) => mode.mode));
const forbiddenPrefixes = contract.namingRules.forbiddenPrefixes;
const requiredReferences = [
  "root AGENTS.md and active issue/PR",
  "agent-specific SKILL.md entrypoint",
  "mode-specific references",
];
const compactContextMaxBytes = 8000;

function fail(fixture, kind, message) {
  return `${fixture.id}: ${kind}: ${message}`;
}

function valuesNamedByCandidate(candidate) {
  return [candidate.agent, ...(candidate.canonicalNames ?? [])].filter(Boolean);
}

function isHarnessPrefixedOrSuperseded(name) {
  return forbiddenPrefixes.some((prefix) => name.startsWith(prefix)) || supersededNames.has(name);
}

function checkRequiredReferences(fixture) {
  const loaded = new Set(fixture.candidate.loadedReferences ?? []);
  for (const reference of requiredReferences) {
    if (!loaded.has(reference)) return fail(fixture, "retrieval", `missing required reference: ${reference}`);
  }
  return null;
}

function checkRouting(fixture) {
  const { candidate, request } = fixture;
  if (!requestModes.has(request.mode)) return fail(fixture, "application", `unknown request mode: ${request.mode}`);
  if (!requestModes.has(candidate.mode)) return fail(fixture, "application", `unknown candidate mode: ${candidate.mode}`);
  if (request.mode !== candidate.mode) {
    return fail(fixture, "application", `request mode ${request.mode} routed to ${candidate.mode}`);
  }
  if (!agentNames.has(candidate.agent)) return fail(fixture, "application", `unknown agent: ${candidate.agent}`);
  if (!agentModes.get(candidate.agent)?.has(candidate.mode)) {
    return fail(fixture, "application", `${candidate.agent} does not support mode ${candidate.mode}`);
  }
  if (request.targetAgent !== candidate.agent) {
    return fail(fixture, "application", `request routed to ${candidate.agent}, expected ${request.targetAgent}`);
  }

  for (const name of valuesNamedByCandidate(candidate)) {
    if (isHarnessPrefixedOrSuperseded(name)) {
      return fail(fixture, "application", `harness-prefixed or superseded agent name: ${name}`);
    }
  }
  return null;
}

function checkAllowedChildren(fixture) {
  const { candidate } = fixture;
  const delegation = contract.agentDelegation[candidate.agent];
  if (!delegation) return fail(fixture, "application", `missing delegation contract for ${candidate.agent}`);

  const allowed = new Set(delegation.allowedChildren);
  for (const child of candidate.allowedChildren ?? []) {
    if (!allowed.has(child)) return fail(fixture, "application", `child is not allowed for ${candidate.agent}: ${child}`);
  }

  for (const wave of candidate.waves ?? []) {
    if (wave.depth > contract.delegationPolicy.maxDepth) {
      return fail(fixture, "application", `nested depth exceeds maxDepth ${contract.delegationPolicy.maxDepth}`);
    }
    if (candidate.agent === "repair-pack" && wave.depth > contract.repairPack.delegation.maxChildDepth) {
      return fail(fixture, "application", "repair-pack exceeds max child depth");
    }
    for (const child of wave.children ?? []) {
      if (!allowed.has(child)) return fail(fixture, "application", `child is not allowed for ${candidate.agent}: ${child}`);
    }
  }


  return null;
}

function checkFanout(fixture) {
  const waves = fixture.candidate.waves ?? [];
  const isTrivial = /typo|copy edit|heading/iu.test(fixture.request.text);
  const childCount = waves.reduce((count, wave) => count + (wave.children?.length ?? 0), 0);
  if (isTrivial && childCount > 0) return fail(fixture, "application", "unnecessary subagents for trivial work");

  for (const wave of waves) {
    const scopes = wave.writeScopes ?? [];
    if (new Set(scopes).size !== scopes.length) {
      return fail(fixture, "application", "parallel fanout has overlapping write scopes");
    }
  }
  return null;
}

function checkFindingPacket(fixture) {
  if (fixture.candidate.mode !== "repair") return null;
  const packet = fixture.candidate.findingPacket;
  if (!packet) return fail(fixture, "application", "finding packet missing");

  for (const field of contract.repairPack.findingPacketSchema.requiredFields) {
    const value = packet[field];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
      return fail(fixture, "application", `finding packet missing ${field}`);
    }
  }
  if (fixture.candidate.proof?.namedCheck && fixture.candidate.proof.namedCheck !== packet.proofCheck) {
    return fail(fixture, "application", "proof check does not match finding packet");
  }
  return null;
}

function checkContextPacket(fixture) {
  const packet = fixture.candidate.contextPacket;
  if (!packet) return fail(fixture, "application", "context packet missing");
  if (packet.bytes > compactContextMaxBytes || (packet.fields ?? []).includes("fullTranscript")) {
    return fail(fixture, "application", "context packet is not compact");
  }
  return null;
}

function checkProof(fixture) {
  const proof = fixture.candidate.proof;
  if (!proof?.namedCheck) return fail(fixture, "application", "proof check missing");
  if (proof.result !== "pass") return fail(fixture, "application", "proof result is not passing");
  if (!proof.evidence) return fail(fixture, "application", "proof evidence missing");
  return null;
}

function forbiddenActionMatches(action, forbidden) {
  const normalizedForbidden = forbidden.toLowerCase();
  if (action.includes(normalizedForbidden.replace(/s$/u, ""))) return true;
  if (/merge|merge or close issues/u.test(normalizedForbidden) && /\bmerge\b/u.test(action) && /\b(pr|prs|pull request|pull requests)\b/u.test(action)) return true;
  if (normalizedForbidden.includes("close") && /\bclose\b/u.test(action) && /\b(issue|issues)\b/u.test(action)) return true;
  if (normalizedForbidden.includes("live home apply")) {
    return action.includes("live home apply") || (action.includes("apply") && action.includes("live home"));
  }
  if (/delegate outside|change scope/u.test(normalizedForbidden)) {
    return /delegate outside|outside .*scope|widen scope|scope widening|change acceptance criteria|outside acceptance criteria/u.test(action);
  }
  return false;
}

function checkForbiddenActions(fixture) {
  const actions = fixture.candidate.actions ?? [];
  const modeForbiddenActions = contract.delegationModes.find((entry) => entry.mode === fixture.candidate.mode)?.forbiddenActions ?? [];
  const forbiddenActions = [...contract.delegationPolicy.forbiddenAutonomousActions, ...modeForbiddenActions];
  for (const action of actions) {
    const normalized = action.toLowerCase();
    if (/render native|native omp|native codex|native claude|live activation|widen scope|scope widening|outside acceptance criteria|change acceptance criteria|delegate outside the issue|outside the issue\/worktree scope/u.test(normalized)) {
      return fail(fixture, "application", "widen beyond acceptance criteria");
    }
    if (forbiddenActions.some((forbidden) => forbiddenActionMatches(normalized, forbidden))) {
      return fail(fixture, "application", `forbidden autonomous action: ${action}`);
    }
  }
  return null;
}

function checkEvidenceIntake(fixture) {
  const packet = fixture.candidate.evidenceIntake;
  const requiresEvidenceIntake =
    fixture.group === "evidence-intake-decision-log" ||
    /evidence intake|decision-log|decision log/u.test(fixture.request?.text?.toLowerCase() ?? "");
  if (!packet) {
    return requiresEvidenceIntake ? fail(fixture, "application", "evidence intake packet missing") : null;
  }

  const contractIntake = contract.evidenceIntake;
  for (const input of contractIntake.collectorWorkflow.inputs) {
    if (!(packet.collector?.inputs ?? []).includes(input)) {
      return fail(fixture, "application", `collector missing input: ${input}`);
    }
  }
  if (
    (packet.collector?.actions ?? []).some((action) =>
      contractIntake.collectorWorkflow.forbiddenActions.some((forbidden) =>
        forbiddenActionMatches(action.toLowerCase(), forbidden),
      ),
    )
  ) {
    return fail(fixture, "application", "collector scored or proposed guidance");
  }
  for (const part of contractIntake.judgeWorkflow.separates) {
    if (!(packet.judge?.separates ?? []).includes(part)) {
      return fail(fixture, "application", `judge missing ${part}`);
    }
  }
  if (packet.judge?.candidateStatus !== contractIntake.judgeWorkflow.candidateStatus) {
    return fail(fixture, "application", "judge did not keep candidates pending");
  }
  if (
    (packet.judge?.actions ?? []).some((action) =>
      contractIntake.judgeWorkflow.forbiddenActions.some((forbidden) =>
        forbiddenActionMatches(action.toLowerCase(), forbidden),
      ),
    )
  ) {
    return fail(fixture, "application", "judge performed forbidden action");
  }

  const destinationByChoice = {
    rule: "rule",
    reference: "reference",
    exemplar: "exemplar",
    "lint rule": "lintRule",
    eval: "eval",
    "coverage gap": "coverageGap",
    "no change": "noChange",
  };
  const choice = packet.humanReview?.choice;
  if (!contractIntake.humanReviewChoices.includes(choice)) {
    return fail(fixture, "application", "unknown human review choice");
  }
  const expectedDestination = destinationByChoice[choice];
  if (packet.humanReview?.destination !== expectedDestination) {
    return fail(fixture, "application", "human review destination mismatch");
  }
  for (const field of contractIntake.decisionLogFormat.requiredFields) {
    if (!Object.hasOwn(packet.decisionLog ?? {}, field)) {
      return fail(fixture, "application", `decision log missing ${field}`);
    }
  }
  if (!Object.hasOwn(contractIntake.destinationPolicy, expectedDestination)) {
    return fail(fixture, "application", "unknown destination policy");
  }
  return null;
}

function checkHoldout(fixture) {
  if (!fixture.holdout) return null;
  if (!fixture.guidanceExcerpt || !fixture.expectedEdit) {
    return fail(fixture, "application", "holdout fixture missing guidance or expected edit");
  }
  if (fixture.guidanceExcerpt.includes(fixture.expectedEdit)) {
    return fail(fixture, "application", "holdout expected edit copied into guidance");
  }
  return null;
}

function expectedResult(fixture, actualFailure) {
  if (fixture.expect === "pass") return actualFailure;
  if (!actualFailure) return fail(fixture, "application", "expected failure but fixture passed");
  if (fixture.errorIncludes && !actualFailure.includes(fixture.errorIncludes)) {
    return fail(fixture, "application", `expected error including ${JSON.stringify(fixture.errorIncludes)}, got ${JSON.stringify(actualFailure)}`);
  }
  return null;
}

export function checkFixture(fixture) {
  const actualFailure = [
    checkRequiredReferences,
    checkRouting,
    checkAllowedChildren,
    checkFanout,
    checkFindingPacket,
    checkContextPacket,
    checkProof,
    checkForbiddenActions,
    checkEvidenceIntake,
    checkHoldout,
  ].map((check) => check(fixture)).find(Boolean) ?? null;

  const expectationFailure = expectedResult(fixture, actualFailure);
  if (expectationFailure) {
    const kind = expectationFailure.includes(": retrieval:") ? "retrieval" : "application";
    return { ok: false, kind, message: expectationFailure };
  }
  return { ok: true, kind: actualFailure?.includes(": retrieval:") ? "retrieval" : "application", message: null };
}

function checkCoverage() {
  const failures = [];
  for (const group of ACCEPTANCE_GROUPS) {
    if (!FIXTURES.some((fixture) => fixture.group === group)) failures.push(`missing acceptance group: ${group}`);
  }

  for (const fixture of FIXTURES) {
    if (!ACCEPTANCE_GROUPS.includes(fixture.group)) failures.push(`${fixture.id}: unknown acceptance group ${fixture.group}`);
  }

  const hasRetrievalFailure = FIXTURES.some((fixture) => {
    const result = checkFixture(fixture);
    return result.ok && fixture.expect === "fail" && result.kind === "retrieval";
  });
  const hasApplicationFailure = FIXTURES.some((fixture) => {
    const result = checkFixture(fixture);
    return result.ok && fixture.expect === "fail" && result.kind === "application";
  });
  if (!hasRetrievalFailure) failures.push("missing expected retrieval failure fixture");
  if (!hasApplicationFailure) failures.push("missing expected rule-application failure fixture");

  if (!FIXTURES.some((fixture) => fixture.holdout)) failures.push("missing holdout fixture");
  return failures;
}

export function runSharedAgentEvals() {
  const failures = checkCoverage();
  for (const fixture of FIXTURES) {
    const result = checkFixture(fixture);
    if (!result.ok) failures.push(result.message);
  }
  return { checked: FIXTURES.length, groups: ACCEPTANCE_GROUPS.length, failures };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  const { checked, groups, failures } = runSharedAgentEvals();
  if (failures.length) {
    console.error("Shared agent evals failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Shared agent evals passed: ${checked} fixtures across ${groups} acceptance groups`);
}
