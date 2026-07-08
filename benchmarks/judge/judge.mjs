#!/usr/bin/env node
// LLM-as-judge rubric scoring for skills/<name>/SKILL.md (eval-ladder tier 2).
//
// Invoked through `npm run bench -- --judge [skill]`; never wired into
// `npm run check`, validators, or CI. The judge model is a grader only and its
// configuration (LOOM_JUDGE_*) is separate from any worker configuration
// (worker != grader).
//
// Provider layer (no SDKs, fetch only):
// - LOOM_JUDGE_API_KEY  — bearer token for an OpenAI-compatible endpoint.
// - LOOM_JUDGE_MODEL    — model name (required for live calls).
// - LOOM_JUDGE_BASE_URL — endpoint base (default https://api.openai.com/v1).
// - LOOM_JUDGE_MOCK     — any non-empty value enables an offline canned judge;
//   a value starting with "{" is parsed as the canned judge JSON itself.
//
// With neither LOOM_JUDGE_API_KEY nor LOOM_JUDGE_MOCK set, callers must skip
// with exit 0 (CI has no credentials). Scorecards are written to retro/ and
// never contain env var values, keys, or endpoint URLs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(here, '..', '..');
export const RUBRIC_RELATIVE_PATH = 'benchmarks/judge/RUBRIC.md';
export const JUDGE_SCORE_DIMENSIONS = Object.freeze([
  'conciseness',
  'delta_over_base',
  'agnosticism',
  'actionability',
]);

export function resolveJudgeConfig(env = process.env) {
  const apiKey = env.LOOM_JUDGE_API_KEY ?? '';
  const mock = env.LOOM_JUDGE_MOCK ?? '';
  return {
    apiKey,
    model: env.LOOM_JUDGE_MODEL ?? '',
    baseUrl: (env.LOOM_JUDGE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/u, ''),
    mock,
    enabled: Boolean(apiKey) || Boolean(mock),
  };
}

export function offlineSkipNotice(mode) {
  return [
    `bench ${mode}: skipped — LOOM_JUDGE_API_KEY is not set.`,
    'Model-in-the-loop bench modes are opt-in and never run in CI. To enable, set',
    'LOOM_JUDGE_API_KEY and LOOM_JUDGE_MODEL (and optionally LOOM_JUDGE_BASE_URL for',
    'an OpenAI-compatible chat-completions endpoint), or set LOOM_JUDGE_MOCK=1 for a',
    'canned offline judge. Exiting 0.',
  ].join('\n');
}

export function listJudgeSkills(repoRoot = defaultRepoRoot) {
  const skillsDir = path.join(repoRoot, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function loadSkillContext(skill, repoRoot = defaultRepoRoot) {
  const skillPath = path.join(repoRoot, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`unknown skill: ${skill} (no skills/${skill}/SKILL.md)`);
  }
  const evalsPath = path.join(repoRoot, 'skills', skill, 'evals', 'evals.json');
  return {
    skill,
    skillMd: fs.readFileSync(skillPath, 'utf8'),
    evalsJson: fs.existsSync(evalsPath) ? fs.readFileSync(evalsPath, 'utf8').trim() : null,
  };
}

export function buildJudgeMessages({ rubric, context }) {
  const userParts = [
    `Skill under judgment: ${context.skill}`,
    '',
    '--- SKILL.md ---',
    context.skillMd,
  ];
  if (context.evalsJson) {
    userParts.push(
      '',
      '--- evals/evals.json (routing intent) ---',
      context.evalsJson,
    );
  }
  return [
    { role: 'system', content: rubric },
    { role: 'user', content: userParts.join('\n') },
  ];
}

function stripCodeFences(text) {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/u);
  return (fenced ? fenced[1] : text).trim();
}

export function parseJudgeResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(String(text)));
  } catch (error) {
    throw new Error(`judge response is not valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('judge response must be a JSON object');
  }
  const scores = parsed.scores;
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    throw new Error('judge response is missing a scores object');
  }
  for (const dimension of JUDGE_SCORE_DIMENSIONS) {
    const value = scores[dimension];
    if (!Number.isInteger(value) || value < 0 || value > 5) {
      throw new Error(`judge score ${dimension} must be an integer 0-5, got ${JSON.stringify(value)}`);
    }
  }
  const trimCandidates = parsed.trim_candidates ?? [];
  if (!Array.isArray(trimCandidates) || trimCandidates.some((item) => typeof item !== 'string')) {
    throw new Error('judge trim_candidates must be an array of strings');
  }
  return {
    scores: Object.fromEntries(JUDGE_SCORE_DIMENSIONS.map((dimension) => [dimension, scores[dimension]])),
    trim_candidates: trimCandidates,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}

// Deterministic canned judgment: middling scores plus the SKILL.md's last
// top-level section as a trim candidate, so downstream ablation has a real
// section to cut when exercised offline.
export function mockJudgeResult(context) {
  const headings = [...context.skillMd.matchAll(/^## .+$/gmu)].map((match) => match[0]);
  return {
    scores: { conciseness: 3, delta_over_base: 3, agnosticism: 4, actionability: 4 },
    trim_candidates: headings.length > 1 ? [headings[headings.length - 1]] : [],
    notes: 'Canned LOOM_JUDGE_MOCK output; not a real model judgment.',
  };
}

export function createJudgeProvider(config, { fetchImpl = fetch } = {}) {
  if (config.mock) {
    let canned = null;
    if (config.mock.trim().startsWith('{')) {
      canned = parseJudgeResponse(config.mock);
    }
    return {
      kind: 'mock',
      model: 'mock',
      async judge(context) {
        return canned ?? mockJudgeResult(context);
      },
    };
  }
  if (!config.apiKey) throw new Error('LOOM_JUDGE_API_KEY is required for live judge calls');
  if (!config.model) {
    throw new Error('LOOM_JUDGE_MODEL is required when LOOM_JUDGE_API_KEY is set');
  }
  return {
    kind: 'openai-compatible',
    model: config.model,
    async judge(context, { rubric }) {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: buildJudgeMessages({ rubric, context }),
        }),
      });
      if (!response.ok) {
        throw new Error(`judge endpoint returned HTTP ${response.status}`);
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('judge endpoint response is missing choices[0].message.content');
      }
      return parseJudgeResponse(content);
    },
  };
}

export function scorecardTimestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

export function renderScorecardMarkdown(scorecard) {
  const lines = [
    '# Loom skill judge scorecard',
    '',
    `- Generated: ${scorecard.generatedAt}`,
    `- Judge: ${scorecard.judge.provider} (model: ${scorecard.judge.model})`,
    `- Rubric: ${scorecard.rubric}`,
    '',
    '| Skill | Conciseness | Delta over base | Agnosticism | Actionability | Total |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const entry of scorecard.skills) {
    const { scores } = entry;
    lines.push(`| \`${entry.skill}\` | ${scores.conciseness} | ${scores.delta_over_base} | ${scores.agnosticism} | ${scores.actionability} | ${entry.total} |`);
  }
  for (const entry of scorecard.skills) {
    lines.push('', `## ${entry.skill}`, '');
    if (entry.trim_candidates.length > 0) {
      lines.push('Trim candidates:', '');
      for (const candidate of entry.trim_candidates) lines.push(`- ${candidate}`);
    } else {
      lines.push('Trim candidates: none.');
    }
    if (entry.notes) lines.push('', entry.notes);
  }
  lines.push('');
  return lines.join('\n');
}

export async function runJudge({
  repoRoot = defaultRepoRoot,
  skill = null,
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  const config = resolveJudgeConfig(env);
  if (!config.enabled) throw new Error('judge is not enabled; check resolveJudgeConfig first');
  const provider = createJudgeProvider(config, { fetchImpl });
  const rubric = fs.readFileSync(path.join(repoRoot, RUBRIC_RELATIVE_PATH), 'utf8');

  const skills = skill ? [skill] : listJudgeSkills(repoRoot);
  if (skills.length === 0) throw new Error('no skills with SKILL.md found under skills/');

  const entries = [];
  for (const name of skills) {
    const context = loadSkillContext(name, repoRoot);
    const result = await provider.judge(context, { rubric });
    entries.push({
      skill: name,
      evals_included: Boolean(context.evalsJson),
      scores: result.scores,
      total: JUDGE_SCORE_DIMENSIONS.reduce((sum, dimension) => sum + result.scores[dimension], 0),
      trim_candidates: result.trim_candidates,
      notes: result.notes,
    });
  }

  const generatedAt = now().toISOString();
  const scorecard = {
    schemaVersion: 1,
    benchmark: 'skill-judge',
    generatedAt,
    rubric: RUBRIC_RELATIVE_PATH,
    judge: { provider: provider.kind, model: provider.model },
    skills: entries,
  };

  const retroDir = path.join(repoRoot, 'retro');
  fs.mkdirSync(retroDir, { recursive: true });
  const slug = scorecardTimestampSlug(new Date(generatedAt));
  const jsonPath = path.join(retroDir, `judge-scorecard-${slug}.json`);
  const mdPath = path.join(retroDir, `judge-scorecard-${slug}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderScorecardMarkdown(scorecard));

  return { scorecard, jsonPath, mdPath };
}
