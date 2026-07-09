#!/usr/bin/env node
// Tier-2 routing eval: ask a judge backend which skill should activate for each
// skills/*/evals/evals.json prompt, given only the 11 name+description pairs.
//
// Invoked through `npm run bench -- --route [skill]`; never wired into
// `npm run check`, validators, or CI. Reuses LOOM_JUDGE_* / judge.config.json
// enablement from benchmarks/judge/judge.mjs (worker != grader).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { parseFrontmatter } from '../../scripts/lib/frontmatter.mjs';
import {
  defaultRepoRoot,
  listJudgeSkills,
  offlineSkipNotice,
  resolveJudgeConfig,
  scorecardTimestampSlug,
} from '../judge/judge.mjs';

export { defaultRepoRoot };

export const NONE_SKILL = 'none';
export const ROUTING_SCORECARD_PREFIX = 'routing-scorecard-';

const DOES_NOT_ACTIVATE_RE = /\bdoes\s+not\s+activate\b/iu;
const ACTIVATES_RE = /\bactivates\b/iu;
// "routes to X", "routes prototyping to the X skill", etc.
const ROUTES_TO_RE = /\broutes?\b[\s\S]{0,48}?\bto\s+(?:the\s+)?/iu;

function stripCodeFences(text) {
  const fenced = String(text).match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/u);
  return (fenced ? fenced[1] : text).trim();
}

/** Longest-first so `repair-pack` wins over a bare `repair` substring. */
export function skillNameMatcher(skillNames) {
  const sorted = [...skillNames].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const escaped = sorted.map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'));
  if (escaped.length === 0) return null;
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'giu');
}

export function findSkillMentions(text, skillNames) {
  const matcher = skillNameMatcher(skillNames);
  if (!matcher) return [];
  const found = [];
  const seen = new Set();
  for (const match of String(text).matchAll(matcher)) {
    const name = match[0].toLowerCase();
    if (!seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
  }
  return found;
}

function firstRoutedSkill(text, corpusSkill, roster) {
  const routeMatch = String(text).match(ROUTES_TO_RE);
  if (!routeMatch) return null;
  const after = String(text).slice(routeMatch.index + routeMatch[0].length);
  const mentions = findSkillMentions(after, roster);
  return mentions.find((name) => name !== corpusSkill) ?? null;
}

/**
 * Derive the expected routed skill for one eval case.
 * - Explicit "Does NOT activate": first other roster skill named in
 *   expected_output, else "none".
 * - "routes to <other>" with no "activates" signal: that other skill.
 * - Otherwise: the corpus skill (positive activation / default).
 */
export function deriveExpectedSkill(expectedOutput, corpusSkill, skillNames = []) {
  const text = String(expectedOutput ?? '');
  const roster = skillNames.length > 0 ? skillNames : [corpusSkill];

  if (DOES_NOT_ACTIVATE_RE.test(text)) {
    const routed = firstRoutedSkill(text, corpusSkill, roster);
    if (routed) return routed;
    const mentions = findSkillMentions(text, roster);
    const other = mentions.find((name) => name !== corpusSkill);
    return other ?? NONE_SKILL;
  }

  if (!ACTIVATES_RE.test(text)) {
    const routed = firstRoutedSkill(text, corpusSkill, roster);
    if (routed) return routed;
  }

  return corpusSkill;
}

export function collectSkillDescriptions(repoRoot = defaultRepoRoot) {
  const skills = listJudgeSkills(repoRoot);
  const descriptions = [];
  for (const name of skills) {
    const skillPath = path.join(repoRoot, 'skills', name, 'SKILL.md');
    const parsed = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    const frontName = typeof parsed?.values?.name === 'string' ? parsed.values.name.trim() : '';
    const description = typeof parsed?.values?.description === 'string'
      ? parsed.values.description.trim()
      : '';
    if (!frontName || !description) {
      throw new Error(`skills/${name}/SKILL.md must expose name and description frontmatter`);
    }
    if (frontName !== name) {
      throw new Error(`skills/${name}/SKILL.md name '${frontName}' must match directory`);
    }
    descriptions.push({ name, description });
  }
  return descriptions;
}

export function loadRoutingCases(skill, repoRoot = defaultRepoRoot) {
  const evalsPath = path.join(repoRoot, 'skills', skill, 'evals', 'evals.json');
  if (!fs.existsSync(evalsPath)) {
    throw new Error(`missing routing corpus: skills/${skill}/evals/evals.json`);
  }
  const parsed = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.evals)) {
    throw new Error(`invalid evals.json for ${skill}: expected { evals: [...] }`);
  }
  return parsed.evals.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`invalid eval entry at skills/${skill}/evals/evals.json[${index}]`);
    }
    const id = entry.id ?? index + 1;
    const prompt = typeof entry.prompt === 'string' ? entry.prompt : '';
    const expectedOutput = typeof entry.expected_output === 'string' ? entry.expected_output : '';
    if (!prompt) throw new Error(`skills/${skill}/evals/evals.json id=${id}: missing prompt`);
    if (!expectedOutput) {
      throw new Error(`skills/${skill}/evals/evals.json id=${id}: missing expected_output`);
    }
    return { id, prompt, expected_output: expectedOutput, corpus_skill: skill };
  });
}

export function buildRoutingPrompt({ descriptions, prompt, allowedSkills }) {
  const catalog = descriptions
    .map((entry) => `- ${entry.name}: ${entry.description}`)
    .join('\n');
  const allowed = [...allowedSkills, NONE_SKILL].join(', ');
  return [
    'You are routing a user request to exactly one agent skill.',
    'Below is the full skill catalog a harness would show at routing time (name + description only).',
    '',
    '--- skill catalog ---',
    catalog,
    '--- end catalog ---',
    '',
    'User request:',
    prompt,
    '',
    'Choose the single skill that should activate for this request.',
    `If none of the skills should activate, answer "${NONE_SKILL}".`,
    'Respond with strict JSON only, no markdown fences, of the form {"skill":"<name>"}.',
    `The "skill" value must be exactly one of: ${allowed}.`,
  ].join('\n');
}

/**
 * Parse a routing judge response into a single skill name or "none".
 * Accepts {"skill":"..."}, {"chosen":"..."}, or a bare skill token.
 */
export function parseRoutingResponse(text, skillNames = []) {
  const allowed = new Set([...skillNames.map((name) => name.toLowerCase()), NONE_SKILL]);
  const raw = stripCodeFences(text);
  let candidate = null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') {
      candidate = parsed;
    } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value = parsed.skill ?? parsed.chosen ?? parsed.name ?? parsed.route;
      if (typeof value === 'string') candidate = value;
    }
  } catch {
    const mentions = findSkillMentions(raw, [...skillNames, NONE_SKILL]);
    if (mentions.length === 1) candidate = mentions[0];
    else if (/^\s*none\s*$/iu.test(raw)) candidate = NONE_SKILL;
  }

  if (candidate == null) {
    throw new Error(`routing response is not valid skill JSON: ${String(text).slice(0, 200)}`);
  }
  const normalized = String(candidate).trim().toLowerCase();
  if (!allowed.has(normalized)) {
    throw new Error(
      `routing response skill "${candidate}" is not in the roster (or "${NONE_SKILL}")`,
    );
  }
  return normalized;
}

export function normalizeChosenSkill(chosen, skillNames = []) {
  if (typeof chosen === 'string') {
    return parseRoutingResponse(JSON.stringify({ skill: chosen }), skillNames);
  }
  return parseRoutingResponse(chosen, skillNames);
}

export function emptyConfusionMatrix(labels) {
  const matrix = {};
  for (const expected of labels) {
    matrix[expected] = Object.fromEntries(labels.map((chosen) => [chosen, 0]));
  }
  return matrix;
}

export function computeRoutingScores(results, skillNames = []) {
  const labels = [...skillNames, NONE_SKILL].sort((a, b) => {
    if (a === NONE_SKILL) return 1;
    if (b === NONE_SKILL) return -1;
    return a.localeCompare(b);
  });
  const matrix = emptyConfusionMatrix(labels);
  const perSkill = Object.fromEntries(
    skillNames.map((name) => [name, { total: 0, correct: 0, accuracy: null }]),
  );

  let correct = 0;
  for (const row of results) {
    const expected = row.expected;
    const chosen = row.chosen;
    if (!matrix[expected]) {
      matrix[expected] = Object.fromEntries(labels.map((label) => [label, 0]));
    }
    if (!(chosen in matrix[expected])) matrix[expected][chosen] = 0;
    matrix[expected][chosen] += 1;

    const corpus = row.corpus_skill;
    if (perSkill[corpus]) {
      perSkill[corpus].total += 1;
      if (expected === chosen) perSkill[corpus].correct += 1;
    }
    if (expected === chosen) correct += 1;
  }

  for (const stats of Object.values(perSkill)) {
    stats.accuracy = stats.total === 0 ? null : stats.correct / stats.total;
  }

  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? null : correct / results.length,
    perSkill,
    confusionMatrix: matrix,
    labels,
  };
}

export function mockRoutingSkill(context) {
  // Deterministic offline stub: always pick the corpus skill under test.
  return context.corpusSkill;
}

function invokeCommandRoute(config, context, spawnImpl = spawnSync) {
  const result = spawnImpl(config.cmd, {
    shell: true,
    input: context.promptText,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw new Error(`routing command failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `routing command exited ${result.status}: ${String(result.stderr ?? '').trim().slice(0, 500)}`,
    );
  }
  return result.stdout;
}

async function invokeApiRoute(config, context, fetchImpl) {
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You route user requests to exactly one skill. Reply with strict JSON only.',
        },
        { role: 'user', content: context.promptText },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`routing endpoint returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('routing endpoint response is missing choices[0].message.content');
  }
  return content;
}

export function createRoutingProvider(config, { fetchImpl = fetch, spawnImpl = spawnSync } = {}) {
  if (config.backendError && !config.cmd && !config.mock && !config.apiKey) {
    throw new Error(config.backendError);
  }
  if (config.mock) {
    let canned = null;
    if (config.mock.trim().startsWith('{')) {
      canned = parseRoutingResponse(config.mock);
    }
    return {
      kind: 'mock',
      model: 'mock',
      async route(context) {
        if (canned) return canned;
        if (typeof context.mockSkill === 'string') return context.mockSkill;
        return mockRoutingSkill(context);
      },
    };
  }
  if (config.cmd) {
    return {
      kind: 'command',
      model: config.model || 'command',
      async route(context) {
        const stdout = invokeCommandRoute(config, context, spawnImpl);
        return parseRoutingResponse(stdout, context.skillNames);
      },
    };
  }
  if (!config.apiKey) throw new Error('LOOM_JUDGE_API_KEY is required for live routing calls');
  if (!config.model) {
    throw new Error('LOOM_JUDGE_MODEL is required when LOOM_JUDGE_API_KEY is set');
  }
  return {
    kind: 'openai-compatible',
    model: config.model,
    async route(context) {
      const content = await invokeApiRoute(config, context, fetchImpl);
      return parseRoutingResponse(content, context.skillNames);
    },
  };
}

export function renderRoutingScorecardMarkdown(scorecard) {
  const lines = [
    '# Loom routing eval scorecard',
    '',
    `- Generated: ${scorecard.generatedAt}`,
    `- Judge: ${scorecard.judge.provider} (model: ${scorecard.judge.model})`,
    `- Cases: ${scorecard.scores.correct}/${scorecard.scores.total} correct`
      + (scorecard.scores.accuracy == null
        ? ''
        : ` (${(scorecard.scores.accuracy * 100).toFixed(1)}%)`),
    '',
    '## Per-skill activation accuracy',
    '',
    '| Skill | Correct | Total | Accuracy |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const skill of Object.keys(scorecard.scores.perSkill).sort((a, b) => a.localeCompare(b))) {
    const stats = scorecard.scores.perSkill[skill];
    const pct = stats.accuracy == null ? '—' : `${(stats.accuracy * 100).toFixed(1)}%`;
    lines.push(`| \`${skill}\` | ${stats.correct} | ${stats.total} | ${pct} |`);
  }

  lines.push('', '## Confusion matrix (expected \\ chosen)', '');
  const labels = scorecard.scores.labels;
  lines.push(`| expected \\ chosen | ${labels.map((label) => `\`${label}\``).join(' | ')} |`);
  lines.push(`| --- | ${labels.map(() => '---:').join(' | ')} |`);
  for (const expected of labels) {
    const row = labels.map((chosen) => scorecard.scores.confusionMatrix[expected]?.[chosen] ?? 0);
    lines.push(`| \`${expected}\` | ${row.join(' | ')} |`);
  }

  lines.push('', '## Cases', '');
  for (const entry of scorecard.cases) {
    const mark = entry.correct ? 'ok' : 'MISS';
    lines.push(
      `- [${mark}] \`${entry.corpus_skill}\`#${entry.id}: expected \`${entry.expected}\`, chose \`${entry.chosen}\``,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function formatRoutingSummary(scorecard) {
  const lines = [
    `routing: ${scorecard.scores.correct}/${scorecard.scores.total} correct`
      + (scorecard.scores.accuracy == null
        ? ''
        : ` (${(scorecard.scores.accuracy * 100).toFixed(1)}%)`),
  ];
  for (const skill of Object.keys(scorecard.scores.perSkill).sort((a, b) => a.localeCompare(b))) {
    const stats = scorecard.scores.perSkill[skill];
    if (stats.total === 0) continue;
    const pct = `${(stats.accuracy * 100).toFixed(1)}%`;
    lines.push(`  ${skill}: ${stats.correct}/${stats.total} (${pct})`);
  }
  return lines.join('\n');
}

export async function runRoutingEval({
  repoRoot = defaultRepoRoot,
  skill = null,
  env = process.env,
  fetchImpl = fetch,
  spawnImpl = spawnSync,
  now = () => new Date(),
  routeFn = null,
} = {}) {
  const config = resolveJudgeConfig(env);
  if (!config.enabled) throw new Error('routing eval is not enabled; check resolveJudgeConfig first');

  const descriptions = collectSkillDescriptions(repoRoot);
  const skillNames = descriptions.map((entry) => entry.name);
  const targets = skill ? [skill] : skillNames;
  if (skill && !skillNames.includes(skill)) {
    throw new Error(`unknown skill: ${skill} (no skills/${skill}/SKILL.md)`);
  }

  const provider = routeFn
    ? { kind: 'injected', model: 'injected', route: routeFn }
    : createRoutingProvider(config, { fetchImpl, spawnImpl });

  const cases = [];
  for (const name of targets) {
    for (const entry of loadRoutingCases(name, repoRoot)) {
      const expected = deriveExpectedSkill(entry.expected_output, name, skillNames);
      const promptText = buildRoutingPrompt({
        descriptions,
        prompt: entry.prompt,
        allowedSkills: skillNames,
      });
      const chosenRaw = await provider.route({
        promptText,
        corpusSkill: name,
        skillNames,
        caseId: entry.id,
        prompt: entry.prompt,
        expected,
      });
      const chosen = normalizeChosenSkill(chosenRaw, skillNames);
      cases.push({
        corpus_skill: name,
        id: entry.id,
        prompt: entry.prompt,
        expected,
        chosen,
        correct: expected === chosen,
      });
    }
  }

  const scores = computeRoutingScores(cases, skillNames);
  const generatedAt = now().toISOString();
  const scorecard = {
    schemaVersion: 1,
    benchmark: 'skill-routing',
    generatedAt,
    judge: { provider: provider.kind, model: provider.model },
    catalog_size: descriptions.length,
    targeted_skills: targets,
    scores: {
      total: scores.total,
      correct: scores.correct,
      accuracy: scores.accuracy,
      perSkill: scores.perSkill,
      confusionMatrix: scores.confusionMatrix,
      labels: scores.labels,
    },
    cases,
  };

  const retroDir = path.join(repoRoot, 'retro');
  fs.mkdirSync(retroDir, { recursive: true });
  const slug = scorecardTimestampSlug(new Date(generatedAt));
  const jsonPath = path.join(retroDir, `${ROUTING_SCORECARD_PREFIX}${slug}.json`);
  const mdPath = path.join(retroDir, `${ROUTING_SCORECARD_PREFIX}${slug}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderRoutingScorecardMarkdown(scorecard));

  return { scorecard, jsonPath, mdPath, descriptions };
}

export { offlineSkipNotice, resolveJudgeConfig };
