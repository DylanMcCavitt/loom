#!/usr/bin/env node
// Uplift/ablation harness for a single skill (eval-ladder tier 3), invoked
// through `npm run bench -- --ablate <skill>`; never wired into
// `npm run check`, validators, or CI.
//
// Produces three skill variants — full (SKILL.md as shipped), absent (no
// skill), trimmed (SKILL.md minus the latest judge scorecard's trim
// candidates, or minus every section after the first when no judge output is
// available) — and materializes one roboports benchmark workspace per variant.
//
// Full arm execution needs a live worker model driving each workspace, which
// this offline CLI never performs (worker != grader). It degrades gracefully:
// it materializes the three workspaces, runs the rig's deterministic checks
// and mechanical scorer once per variant to record the pre-arm baseline
// outcome, and writes a comparison manifest so a human/agent can run the arms
// and re-score. Variant SKILL.md files live beside the workspaces (under
// skill-variants/), not inside the sandbox repos, because skills activate at
// the harness level, not in the benchmark target repo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const defaultRepoRoot = path.resolve(here, '..', '..');

export const ABLATION_VARIANTS = Object.freeze(['full', 'absent', 'trimmed']);

function headingLevel(heading) {
  return heading.match(/^#+/u)?.[0].length ?? 0;
}

// Remove a whole markdown section: from the candidate heading line through the
// line before the next heading of the same or higher level.
function removeSection(lines, heading) {
  const level = headingLevel(heading);
  const start = lines.findIndex((line) => line.trim() === heading.trim());
  if (start === -1) return { lines, removed: false };
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const lineLevel = headingLevel(lines[index]);
    if (lineLevel > 0 && lineLevel <= level) {
      end = index;
      break;
    }
  }
  return { lines: [...lines.slice(0, start), ...lines.slice(end)], removed: true };
}

export function applyTrimCandidates(skillMd, candidates) {
  let lines = skillMd.split('\n');
  const applied = [];
  const missed = [];
  for (const candidate of candidates) {
    if (/^#+\s/u.test(candidate.trim())) {
      const result = removeSection(lines, candidate);
      lines = result.lines;
      (result.removed ? applied : missed).push(candidate);
    } else {
      const before = lines;
      lines = lines.map((line) => (line.includes(candidate) ? line.replace(candidate, '').trimEnd() : line));
      (before.some((line) => line.includes(candidate)) ? applied : missed).push(candidate);
    }
  }
  const content = `${lines.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd()}\n`;
  return { content, applied, missed };
}

// Fallback trim when no judge scorecard covers the skill: keep frontmatter,
// the title/intro, and the first `## ` section; drop everything after it.
export function heuristicTrim(skillMd) {
  const lines = skillMd.split('\n');
  const sectionStarts = [];
  let inFrontmatter = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === '---' && (index === 0 || inFrontmatter)) {
      inFrontmatter = index === 0 ? true : false;
      continue;
    }
    if (!inFrontmatter && /^## /u.test(lines[index])) sectionStarts.push(index);
  }
  if (sectionStarts.length <= 1) return `${skillMd.trimEnd()}\n`;
  return `${lines.slice(0, sectionStarts[1]).join('\n').trimEnd()}\n`;
}

export function latestJudgeTrimCandidates({ repoRoot = defaultRepoRoot, skill }) {
  const retroDir = path.join(repoRoot, 'retro');
  if (!fs.existsSync(retroDir)) return null;
  const scorecards = fs.readdirSync(retroDir)
    .filter((name) => /^judge-scorecard-.*\.json$/u.test(name))
    .sort((a, b) => b.localeCompare(a));
  for (const name of scorecards) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(retroDir, name), 'utf8'));
    } catch {
      continue;
    }
    const entry = (parsed.skills ?? []).find((item) => item.skill === skill);
    if (entry && Array.isArray(entry.trim_candidates)) {
      return { scorecard: name, trimCandidates: entry.trim_candidates };
    }
  }
  return null;
}

export function buildSkillVariants({ skillMd, judgeTrim = null }) {
  let trimmedContent;
  let trimSource;
  if (judgeTrim && judgeTrim.trimCandidates.length > 0) {
    trimmedContent = applyTrimCandidates(skillMd, judgeTrim.trimCandidates).content;
    trimSource = `judge scorecard ${judgeTrim.scorecard}`;
  } else {
    trimmedContent = heuristicTrim(skillMd);
    trimSource = 'heuristic (sections after the first dropped; no judge trim candidates available)';
  }
  return {
    trimSource,
    variants: [
      { name: 'full', content: `${skillMd.trimEnd()}\n` },
      { name: 'absent', content: null },
      { name: 'trimmed', content: trimmedContent },
    ],
  };
}

function summarizeOutcome(score) {
  return {
    anchors_passed: score.anchors_passed,
    correct_count: score.scenarios.filter((scenario) => scenario.correct).length,
    scenarios: score.scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      correct: scenario.correct,
      loc: scenario.score.loc,
      scope: scenario.score.scope,
      new_deps: scenario.score.new_deps,
    })),
  };
}

export function defaultAblationDest(skill) {
  return path.join(os.tmpdir(), `loom-ablation-${skill}-${Date.now()}`);
}

export function runAblation({
  repoRoot = defaultRepoRoot,
  skill,
  dest,
  force = false,
  materializeFn,
  scoreFn,
}) {
  if (!skill) throw new Error('--ablate requires <skill>');
  if (typeof materializeFn !== 'function' || typeof scoreFn !== 'function') {
    throw new Error('runAblation requires materializeFn and scoreFn');
  }
  const skillPath = path.join(repoRoot, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`unknown skill: ${skill} (no skills/${skill}/SKILL.md)`);
  }
  const skillMd = fs.readFileSync(skillPath, 'utf8');
  const judgeTrim = latestJudgeTrimCandidates({ repoRoot, skill });
  const { trimSource, variants } = buildSkillVariants({ skillMd, judgeTrim });

  const destRoot = path.resolve(dest ?? defaultAblationDest(skill));
  const skillVariantsDir = path.join(destRoot, 'skill-variants');
  fs.mkdirSync(skillVariantsDir, { recursive: true });

  const variantReports = [];
  for (const variant of variants) {
    const workspace = path.join(destRoot, variant.name);
    const materialized = materializeFn(workspace, { force });

    let skillFile = null;
    if (variant.content !== null) {
      const variantDir = path.join(skillVariantsDir, variant.name);
      fs.mkdirSync(variantDir, { recursive: true });
      skillFile = path.join(variantDir, 'SKILL.md');
      fs.writeFileSync(skillFile, variant.content);
    }

    const baselineOutcome = summarizeOutcome(scoreFn(materialized.dest));
    variantReports.push({
      variant: variant.name,
      workspace: materialized.dest,
      baseline_commit: materialized.baseline,
      skill_file: skillFile,
      skill_bytes: variant.content === null ? 0 : Buffer.byteLength(variant.content),
      skill_lines: variant.content === null ? 0 : variant.content.trimEnd().split('\n').length,
      baseline_outcome: baselineOutcome,
    });
  }

  const full = variantReports.find((report) => report.variant === 'full');
  const deltasVsFull = variantReports
    .filter((report) => report.variant !== 'full')
    .map((report) => ({
      variant: report.variant,
      correct_count_delta: report.baseline_outcome.correct_count - full.baseline_outcome.correct_count,
    }));

  const manifest = {
    schemaVersion: 1,
    benchmark: 'roboports-ablation',
    skill,
    trim_source: trimSource,
    status: 'materialized — arms not yet run (full arm execution needs a live worker model; worker != grader)',
    variants: variantReports,
    deltas_vs_full: deltasVsFull,
    how_to_run: [
      'For each variant workspace, run the same agent + task prompts from <workspace>/.bench/tasks/:',
      '- full: activate skill-variants/full/SKILL.md in the worker harness.',
      '- absent: run with no skill active.',
      '- trimmed: activate skill-variants/trimmed/SKILL.md in the worker harness.',
      'Then re-score each arm with: npm run bench -- --score <workspace>',
      'Compare correct/loc/scope/new_deps across variants; the recorded baseline_outcome is the pre-arm state (all scenarios unfixed).',
    ],
  };

  const manifestPath = path.join(destRoot, 'ablation-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath, destRoot };
}
