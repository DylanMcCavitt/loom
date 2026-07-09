#!/usr/bin/env node
// Offline eval dashboard: renders gitignored judge scorecards from retro/
// into a self-contained HTML file plus a compact stdout summary, so the
// operator can drive the scorecard -> edit -> bump version -> re-judge loop.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseFrontmatter } from './lib/frontmatter.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DIMENSIONS = ['conciseness', 'delta_over_base', 'agnosticism', 'actionability'];

export function loadScorecards({ root = repoRoot, warn = (message) => console.error(message) } = {}) {
  const retroDir = path.join(root, 'retro');
  if (!fs.existsSync(retroDir)) return [];
  const files = fs.readdirSync(retroDir)
    .filter((name) => /^judge-scorecard-.*\.json$/u.test(name))
    .sort((a, b) => a.localeCompare(b));

  const scorecards = [];
  for (const name of files) {
    const filePath = path.join(retroDir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      warn(`eval-dashboard: skipping malformed scorecard ${name}: ${error.message}`);
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.skills) || typeof parsed.generatedAt !== 'string') {
      warn(`eval-dashboard: skipping malformed scorecard ${name}: missing skills[] or generatedAt`);
      continue;
    }
    scorecards.push({ file: name, ...parsed });
  }
  scorecards.sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return scorecards;
}

export function loadSkillVersions({ root = repoRoot } = {}) {
  const skillsDir = path.join(root, 'skills');
  const versions = {};
  if (!fs.existsSync(skillsDir)) return versions;
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const parsed = parseFrontmatter(fs.readFileSync(skillPath, 'utf8'));
    const metadata = parsed?.data?.metadata;
    versions[entry.name] = (metadata && typeof metadata === 'object' && typeof metadata.version === 'string')
      ? metadata.version
      : null;
  }
  return versions;
}

function runFromEntry(scorecard, entry) {
  return {
    generatedAt: scorecard.generatedAt,
    file: scorecard.file,
    judge: {
      provider: scorecard.judge?.provider ?? 'unknown',
      model: scorecard.judge?.model ?? 'unknown',
    },
    mock: scorecard.judge?.provider === 'mock',
    scores: Object.fromEntries(DIMENSIONS.map((dim) => [dim, entry.scores?.[dim] ?? null])),
    total: entry.total ?? null,
    trimCandidates: Array.isArray(entry.trim_candidates) ? entry.trim_candidates : [],
    notes: typeof entry.notes === 'string' ? entry.notes : '',
  };
}

export function buildDashboardModel({ scorecards, versions = {}, now = new Date() }) {
  const bySkill = new Map();
  for (const scorecard of scorecards) {
    for (const entry of scorecard.skills) {
      if (!entry || typeof entry.skill !== 'string') continue;
      if (!bySkill.has(entry.skill)) bySkill.set(entry.skill, []);
      bySkill.get(entry.skill).push(runFromEntry(scorecard, entry));
    }
  }

  const skills = [...bySkill.keys()].sort((a, b) => a.localeCompare(b)).map((skill) => {
    const runs = bySkill.get(skill); // chronological (loadScorecards sorts by generatedAt)
    const latest = runs[runs.length - 1];
    const previous = runs.length > 1 ? runs[runs.length - 2] : null;
    const delta = previous && latest.total !== null && previous.total !== null
      ? latest.total - previous.total
      : null;
    return {
      skill,
      version: versions[skill] ?? null,
      runs: [...runs].reverse(), // newest first for display
      totalsOverTime: runs.map((run) => run.total).filter((total) => total !== null),
      latest,
      previous,
      delta,
    };
  });

  return {
    generatedAt: now.toISOString(),
    scorecardCount: scorecards.length,
    skills,
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderSparkline(totals, { width = 120, height = 24, max = 20 } = {}) {
  if (!totals.length) return '';
  const pad = 2;
  const points = totals.map((total, index) => {
    const x = totals.length === 1
      ? width / 2
      : pad + (index * (width - 2 * pad)) / (totals.length - 1);
    const y = height - pad - (Math.max(0, Math.min(max, total)) * (height - 2 * pad)) / max;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const shape = totals.length === 1
    ? `<circle cx="${points[0].split(',')[0]}" cy="${points[0].split(',')[1]}" r="2" fill="#2563eb"/>`
    : `<polyline points="${points.join(' ')}" fill="none" stroke="#2563eb" stroke-width="1.5"/>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="total scores over time">${shape}</svg>`;
}

function deltaGlyph(delta) {
  if (delta === null) return '—';
  if (delta > 0) return `▲ +${delta}`;
  if (delta < 0) return `▼ ${delta}`;
  return '=';
}

function mockBadge(run) {
  return run.mock ? ' <span class="mock-badge">mock</span>' : '';
}

export function renderDashboardHtml(model) {
  const summaryRows = model.skills.map((skillModel) => {
    const { latest } = skillModel;
    const rowClass = latest.mock ? ' class="mock"' : '';
    const scoreCells = DIMENSIONS.map((dim) => `<td>${latest.scores[dim] ?? '—'}</td>`).join('');
    return `<tr${rowClass}><td>${escapeHtml(skillModel.skill)}</td><td>${escapeHtml(skillModel.version ?? '—')}</td><td>${latest.total ?? '—'}/20</td>${scoreCells}<td>${deltaGlyph(skillModel.delta)}</td><td>${latest.trimCandidates.length}</td><td>${escapeHtml(latest.judge.model)}${mockBadge(latest)}</td><td>${renderSparkline(skillModel.totalsOverTime)}</td></tr>`;
  }).join('\n');

  const historySections = model.skills.map((skillModel) => {
    const historyRows = skillModel.runs.map((run) => {
      const rowClass = run.mock ? ' class="mock"' : '';
      const scoreCells = DIMENSIONS.map((dim) => `<td>${run.scores[dim] ?? '—'}</td>`).join('');
      return `<tr${rowClass}><td>${escapeHtml(run.generatedAt)}</td><td>${escapeHtml(run.judge.model)}${mockBadge(run)}</td>${scoreCells}<td>${run.total ?? '—'}/20</td><td>${run.trimCandidates.length}</td></tr>`;
    }).join('\n');
    const trims = skillModel.latest.trimCandidates.length
      ? `<ul>${skillModel.latest.trimCandidates.map((candidate) => `<li><code>${escapeHtml(candidate)}</code></li>`).join('')}</ul>`
      : '<p class="muted">No open trim candidates.</p>';
    const notes = skillModel.latest.notes
      ? `<p><strong>Latest notes:</strong> ${escapeHtml(skillModel.latest.notes)}</p>`
      : '';
    return [
      `<section><h3>${escapeHtml(skillModel.skill)} <span class="muted">(version ${escapeHtml(skillModel.version ?? 'unknown')})</span></h3>`,
      renderSparkline(skillModel.totalsOverTime, { width: 240, height: 40 }),
      '<table><thead><tr><th>Generated</th><th>Judge model</th><th>Concise</th><th>Delta/base</th><th>Agnostic</th><th>Action</th><th>Total</th><th>Trims</th></tr></thead>',
      `<tbody>${historyRows}</tbody></table>`,
      '<h4>Latest trim candidates</h4>',
      trims,
      notes,
      '</section>',
    ].join('\n');
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Loom eval dashboard</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 72rem; padding: 0 1rem; color: #111827; }
  h1 { font-size: 1.4rem; }
  table { border-collapse: collapse; margin: 0.75rem 0 1.5rem; width: 100%; }
  th, td { border: 1px solid #d1d5db; padding: 0.35rem 0.6rem; text-align: left; }
  th { background: #f3f4f6; }
  tr.mock td { color: #6b7280; font-style: italic; }
  .mock-badge { background: #9ca3af; color: #fff; border-radius: 3px; font-size: 0.7rem; font-style: normal; padding: 0 0.3rem; vertical-align: middle; }
  .muted { color: #6b7280; }
  .banner { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; padding: 0.5rem 0.75rem; }
  section { margin-bottom: 2rem; }
  code { background: #f3f4f6; padding: 0 0.2rem; }
</style>
</head>
<body>
<h1>Loom eval dashboard</h1>
<p class="muted">Generated ${escapeHtml(model.generatedAt)} from ${model.scorecardCount} scorecard(s) in <code>retro/</code>. Skill versions read from <code>skills/*/SKILL.md</code> at generation time.</p>
<p class="banner">Runs marked <span class="mock-badge">mock</span> (judge provider <code>mock</code>) are canned scores, not real judgments — do not treat them as quality signals.</p>
<h2>Summary</h2>
<table><thead><tr><th>Skill</th><th>Version</th><th>Latest total</th><th>Concise</th><th>Delta/base</th><th>Agnostic</th><th>Action</th><th>Δ vs prev</th><th>Open trims</th><th>Judge model</th><th>Trend</th></tr></thead>
<tbody>
${summaryRows}
</tbody></table>
<h2>Per-skill history</h2>
${historySections}
</body>
</html>
`;
}

export function renderTextSummary(model) {
  const header = ['skill', 'version', 'latest total', 'delta'];
  const rows = model.skills.map((skillModel) => [
    skillModel.skill,
    skillModel.version ?? '-',
    `${skillModel.latest.total ?? '-'}/20${skillModel.latest.mock ? ' (mock)' : ''}`,
    deltaGlyph(skillModel.delta),
  ]);
  const widths = header.map((_, column) => Math.max(header[column].length, ...rows.map((row) => row[column].length)));
  const line = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();
  return [line(header), line(widths.map((width) => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

export function main({ root = repoRoot, now = new Date() } = {}) {
  const scorecards = loadScorecards({ root });
  if (!scorecards.length) {
    console.log('eval-dashboard: no judge scorecards found under retro/.');
    console.log('Run a judge pass first, e.g.: npm run bench -- --judge (see docs/operator/evals.md).');
    return null;
  }

  const versions = loadSkillVersions({ root });
  const model = buildDashboardModel({ scorecards, versions, now });
  const html = renderDashboardHtml(model);
  const outPath = path.join(root, 'retro', 'eval-dashboard.html');
  fs.writeFileSync(outPath, html);

  console.log(renderTextSummary(model));
  console.log('');
  console.log(`eval dashboard: ${outPath}`);
  return { model, outPath };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`eval-dashboard: ${error.message}`);
    process.exit(1);
  }
}
