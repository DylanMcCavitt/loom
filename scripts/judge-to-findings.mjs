#!/usr/bin/env node
// Convert judge scorecards into repair-pack finding packets under
// retro/findings/<skill>/<slug>.md. Deterministic; no model calls.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { JUDGE_SCORE_DIMENSIONS } from '../benchmarks/judge/judge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(here, '..');

export const FINDING_PACKET_FIELDS = Object.freeze([
  'file',
  'symbol',
  'scope',
  'concrete risk',
  'minimal expected fix',
  'proof check',
  'rule/source id',
  'non-goals',
  'allowed files',
]);

export const FINDINGS_RELATIVE_DIR = 'retro/findings';

const SCORECARD_JSON_RE = /^judge-scorecard-.*\.json$/u;

function usage() {
  return [
    'Usage: node scripts/judge-to-findings.mjs [scorecard-or-dir]',
    '',
    'Convert judge trim_candidates into repair-pack finding packets under',
    'retro/findings/<skill>/. Default: latest retro/judge-scorecard-*.json.',
    'Stale candidates are flagged; re-runs are idempotent.',
  ].join('\n');
}

export function slugifyCandidate(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/^#+\s*/u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 48);
  return slug || 'trim-candidate';
}

export function contentHash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 12);
}

export function findingSlug(skill, candidate) {
  const base = slugifyCandidate(candidate);
  const hash = contentHash({ skill, candidate });
  return `${base}-${hash}`;
}

export function listScorecardFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => SCORECARD_JSON_RE.test(name))
    .map((name) => path.join(dir, name))
    .sort((a, b) => a.localeCompare(b));
}

export function loadScorecard(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`malformed scorecard ${filePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`malformed scorecard ${filePath}: expected a JSON object`);
  }
  if (!Array.isArray(parsed.skills)) {
    throw new Error(`malformed scorecard ${filePath}: missing skills[]`);
  }
  return { ...parsed, file: path.basename(filePath), path: filePath };
}

export function resolveScorecardPaths(input, { root = defaultRepoRoot } = {}) {
  if (!input) {
    const files = listScorecardFiles(path.join(root, 'retro'));
    if (files.length === 0) {
      throw new Error('no judge scorecards found under retro/; run npm run bench -- --judge first');
    }
    const loaded = files.map((file) => loadScorecard(file));
    loaded.sort((a, b) => String(a.generatedAt ?? '').localeCompare(String(b.generatedAt ?? '')));
    return [loaded[loaded.length - 1].path];
  }

  const resolved = path.resolve(root, input);
  if (!fs.existsSync(resolved)) {
    throw new Error(`scorecard path not found: ${input}`);
  }
  if (fs.statSync(resolved).isDirectory()) {
    const files = listScorecardFiles(resolved);
    if (files.length === 0) {
      throw new Error(`no judge-scorecard-*.json files in ${input}`);
    }
    return files;
  }
  return [resolved];
}

export function candidateStillPresent(skillMd, candidate) {
  const needle = String(candidate).trim();
  if (!needle) return false;
  if (needle.startsWith('#')) {
    return skillMd.split(/\r?\n/u).some((line) => line.trim() === needle);
  }
  return skillMd.includes(needle);
}

export function pickRubricDimension(scores = {}) {
  let worst = null;
  let worstScore = Number.POSITIVE_INFINITY;
  for (const dimension of JUDGE_SCORE_DIMENSIONS) {
    const value = scores[dimension];
    if (!Number.isInteger(value)) continue;
    if (value < worstScore) {
      worstScore = value;
      worst = dimension;
    }
  }
  return worst ?? 'conciseness';
}

export function buildFindingPacket({
  skill,
  candidate,
  scores,
  notes,
  scorecardFile,
  generatedAt,
}) {
  const dimension = pickRubricDimension(scores);
  const scoreLine = JUDGE_SCORE_DIMENSIONS
    .map((name) => `${name}=${scores?.[name] ?? '?'}`)
    .join(', ');
  const isHeading = String(candidate).trim().startsWith('#');
  const file = `skills/${skill}/SKILL.md`;
  const riskParts = [
    `Token cost; rubric/${dimension} weakest (${scoreLine}).`,
  ];
  if (notes) riskParts.push(`Judge notes: ${notes}.`);
  riskParts.push(`Source: ${scorecardFile}${generatedAt ? ` @ ${generatedAt}` : ''}.`);
  return {
    file,
    symbol: candidate,
    scope: isHeading
      ? `Section "${candidate}" only in ${file}`
      : `Quoted sentence only in ${file}`,
    'concrete risk': riskParts.join(' '),
    'minimal expected fix': isHeading
      ? `Delete or tighten section ${JSON.stringify(candidate)}.`
      : `Delete or tighten sentence ${JSON.stringify(candidate)}.`,
    'proof check': `npm run check; npm run bench -- --judge ${skill}`,
    'rule/source id': `rubric/${dimension}`,
    'non-goals': 'No behavioral rule changes; no other sections; no evals/references/harness edits.',
    'allowed files': `${file} (version/changelog bump only)`,
  };
}

export function renderFindingMarkdown(packet, { skill, slug, contentHash: hash, scorecardFile } = {}) {
  return [
    `# Repair finding: ${skill}/${slug}`,
    '',
    `- Generated by: \`scripts/judge-to-findings.mjs\``,
    `- Source scorecard: \`${scorecardFile ?? 'unknown'}\``,
    `- Content hash: \`${hash}\``,
    `- Status: pending-repair`,
    '',
    '```json',
    JSON.stringify(packet, null, 2),
    '```',
    '',
  ].join('\n');
}

export function extractPacketFromMarkdown(markdown) {
  const match = String(markdown).match(/```json\s*\n([\s\S]*?)\n\s*```/u);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function validateFindingPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return { ok: false, errors: ['packet must be an object'] };
  }
  for (const field of FINDING_PACKET_FIELDS) {
    if (!(field in packet)) errors.push(`missing ${field}`);
    else if (packet[field] == null || packet[field] === '') errors.push(`empty ${field}`);
  }
  return { ok: errors.length === 0, errors };
}

function loadSkillMd(skill, root) {
  const skillPath = path.join(root, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) return null;
  return fs.readFileSync(skillPath, 'utf8');
}

export function convertScorecardToFindings(scorecard, {
  root = defaultRepoRoot,
  write = true,
} = {}) {
  const scorecardFile = scorecard.file ?? path.basename(scorecard.path ?? 'scorecard.json');
  const generatedAt = scorecard.generatedAt ?? null;
  const written = [];
  const skipped = [];
  const stale = [];
  const errors = [];

  for (const entry of scorecard.skills) {
    if (!entry || typeof entry.skill !== 'string') {
      errors.push('scorecard skill entry missing skill name');
      continue;
    }
    const skill = entry.skill;
    const skillMd = loadSkillMd(skill, root);
    if (skillMd == null) {
      errors.push(`skills/${skill}/SKILL.md not found; skipping skill`);
      continue;
    }

    const candidates = Array.isArray(entry.trim_candidates) ? entry.trim_candidates : [];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) {
        errors.push(`${skill}: empty trim_candidate skipped`);
        continue;
      }

      if (!candidateStillPresent(skillMd, candidate)) {
        stale.push({
          skill,
          candidate,
          reason: 'candidate text not found in current SKILL.md',
          scorecard: scorecardFile,
        });
        continue;
      }

      const slug = findingSlug(skill, candidate);
      const packet = buildFindingPacket({
        skill,
        candidate,
        scores: entry.scores ?? {},
        notes: entry.notes ?? '',
        scorecardFile,
        generatedAt,
      });
      const validation = validateFindingPacket(packet);
      if (!validation.ok) {
        errors.push(`${skill}/${slug}: ${validation.errors.join('; ')}`);
        continue;
      }

      const hash = contentHash(packet);
      const relativePath = path.posix.join(FINDINGS_RELATIVE_DIR, skill, `${slug}.md`);
      const absolutePath = path.join(root, ...relativePath.split('/'));
      const markdown = renderFindingMarkdown(packet, {
        skill,
        slug,
        contentHash: hash,
        scorecardFile,
      });

      if (fs.existsSync(absolutePath)) {
        const existingPacket = extractPacketFromMarkdown(fs.readFileSync(absolutePath, 'utf8'));
        if (existingPacket && contentHash(existingPacket) === hash) {
          skipped.push({ path: relativePath, reason: 'idempotent-skip', contentHash: hash });
          continue;
        }
      }

      if (write) {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, markdown);
      }
      written.push({ path: relativePath, skill, slug, contentHash: hash, packet });
    }
  }

  return { written, skipped, stale, errors, scorecardFile };
}

export function runJudgeToFindings({
  input = null,
  root = defaultRepoRoot,
  write = true,
} = {}) {
  const paths = resolveScorecardPaths(input, { root });
  const results = [];
  for (const scorecardPath of paths) {
    const scorecard = loadScorecard(scorecardPath);
    results.push({
      scorecardPath,
      ...convertScorecardToFindings(scorecard, { root, write }),
    });
  }
  return results;
}

function parseArgs(argv) {
  const args = { input: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--repo-root') args.root = path.resolve(argv[++index]);
    else if (arg.startsWith('-')) throw new Error(`unknown argument: ${arg}`);
    else if (args.input == null) args.input = arg;
    else throw new Error(`unexpected extra argument: ${arg}`);
  }
  return args;
}

export function main(argv = process.argv.slice(2), { root = defaultRepoRoot } = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return { help: true };
  }
  const effectiveRoot = args.root ?? root;
  const results = runJudgeToFindings({ input: args.input, root: effectiveRoot, write: true });

  let wrote = 0;
  let skipped = 0;
  let stale = 0;
  for (const result of results) {
    console.log(`scorecard: ${result.scorecardFile}`);
    for (const item of result.written) {
      console.log(`  wrote: ${item.path}`);
      wrote += 1;
    }
    for (const item of result.skipped) {
      console.log(`  skipped: ${item.path} (${item.reason})`);
      skipped += 1;
    }
    for (const item of result.stale) {
      console.log(`  stale: ${item.skill}: ${JSON.stringify(item.candidate)} — ${item.reason}`);
      stale += 1;
    }
    for (const error of result.errors) {
      console.error(`  error: ${error}`);
    }
  }
  console.log(`judge-to-findings: wrote ${wrote}, skipped ${skipped}, stale ${stale}`);
  return { results, wrote, skipped, stale };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`judge-to-findings: ${error.message}`);
    process.exit(1);
  }
}
