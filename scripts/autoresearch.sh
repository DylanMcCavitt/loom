#!/usr/bin/env bash
set -euo pipefail

node --input-type=module <<'NODE'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const kitRoot = process.env.KIT_ROOT || join(homedir(), '.omp/agent/workflow-kit');
const templates = join(kitRoot, 'templates');
const scripts = join(kitRoot, 'scripts');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return result;
}

function has(text, needle) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function countPresent(text, needles) {
  return needles.filter((needle) => has(text, needle)).length;
}

function metric(name, value) {
  if (!Number.isFinite(value)) throw new Error(`metric ${name} is not finite`);
  console.log(`METRIC ${name}=${value}`);
}

function detail(name, values) {
  const rendered = values.length === 0 ? 'none' : values.join('; ');
  console.log(`DETAIL ${name}=${rendered}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegExp(heading)}\\s*$`, 'i');
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headingPattern);
    if (match) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }
  if (start === -1) return '';
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function joinSections(text, headings) {
  return headings.map((heading) => markdownSection(text, heading)).join('\n');
}

function replaceLiteral(text, needle, replacement) {
  return text.split(needle).join(replacement);
}

function makeConcreteFlow() {
  const atoms = {
    northStar: 'reduce repeat setup decisions',
    now: 'project bootstrap creates continuity scaffolding',
    next: 'issue packets inherit PRD trace links',
    deferred: 'cross-repo workflow analytics',
    doNotPreclude: 'issue IDs must survive branch/worktree naming',
    namingAnchor: 'scope ledger',
    openQuestion: 'who owns triage labels',
    openQuestionAnswer: 'triage labels are owned by platform',
    openQuestionEvidence: 'label ownership evidence: docs/agents/triage-labels.md names platform',
    expectedEvidence: 'fixture check shows ledger generated',
    actualEvidence: './scripts/check-project.sh fixture-project passed and ledger generated',
    sourceGrilledPlan: 'grilled-plan-setup-continuity',
    sourcePrd: 'PRD-setup-continuity',
    ledgerLink: 'docs/agents/scope-ledger.md#scope-ledger',
    issueId: '#42',
    branchName: '42-continuity-scaffolding',
  };

  const artifacts = {
    grilledPlan: `# Grilled plan: ${atoms.sourceGrilledPlan}

- Product north star: ${atoms.northStar}
- Now: ${atoms.now}
- Next: ${atoms.next}
- Later: ${atoms.deferred}
- Do not preclude: ${atoms.doNotPreclude}
- Naming anchor: ${atoms.namingAnchor}
- Open question: ${atoms.openQuestion}
- Acceptance/evidence atom: ${atoms.expectedEvidence}
`,
    prd: `# PRD: ${atoms.sourcePrd}

- Source grilled plan: ${atoms.sourceGrilledPlan}
- Scope ledger: ${atoms.ledgerLink}

## Product north star

${atoms.northStar}

## Now

- ${atoms.now}

## Next

- ${atoms.next}

## Later

- ${atoms.deferred}

## Explicitly deferred

- Capability: ${atoms.deferred}
  - Why deferred: not required for the current repo bootstrap slice.
  - Where tracked: ${atoms.ledgerLink}
  - Constraint imposed on Now: ${atoms.doNotPreclude}

## Do not preclude

- Constraint: ${atoms.doNotPreclude}
  - Deferred capability protected: ${atoms.deferred}
  - Verification evidence: ${atoms.expectedEvidence}

## Naming anchors

- ${atoms.namingAnchor}

## Open questions

- Question: ${atoms.openQuestion}
  - Owner: unresolved
  - Needed before: triage automation

## Acceptance criteria

| Acceptance criterion | Expected evidence |
| --- | --- |
| ${atoms.now} | ${atoms.expectedEvidence} |
`,
    issue: `# Agent Task ${atoms.issueId}

## Source traceability

- Source PRD: ${atoms.sourcePrd}
- Scope ledger: ${atoms.ledgerLink}
- Parent issue: none
- Depends on: none
- Now slice: ${atoms.now}
- Preserves from scope ledger: ${atoms.northStar}; ${atoms.namingAnchor}

## Acceptance criteria

| Acceptance criterion | Expected evidence | Actual evidence |
| --- | --- | --- |
| ${atoms.now} | ${atoms.expectedEvidence} | Filled during closeout. |

## Deferred scope custody

- Long-term capability: ${atoms.deferred}
- Why deferred: outside ${atoms.issueId}
- Where tracked: ${atoms.ledgerLink}
- Constraint imposed on V1: ${atoms.doNotPreclude}

## Open questions

- ${atoms.openQuestion}

## Continuity constraints checked

- Constraint: ${atoms.doNotPreclude}
  - Result: preserved for ${atoms.deferred}
  - Evidence: ${atoms.expectedEvidence}

## Future issue candidates

| Title | Depends on | Preserves |
| --- | --- | --- |
| ${atoms.next} | ${atoms.issueId} | ${atoms.deferred} |
`,
    triage: `# Triage update for ${atoms.issueId}

- Source PRD: ${atoms.sourcePrd}
- Scope ledger: ${atoms.ledgerLink}
- Label: ready-for-agent
- Deferred scope custody: ${atoms.deferred}
- Do not preclude: ${atoms.doNotPreclude}
- Open question preserved: ${atoms.openQuestion}
- Future issue candidate preserved: ${atoms.next}
`,
    implementation: `# Implementation closeout for ${atoms.issueId}

- Source PRD: ${atoms.sourcePrd}
- Scope ledger: ${atoms.ledgerLink}
- Worktree branch: ${atoms.branchName}
- Implemented Now slice: ${atoms.now}
- Expected evidence: ${atoms.expectedEvidence}
- Actual evidence: ${atoms.actualEvidence}

## Deferred scope custody

- ${atoms.deferred}
- Constraint respected: ${atoms.doNotPreclude}
- Open question unchanged or answered with evidence: ${atoms.openQuestion}
`,
    pr: `# Pull request for ${atoms.issueId}

- Closes ${atoms.issueId}
- Source PRD: ${atoms.sourcePrd}
- Scope ledger updated or linked: ${atoms.ledgerLink}

## Verification evidence

| Expected evidence | Actual evidence |
| --- | --- |
| ${atoms.expectedEvidence} | ${atoms.actualEvidence} |

## Continuity constraints checked

- Constraint: ${atoms.doNotPreclude}
  - Result: preserved ${atoms.deferred}
  - Evidence: ${atoms.actualEvidence}
- Did not preclude deferred capabilities: ${atoms.deferred}
- Open questions unchanged or answered with evidence: ${atoms.openQuestion}

## Deferred scope

- Explicitly deferred scope preserved: ${atoms.deferred}
- Future issue candidates affected: ${atoms.next}
- Naming anchor preserved: ${atoms.namingAnchor}
`,
    handoff: `# Handoff

## Task

${atoms.now} from ${atoms.sourcePrd} for ${atoms.issueId}.

## Files touched

- ${atoms.ledgerLink}

## Verification run

| Expected evidence | Actual evidence |
| --- | --- |
| ${atoms.expectedEvidence} | ${atoms.actualEvidence} |

## Deferred scope custody

- Scope ledger updated or linked: ${atoms.ledgerLink}
- Explicitly deferred scope preserved: ${atoms.deferred}
- Do not preclude constraints respected: ${atoms.doNotPreclude}
- Deferred capability preserved: ${atoms.deferred}
- Future issue candidates affected: ${atoms.next}
- Open questions unchanged or answered with evidence: ${atoms.openQuestion}

## Continuity constraints checked

- Constraint: ${atoms.doNotPreclude}
  - Result: ${atoms.deferred} remains possible.
  - Evidence: ${atoms.actualEvidence}
- Naming anchor preserved: ${atoms.namingAnchor}
`,
  };
  return { atoms, artifacts };
}

function concreteExpectations(flow) {
  const a = flow.atoms;
  return [
    { name: 'prd', text: flow.artifacts.prd, atoms: [a.sourceGrilledPlan, a.sourcePrd, a.ledgerLink, a.northStar, a.now, a.next, a.deferred, a.doNotPreclude, a.namingAnchor, a.openQuestion, a.expectedEvidence] },
    { name: 'issue', text: flow.artifacts.issue, atoms: [a.sourcePrd, a.ledgerLink, a.issueId, a.northStar, a.now, a.next, a.deferred, a.doNotPreclude, a.namingAnchor, a.openQuestion, a.expectedEvidence] },
    { name: 'triage', text: flow.artifacts.triage, atoms: [a.sourcePrd, a.ledgerLink, a.issueId, a.next, a.deferred, a.doNotPreclude, a.openQuestion] },
    { name: 'implementation', text: flow.artifacts.implementation, atoms: [a.sourcePrd, a.ledgerLink, a.issueId, a.branchName, a.now, a.deferred, a.doNotPreclude, a.openQuestion, a.expectedEvidence, a.actualEvidence] },
    { name: 'pr', text: flow.artifacts.pr, atoms: [a.sourcePrd, a.ledgerLink, a.issueId, a.next, a.deferred, a.doNotPreclude, a.namingAnchor, a.openQuestion, a.expectedEvidence, a.actualEvidence] },
    { name: 'handoff', text: flow.artifacts.handoff, atoms: [a.sourcePrd, a.ledgerLink, a.issueId, a.now, a.next, a.deferred, a.doNotPreclude, a.namingAnchor, a.openQuestion, a.expectedEvidence, a.actualEvidence] },
  ];
}

function evaluateConcreteFlow(flow) {
  const a = flow.atoms;
  let score = 0;
  let max = 0;
  const lostAtoms = [];
  for (const expectation of concreteExpectations(flow)) {
    for (const atom of expectation.atoms) {
      max += 1;
      if (has(expectation.text, atom)) {
        score += 1;
      } else {
        lostAtoms.push(`${expectation.name}:${atom}`);
      }
    }
  }

  let scopeCreepEvents = 0;
  for (const [name, text] of Object.entries(flow.artifacts)) {
    const committedScope = joinSections(text, ['Now', 'Acceptance criteria']);
    if (has(committedScope, a.deferred)) scopeCreepEvents += 1;
  }

  let openQuestionsSilentlyAnswered = 0;
  for (const text of Object.values(flow.artifacts)) {
    if (has(text, a.openQuestionAnswer) && !has(text, a.openQuestionEvidence)) {
      openQuestionsSilentlyAnswered += 1;
    }
  }

  let vagueFutureWorkCount = 0;
  for (const text of Object.values(flow.artifacts)) {
    const deferredSections = joinSections(text, ['Later', 'Explicitly deferred', 'Deferred scope custody', 'Deferred scope', 'Future issue candidates']);
    if (/\bfuture work\b/i.test(deferredSections) && !has(deferredSections, a.deferred)) {
      vagueFutureWorkCount += 1;
    }
  }

  let unlinkedDeferredItems = 0;
  for (const [name, text] of Object.entries(flow.artifacts)) {
    if (name === 'grilledPlan') continue;
    if (has(text, a.deferred) && !has(text, a.ledgerLink)) {
      unlinkedDeferredItems += 1;
    }
  }

  let missingActualEvidence = 0;
  for (const name of ['implementation', 'pr', 'handoff']) {
    if (!has(flow.artifacts[name], a.actualEvidence)) {
      missingActualEvidence += 1;
    }
  }

  return {
    score,
    max,
    lostAtoms,
    scopeCreepEvents,
    openQuestionsSilentlyAnswered,
    vagueFutureWorkCount,
    unlinkedDeferredItems,
    missingActualEvidence,
  };
}

function cloneConcreteFlow(flow) {
  return {
    atoms: flow.atoms,
    artifacts: { ...flow.artifacts },
  };
}

function writeConcreteFlowArtifacts(root, label, flow) {
  const dir = join(root, label);
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(flow.artifacts)) {
    writeFileSync(join(dir, `${name}.md`), text);
  }
  return dir;
}

function readConcreteFlowArtifacts(dir, atoms) {
  const names = ['grilledPlan', 'prd', 'issue', 'triage', 'implementation', 'pr', 'handoff'];
  const artifacts = {};
  for (const name of names) {
    artifacts[name] = read(join(dir, `${name}.md`));
  }
  return { atoms, artifacts };
}

function mutationCaught(evaluation) {
  return evaluation.score < evaluation.max ||
    evaluation.scopeCreepEvents > 0 ||
    evaluation.openQuestionsSilentlyAnswered > 0 ||
    evaluation.vagueFutureWorkCount > 0 ||
    evaluation.unlinkedDeferredItems > 0 ||
    evaluation.missingActualEvidence > 0;
}

const tempRoot = mkdtempSync(join(tmpdir(), 'omp-full-flow-traceability-'));
try {
  const repo = join(tempRoot, 'fixture-project');
  mkdirSync(repo);
  run('git', ['init', '-q'], { cwd: repo });
  run('git', ['remote', 'add', 'origin', 'https://github.com/example/full-flow-fixture.git'], { cwd: repo });
  run('bash', [join(scripts, 'init-project.sh'), repo]);
  const checkResult = run('bash', [join(scripts, 'check-project.sh'), repo]);

  const artifacts = {
    readme: read(join(kitRoot, 'README.md')),
    agentsTemplate: read(join(templates, 'project-omp-AGENTS.md')),
    generatedAgents: read(join(repo, '.omp/AGENTS.md')),
    githubTrackerTemplate: read(join(templates, 'docs-agents-issue-tracker-github.md')),
    localTrackerTemplate: read(join(templates, 'docs-agents-issue-tracker-local.md')),
    generatedTracker: read(join(repo, 'docs/agents/issue-tracker.md')),
    triageTemplate: read(join(templates, 'docs-agents-triage-labels.md')),
    generatedTriage: read(join(repo, 'docs/agents/triage-labels.md')),
    issueTemplate: read(join(templates, 'github-agent-task.md')),
    generatedIssue: read(join(repo, '.github/ISSUE_TEMPLATE/agent-task.md')),
    prTemplate: read(join(templates, 'github-pull-request-template.md')),
    generatedPr: read(join(repo, '.github/PULL_REQUEST_TEMPLATE.md')),
    handoffTemplate: read(join(templates, 'handoff.md')),
    ledgerTemplate: read(join(templates, 'scope-ledger.md')),
    generatedLedger: read(join(repo, 'docs/agents/scope-ledger.md')),
    initScript: read(join(scripts, 'init-project.sh')),
    checkScript: read(join(scripts, 'check-project.sh')),
  };

  const flowArtifacts = Object.values(artifacts).join('\n');
  const planningContract = artifacts.readme + artifacts.agentsTemplate + artifacts.generatedAgents + artifacts.ledgerTemplate + artifacts.generatedLedger;
  const prdContract = artifacts.readme + artifacts.ledgerTemplate + artifacts.generatedLedger + artifacts.githubTrackerTemplate + artifacts.localTrackerTemplate + artifacts.generatedTracker;
  const issueContract = artifacts.githubTrackerTemplate + artifacts.localTrackerTemplate + artifacts.generatedTracker + artifacts.issueTemplate + artifacts.generatedIssue;
  const triageContract = artifacts.triageTemplate + artifacts.generatedTriage;
  const implementationContract = artifacts.agentsTemplate + artifacts.generatedAgents + artifacts.issueTemplate + artifacts.generatedIssue + artifacts.prTemplate + artifacts.generatedPr;
  const prContract = artifacts.prTemplate + artifacts.generatedPr;
  const handoffContract = artifacts.handoffTemplate;
  const closeoutContract = prContract + handoffContract + artifacts.agentsTemplate + artifacts.generatedAgents;

  // Synthetic grilled transcript fixture, represented as trace atom categories. The
  // benchmark scores whether workflow-kit artifacts provide an explicit carrier for
  // each atom at every handoff in the real intended flow.
  const traceAtoms = [
    'Product north star',
    'Now',
    'Next',
    'Later',
    'Explicitly deferred',
    'Do not preclude',
    'Naming anchors',
    'Open questions',
    'Acceptance criterion',
    'Expected evidence',
    'Actual evidence',
    'Future issue candidates',
  ];

  const phaseChecks = [
    {
      name: 'grill_to_prd',
      text: planningContract,
      requirements: [
        ['grilled plan', 'PRD', 'shared understanding'],
        ['scope ledger', 'Product north star', 'Now', 'Next', 'Later'],
        ['Explicitly deferred', 'Do not preclude', 'Naming anchors', 'Open questions'],
      ],
    },
    {
      name: 'prd_to_issues',
      text: prdContract + issueContract,
      requirements: [
        ['PRD', 'issue'],
        ['Source PRD', 'Scope ledger'],
        ['Deferred scope custody', 'Long-term capability', 'Why deferred', 'Constraint imposed on V1'],
        ['Future issue candidates', 'Depends on', 'Preserves'],
        ['Acceptance criterion', 'Expected evidence'],
      ],
    },
    {
      name: 'issues_to_triage',
      text: triageContract,
      requirements: [
        ['triage', 'scope ledger'],
        ['label', 'Deferred scope custody'],
        ['Open questions', 'Do not preclude'],
        ['Future issue candidates', 'ready-for-agent'],
      ],
    },
    {
      name: 'triage_to_implementation',
      text: implementationContract,
      requirements: [
        ['one issue', 'worktree', 'PR'],
        ['Source PRD', 'Parent issue', 'Depends on'],
        ['Continuity constraints checked', 'Evidence'],
        ['did not preclude deferred capabilities'],
        ['Open questions unchanged or answered with evidence'],
      ],
    },
    {
      name: 'implementation_to_pr',
      text: prContract,
      requirements: [
        ['Closes #', 'Verification'],
        ['Actual evidence', 'Expected evidence'],
        ['Continuity constraints checked', 'Evidence'],
        ['Scope ledger updated or linked', 'Future issue candidates affected'],
        ['Deferred capability preserved', 'Open questions unchanged or answered with evidence'],
      ],
    },
    {
      name: 'handoff_round_trip',
      text: handoffContract,
      requirements: [
        ['Handoff', 'Files touched', 'Verification run'],
        ['Deferred scope custody', 'Scope ledger updated or linked'],
        ['Continuity constraints checked', 'Constraint', 'Evidence'],
        ['Expected evidence', 'Actual evidence'],
        ['Did not preclude deferred capabilities'],
        ['Explicitly deferred', 'Do not preclude', 'Future issue candidates affected'],
        ['Next step', 'Blockers'],
      ],
    },
    {
      name: 'fixture_check_contract',
      text: artifacts.checkScript,
      requirements: [
        ['Full-flow traceability', 'Source PRD'],
        ['Continuity rules', 'Deferred scope custody'],
        ['PRD continuity', 'Expected evidence'],
        ['Source traceability', 'Future issue candidates'],
        ['Actual evidence', 'Deferred capability preserved'],
      ],
    },
  ];

  let fullFlowScore = 0;
  let fullFlowMax = 0;
  const missingByPhase = [];
  for (const phase of phaseChecks) {
    let phaseScore = 0;
    for (const requirement of phase.requirements) {
      fullFlowMax += 1;
      const ok = requirement.every((needle) => has(phase.text, needle));
      if (ok) {
        phaseScore += 1;
        fullFlowScore += 1;
      } else {
        const missingNeedles = requirement.filter((needle) => !has(phase.text, needle));
        missingByPhase.push(`${phase.name}: ${missingNeedles.join(', ')}`);
      }
    }
    metric(`${phase.name}_score`, phaseScore);
    metric(`${phase.name}_max`, phase.requirements.length);
  }

  const atomDestinations = [
    { name: 'prd', text: prdContract, atoms: traceAtoms },
    { name: 'issue', text: issueContract, atoms: traceAtoms },
    { name: 'triage', text: triageContract, atoms: ['Explicitly deferred', 'Do not preclude', 'Open questions', 'Future issue candidates'] },
    { name: 'pr', text: prContract, atoms: ['Explicitly deferred', 'Do not preclude', 'Open questions', 'Actual evidence', 'Future issue candidates'] },
    { name: 'handoff', text: handoffContract, atoms: ['Explicitly deferred', 'Do not preclude', 'Open questions', 'Actual evidence', 'Future issue candidates'] },
  ];

  let atomScore = 0;
  let atomMax = 0;
  const lostAtoms = [];
  for (const destination of atomDestinations) {
    for (const atom of destination.atoms) {
      atomMax += 1;
      if (has(destination.text, atom)) {
        atomScore += 1;
      } else {
        lostAtoms.push(`${destination.name}:${atom}`);
      }
    }
  }

  const implementationSilentlyAnsweredQuestions = has(implementationContract + closeoutContract, 'Open questions unchanged or answered with evidence') ? 0 : 1;
  const closeoutMissingContinuityEvidence = has(closeoutContract, 'Continuity constraints checked') && has(closeoutContract, 'Evidence') ? 0 : 1;
  const acceptanceWithoutExpectedEvidence = has(issueContract, 'Acceptance criterion') && has(issueContract, 'Expected evidence') ? 0 : 1;
  const actualEvidenceMissingAtPr = has(closeoutContract, 'Actual evidence') ? 0 : 1;
  const unlinkedFutureIssueCandidates = has(issueContract + closeoutContract, 'Future issue candidates') && has(issueContract, 'Preserves') ? 0 : 1;
  const domainTermsLostAfterPrd = has(prdContract + issueContract + closeoutContract, 'Naming anchors') ? 0 : 1;
  const triageDroppedContext = has(triageContract, 'Deferred scope custody') && has(triageContract, 'Open questions') && has(triageContract, 'Do not preclude') ? 0 : 1;
  const issueLostDeferredScope = has(issueContract, 'Deferred scope custody') && has(issueContract, 'Long-term capability') && has(issueContract, 'Why deferred') ? 0 : 1;
  const prdLostDecisions = has(prdContract, 'PRD') && has(prdContract, 'Product north star') && has(prdContract, 'Do not preclude') ? 0 : 1;

  const concreteFlow = makeConcreteFlow();
  const cleanFlowDir = writeConcreteFlowArtifacts(tempRoot, 'adversarial-flow-clean', concreteFlow);
  const concreteEvaluation = evaluateConcreteFlow(readConcreteFlowArtifacts(cleanFlowDir, concreteFlow.atoms));
  const mutations = [
    {
      name: 'remove_deferred_item',
      apply(flow) {
        flow.artifacts.issue = replaceLiteral(flow.artifacts.issue, flow.atoms.deferred, '');
      },
      detects(evaluation) {
        return evaluation.score < evaluation.max;
      },
    },
    {
      name: 'scope_creep_deferred_into_now_acceptance',
      apply(flow) {
        flow.artifacts.issue = replaceLiteral(
          flow.artifacts.issue,
          `| ${flow.atoms.now} | ${flow.atoms.expectedEvidence} | Filled during closeout. |`,
          `| ${flow.atoms.now} | ${flow.atoms.expectedEvidence} | Filled during closeout. |
| ${flow.atoms.deferred} | ${flow.atoms.expectedEvidence} | Filled during closeout. |`,
        );
      },
      detects(evaluation) {
        return evaluation.scopeCreepEvents > 0;
      },
    },
    {
      name: 'silent_open_question_answer',
      apply(flow) {
        for (const name of ['prd', 'issue', 'triage', 'implementation', 'pr', 'handoff']) {
          flow.artifacts[name] = replaceLiteral(flow.artifacts[name], flow.atoms.openQuestion, flow.atoms.openQuestionAnswer);
        }
      },
      detects(evaluation) {
        return evaluation.openQuestionsSilentlyAnswered > 0;
      },
    },
    {
      name: 'vague_future_work_boilerplate',
      apply(flow) {
        flow.artifacts.handoff = replaceLiteral(flow.artifacts.handoff, flow.atoms.deferred, 'future work');
      },
      detects(evaluation) {
        return evaluation.vagueFutureWorkCount > 0;
      },
    },
    {
      name: 'unlinked_deferred_item',
      apply(flow) {
        flow.artifacts.issue = replaceLiteral(flow.artifacts.issue, flow.atoms.ledgerLink, '');
      },
      detects(evaluation) {
        return evaluation.unlinkedDeferredItems > 0;
      },
    },
    {
      name: 'missing_actual_evidence',
      apply(flow) {
        flow.artifacts.pr = replaceLiteral(flow.artifacts.pr, flow.atoms.actualEvidence, '');
        flow.artifacts.handoff = replaceLiteral(flow.artifacts.handoff, flow.atoms.actualEvidence, '');
      },
      detects(evaluation) {
        return evaluation.missingActualEvidence > 0;
      },
    },
  ];

  let caughtMutations = 0;
  const caughtMutationNames = [];
  const missedMutationNames = [];
  for (const mutation of mutations) {
    const mutatedFlow = cloneConcreteFlow(concreteFlow);
    mutation.apply(mutatedFlow);
    const mutatedFlowDir = writeConcreteFlowArtifacts(tempRoot, `adversarial-flow-${mutation.name}`, mutatedFlow);
    const evaluation = evaluateConcreteFlow(readConcreteFlowArtifacts(mutatedFlowDir, mutatedFlow.atoms));
    const caught = mutationCaught(evaluation) && mutation.detects(evaluation);
    if (caught) {
      caughtMutations += 1;
      caughtMutationNames.push(mutation.name);
    } else {
      missedMutationNames.push(mutation.name);
    }
    metric(`mutation_${mutation.name}_caught`, caught ? 1 : 0);
    metric(`mutation_${mutation.name}_concrete_trace_atom_score`, evaluation.score);
    metric(`mutation_${mutation.name}_scope_creep_events`, evaluation.scopeCreepEvents);
    metric(`mutation_${mutation.name}_open_questions_silently_answered`, evaluation.openQuestionsSilentlyAnswered);
    metric(`mutation_${mutation.name}_vague_future_work_count`, evaluation.vagueFutureWorkCount);
    metric(`mutation_${mutation.name}_unlinked_deferred_items`, evaluation.unlinkedDeferredItems);
    metric(`mutation_${mutation.name}_missing_actual_evidence`, evaluation.missingActualEvidence);
  }

  metric('full_flow_traceability_score', fullFlowScore);
  metric('full_flow_traceability_max', fullFlowMax);
  metric('trace_atom_retention_score', atomScore);
  metric('trace_atom_retention_max', atomMax);
  metric('concrete_trace_atom_score', concreteEvaluation.score);
  metric('concrete_trace_atom_max', concreteEvaluation.max);
  metric('anti_cheat_mutations_caught', caughtMutations);
  metric('anti_cheat_mutations_total', mutations.length);
  metric('scope_creep_events', concreteEvaluation.scopeCreepEvents);
  metric('open_questions_silently_answered', concreteEvaluation.openQuestionsSilentlyAnswered);
  metric('vague_future_work_count', concreteEvaluation.vagueFutureWorkCount);
  metric('unlinked_deferred_items', concreteEvaluation.unlinkedDeferredItems);
  metric('missing_actual_evidence', concreteEvaluation.missingActualEvidence);
  metric('prd_lost_decisions', prdLostDecisions);
  metric('issue_lost_deferred_scope', issueLostDeferredScope);
  metric('triage_dropped_context', triageDroppedContext);
  metric('implementation_silently_answered_questions', implementationSilentlyAnsweredQuestions);
  metric('closeout_missing_continuity_evidence', closeoutMissingContinuityEvidence);
  metric('unlinked_future_issue_candidates', unlinkedFutureIssueCandidates);
  metric('domain_terms_lost_after_prd', domainTermsLostAfterPrd);
  metric('acceptance_without_expected_evidence', acceptanceWithoutExpectedEvidence);
  metric('actual_evidence_missing_at_pr', actualEvidenceMissingAtPr);
  metric('fixture_check_passed', checkResult.status === 0 ? 1 : 0);
  detail('missing_full_flow_contracts', missingByPhase);
  detail('lost_trace_atoms', lostAtoms);
  detail('lost_concrete_trace_atoms', concreteEvaluation.lostAtoms);
  detail('anti_cheat_mutations_caught_names', caughtMutationNames);
  detail('anti_cheat_mutations_missed', missedMutationNames);

  if (fullFlowScore > fullFlowMax) throw new Error('full_flow_traceability_score exceeded max score');
  if (atomScore > atomMax) throw new Error('trace_atom_retention_score exceeded max score');
  if (concreteEvaluation.score !== concreteEvaluation.max) {
    throw new Error(`concrete trace atoms were lost: ${concreteEvaluation.lostAtoms.join(', ')}`);
  }
  if (concreteEvaluation.scopeCreepEvents !== 0) throw new Error('clean fixture has scope creep');
  if (concreteEvaluation.openQuestionsSilentlyAnswered !== 0) throw new Error('clean fixture silently answered open questions');
  if (concreteEvaluation.vagueFutureWorkCount !== 0) throw new Error('clean fixture has vague future-work boilerplate');
  if (concreteEvaluation.unlinkedDeferredItems !== 0) throw new Error('clean fixture has unlinked deferred items');
  if (concreteEvaluation.missingActualEvidence !== 0) throw new Error('clean fixture is missing actual evidence');
  if (caughtMutations !== mutations.length) {
    throw new Error(`anti-cheat mutations missed: ${missedMutationNames.join(', ')}`);
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
NODE
