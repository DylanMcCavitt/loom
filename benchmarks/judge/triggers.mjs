#!/usr/bin/env node
// LLM-run trigger evals for skills/<name>/evals/evals.json (eval-ladder tier 2b).
//
// Invoked through `npm run bench -- --triggers [skill]`; never wired into
// `npm run check`, validators, or CI. Reuses the LOOM_JUDGE_* provider path
// from judge.mjs (worker != grader; the model here is a routing oracle only).
//
// Methodology: blind prediction + mechanical grading. Per eval case the model
// receives ONLY the skill roster (names + frontmatter descriptions) and the
// case prompt — never expected_output — and answers which skill (if any)
// should activate. Grading is mechanical: case polarity comes from the corpus
// ("Does NOT activate" marks a negative case), so the pass/fail verdict never
// depends on a second model judgment. Lens and route-target agreement are
// reported as informational signals, not gates.
//
// Scorecards land in retro/trigger-scorecard-*.{json,md}, are gitignored, and
// never contain env var values, keys, endpoint URLs, or command lines.

import fs from 'node:fs';
import path from 'node:path';

import { parseFrontmatter } from '../../scripts/lib/frontmatter.mjs';
import {
  createCompletionProvider,
  defaultRepoRoot,
  listJudgeSkills,
  resolveJudgeConfig,
  scorecardTimestampSlug,
  stripCodeFences,
} from './judge.mjs';

export const NO_ACTIVATION = 'none';

export function listTriggerSkills(repoRoot = defaultRepoRoot) {
  return listJudgeSkills(repoRoot).filter((name) => (
    fs.existsSync(path.join(repoRoot, 'skills', name, 'evals', 'evals.json'))
  ));
}

export function loadTriggerCorpus(skill, repoRoot = defaultRepoRoot) {
  const evalsPath = path.join(repoRoot, 'skills', skill, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new Error(`unknown or eval-less skill: ${skill} (no skills/${skill}/evals/evals.json)`);
  }
  const data = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
  if (data.skill_name !== skill) {
    throw new Error(`skills/${skill}/evals/evals.json skill_name mismatch: ${data.skill_name}`);
  }
  if (!Array.isArray(data.evals) || data.evals.length === 0) {
    throw new Error(`skills/${skill}/evals/evals.json has no eval cases`);
  }
  return data;
}

export function buildRosterContext(repoRoot = defaultRepoRoot) {
  return listJudgeSkills(repoRoot).map((name) => {
    const content = fs.readFileSync(path.join(repoRoot, 'skills', name, 'SKILL.md'), 'utf8');
    const description = parseFrontmatter(content)?.data?.description ?? '';
    return { name, description: typeof description === 'string' ? description : '' };
  });
}

// The prompt is blind by construction: it receives only the roster and the
// case prompt, never the corpus skill under test or its expected_output.
export function buildTriggerMessages({ roster, prompt }) {
  const system = [
    'You are a routing oracle for an agent skill pack. Given the roster of',
    'available skills and one user prompt, decide which single skill (if any)',
    'should activate for that prompt.',
    '',
    'Rules:',
    '- Pick at most one skill, by its exact roster name.',
    `- Answer "${NO_ACTIVATION}" when no roster skill should activate.`,
    '- When the chosen skill has named lenses and the prompt clearly selects',
    '  one, name that lens; otherwise use null.',
    '',
    'Respond with ONLY a JSON object, no prose around it:',
    '',
    '```json',
    `{"skill": "<roster name>" or "${NO_ACTIVATION}", "lens": "<lens name>" or null}`,
    '```',
    '',
    '--- Skill roster ---',
    ...roster.map((entry) => `- ${entry.name}: ${entry.description}`),
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `User prompt to route:\n\n${prompt}` },
  ];
}

export function parseTriggerResponse(text, rosterNames) {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(String(text)));
  } catch (error) {
    throw new Error(`trigger response is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('trigger response must be a JSON object');
  }
  const skill = typeof parsed.skill === 'string' ? parsed.skill.trim() : '';
  if (!skill) throw new Error('trigger response is missing a skill string');
  if (skill !== NO_ACTIVATION && !rosterNames.includes(skill)) {
    throw new Error(`trigger response names an unknown skill: ${skill}`);
  }
  const lens = typeof parsed.lens === 'string' && parsed.lens.trim() ? parsed.lens.trim() : null;
  return { skill, lens };
}

export function expectedPolarity(expectedOutput) {
  return /does not activate/iu.test(expectedOutput) ? 'negative' : 'positive';
}

export function extractExpectedLens(expectedOutput) {
  return expectedOutput.match(/with the ([a-z][a-z0-9-]*) lens/iu)?.[1]?.toLowerCase() ?? null;
}

export function extractRouteTarget(expectedOutput) {
  return expectedOutput.match(/routes? (?:it )?to ([a-z][a-z0-9-]*)/iu)?.[1]?.toLowerCase() ?? null;
}

export function gradeCase({ corpusSkill, expectedOutput, prediction }) {
  const polarity = expectedPolarity(expectedOutput);
  const expectedLens = extractExpectedLens(expectedOutput);
  const routeTarget = polarity === 'negative' ? extractRouteTarget(expectedOutput) : null;
  const pass = polarity === 'positive'
    ? prediction.skill === corpusSkill
    : prediction.skill !== corpusSkill;
  return {
    polarity,
    pass,
    expected_lens: expectedLens,
    lens_match: expectedLens && prediction.skill === corpusSkill
      ? prediction.lens === expectedLens
      : null,
    route_target: routeTarget,
    route_match: routeTarget ? prediction.skill === routeTarget : null,
  };
}

// Deterministic canned prediction for LOOM_JUDGE_MOCK runs: even case ids
// predict the corpus skill, odd ids predict no activation. Never quality
// evidence — it exists so tests and dry runs exercise the full pipeline.
export function mockTriggerPrediction({ corpusSkill, caseId }) {
  return caseId % 2 === 0
    ? { skill: corpusSkill, lens: null }
    : { skill: NO_ACTIVATION, lens: null };
}

function createTriggerPredictor(config, { fetchImpl, rosterNames }) {
  if (config.mock) {
    const canned = config.mock.trim().startsWith('{')
      ? parseTriggerResponse(config.mock, rosterNames)
      : null;
    return {
      kind: 'mock',
      model: 'mock',
      async predict({ corpusSkill, caseId }) {
        return canned ?? mockTriggerPrediction({ corpusSkill, caseId });
      },
    };
  }
  const completion = createCompletionProvider(config, { fetchImpl });
  return {
    kind: completion.kind,
    model: completion.model,
    async predict({ roster, prompt }) {
      return parseTriggerResponse(
        await completion.complete(buildTriggerMessages({ roster, prompt })),
        rosterNames,
      );
    },
  };
}

export function renderTriggerScorecardMarkdown(scorecard) {
  const lines = [
    '# Loom trigger-eval scorecard',
    '',
    `- Generated: ${scorecard.generatedAt}`,
    `- Judge: ${scorecard.judge.provider} (model: ${scorecard.judge.model})`,
    `- Cases: ${scorecard.totals.passed}/${scorecard.totals.cases} passed`
      + (scorecard.totals.errors ? ` (${scorecard.totals.errors} errored)` : ''),
    '',
    '| Skill | Passed | Total | Errors |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const entry of scorecard.skills) {
    lines.push(`| \`${entry.skill}\` | ${entry.passed} | ${entry.cases.length} | ${entry.errors} |`);
  }
  for (const entry of scorecard.skills) {
    lines.push('', `## ${entry.skill}`, '');
    for (const c of entry.cases) {
      const verdict = c.error ? 'ERROR' : (c.pass ? 'pass' : 'FAIL');
      const predicted = c.error ? c.error : `predicted ${c.predicted.skill}${c.predicted.lens ? ` (${c.predicted.lens} lens)` : ''}`;
      lines.push(`- case ${c.id} [${c.polarity}] ${verdict} — ${predicted}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function runTriggers({
  repoRoot = defaultRepoRoot,
  skill = null,
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const config = resolveJudgeConfig(env);
  if (!config.enabled) throw new Error('triggers judge is not enabled; check resolveJudgeConfig first');

  const skills = skill ? [skill] : listTriggerSkills(repoRoot);
  if (skills.length === 0) throw new Error('no skills with evals/evals.json found under skills/');

  const roster = buildRosterContext(repoRoot);
  const rosterNames = roster.map((entry) => entry.name);
  const predictor = createTriggerPredictor(config, { fetchImpl, rosterNames });

  const entries = [];
  let passed = 0;
  let cases = 0;
  let errors = 0;
  for (const name of skills) {
    const corpus = loadTriggerCorpus(name, repoRoot);
    const caseResults = [];
    for (const evalCase of corpus.evals) {
      cases += 1;
      let prediction = null;
      let caseError = null;
      try {
        prediction = await predictor.predict({
          roster,
          prompt: evalCase.prompt,
          corpusSkill: name,
          caseId: evalCase.id,
        });
      } catch (error) {
        caseError = error.message;
      }
      if (caseError) {
        errors += 1;
        caseResults.push({
          id: evalCase.id,
          polarity: expectedPolarity(evalCase.expected_output),
          pass: false,
          predicted: null,
          error: caseError,
        });
        continue;
      }
      const grade = gradeCase({
        corpusSkill: name,
        expectedOutput: evalCase.expected_output,
        prediction,
      });
      if (grade.pass) passed += 1;
      caseResults.push({ id: evalCase.id, predicted: prediction, error: null, ...grade });
    }
    entries.push({
      skill: name,
      passed: caseResults.filter((c) => c.pass).length,
      errors: caseResults.filter((c) => c.error).length,
      cases: caseResults,
    });
  }

  const generatedAt = now().toISOString();
  const scorecard = {
    schemaVersion: 1,
    benchmark: 'trigger-evals',
    generatedAt,
    judge: { provider: predictor.kind, model: predictor.model },
    totals: {
      cases,
      passed,
      errors,
      accuracy: cases > 0 ? Number((passed / cases).toFixed(4)) : 0,
    },
    skills: entries,
  };

  const retroDir = path.join(repoRoot, 'retro');
  fs.mkdirSync(retroDir, { recursive: true });
  const slug = scorecardTimestampSlug(new Date(generatedAt));
  const jsonPath = path.join(retroDir, `trigger-scorecard-${slug}.json`);
  const mdPath = path.join(retroDir, `trigger-scorecard-${slug}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderTriggerScorecardMarkdown(scorecard));

  return { scorecard, jsonPath, mdPath };
}
