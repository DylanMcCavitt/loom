import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FINDING_PACKET_FIELDS,
  buildFindingPacket,
  candidateStillPresent,
  convertScorecardToFindings,
  extractPacketFromMarkdown,
  findingSlug,
  loadScorecard,
  main,
  resolveScorecardPaths,
  runJudgeToFindings,
  validateFindingPacket,
} from '../scripts/judge-to-findings.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureScorecard = path.join(repoRoot, 'tests/fixtures/judge-scorecard-findings.json');
const scriptPath = path.join(repoRoot, 'scripts/judge-to-findings.mjs');

const SAMPLE_SKILL_MD = [
  '---',
  'name: sample-skill',
  'metadata:',
  '  version: "0.1.0"',
  '---',
  '',
  '# Sample Skill',
  '',
  '## Operating Contract',
  '',
  'Do the work.',
  '',
  '## Filler Section',
  '',
  'This sentence restates the obvious and can be cut.',
  '',
  'Keep this other sentence.',
  '',
].join('\n');

function makeFixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'judge-to-findings-'));
  mkdirSync(path.join(root, 'skills', 'sample-skill'), { recursive: true });
  mkdirSync(path.join(root, 'retro'), { recursive: true });
  writeFileSync(path.join(root, 'skills', 'sample-skill', 'SKILL.md'), SAMPLE_SKILL_MD);
  writeFileSync(
    path.join(root, 'retro', 'judge-scorecard-2026-07-09T12-00-00-000Z.json'),
    readFileSync(fixtureScorecard, 'utf8'),
  );
  return root;
}

test('fixture scorecard loads with trim_candidates', () => {
  const scorecard = loadScorecard(fixtureScorecard);
  assert.equal(scorecard.benchmark, 'skill-judge');
  assert.equal(scorecard.skills.length, 1);
  assert.equal(scorecard.skills[0].trim_candidates.length, 3);
});

test('candidateStillPresent matches headings and sentences', () => {
  assert.equal(candidateStillPresent(SAMPLE_SKILL_MD, '## Filler Section'), true);
  assert.equal(
    candidateStillPresent(SAMPLE_SKILL_MD, 'This sentence restates the obvious and can be cut.'),
    true,
  );
  assert.equal(candidateStillPresent(SAMPLE_SKILL_MD, '## Gone Section'), false);
  assert.equal(candidateStillPresent(SAMPLE_SKILL_MD, 'not in the file at all'), false);
});

test('buildFindingPacket includes all nine required fields', () => {
  const packet = buildFindingPacket({
    skill: 'sample-skill',
    candidate: '## Filler Section',
    scores: { conciseness: 2, delta_over_base: 3, agnosticism: 4, actionability: 4 },
    notes: 'Conciseness is weak.',
    scorecardFile: 'judge-scorecard-test.json',
    generatedAt: '2026-07-09T12:00:00.000Z',
  });
  const validation = validateFindingPacket(packet);
  assert.deepEqual(validation, { ok: true, errors: [] });
  for (const field of FINDING_PACKET_FIELDS) {
    assert.ok(packet[field], `missing ${field}`);
  }
  assert.equal(packet.file, 'skills/sample-skill/SKILL.md');
  assert.equal(packet.symbol, '## Filler Section');
  assert.match(packet.scope, /Section "## Filler Section" only/u);
  assert.match(packet['concrete risk'], /rubric\/conciseness/u);
  assert.match(packet['minimal expected fix'], /Delete or tighten/u);
  assert.match(packet['proof check'], /npm run check/u);
  assert.match(packet['proof check'], /--judge sample-skill/u);
  assert.equal(packet['rule/source id'], 'rubric/conciseness');
  assert.match(packet['non-goals'], /No behavioral rule changes/u);
  assert.match(packet['allowed files'], /^skills\/sample-skill\/SKILL\.md/u);
  assert.match(packet['allowed files'], /version\/changelog bump only/u);
});

test('convertScorecardToFindings emits packets, flags stale, and is idempotent', () => {
  const root = makeFixtureRoot();
  try {
    const scorecardPath = path.join(root, 'retro', 'judge-scorecard-2026-07-09T12-00-00-000Z.json');
    const scorecard = loadScorecard(scorecardPath);
    const first = convertScorecardToFindings(scorecard, { root, write: true });

    assert.equal(first.written.length, 2, 'two live candidates should emit');
    assert.equal(first.stale.length, 1, 'one stale candidate should be flagged');
    assert.equal(first.stale[0].candidate, '## Gone Section');
    assert.match(first.stale[0].reason, /not found/u);

    const findingsDir = path.join(root, 'retro', 'findings', 'sample-skill');
    const files = readdirSync(findingsDir).sort();
    assert.equal(files.length, 2);

    for (const name of files) {
      const markdown = readFileSync(path.join(findingsDir, name), 'utf8');
      assert.match(markdown, /```json/u);
      const packet = extractPacketFromMarkdown(markdown);
      assert.ok(packet);
      assert.equal(validateFindingPacket(packet).ok, true);
      for (const field of FINDING_PACKET_FIELDS) {
        assert.ok(Object.hasOwn(packet, field), `${name} missing ${field}`);
      }
    }

    const second = convertScorecardToFindings(scorecard, { root, write: true });
    assert.equal(second.written.length, 0, 'second run must not rewrite');
    assert.equal(second.skipped.length, 2, 'both packets skipped as idempotent');
    assert.equal(readdirSync(findingsDir).length, 2, 'no duplicate files');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveScorecardPaths discovers latest scorecard under retro/', () => {
  const root = makeFixtureRoot();
  try {
    writeFileSync(
      path.join(root, 'retro', 'judge-scorecard-older.json'),
      JSON.stringify({
        generatedAt: '2026-01-01T00:00:00.000Z',
        skills: [],
      }),
    );
    writeFileSync(
      path.join(root, 'retro', 'judge-scorecard-newer.json'),
      JSON.stringify({
        generatedAt: '2026-07-09T15:00:00.000Z',
        skills: [],
      }),
    );
    const [latest] = resolveScorecardPaths(null, { root });
    assert.match(latest, /judge-scorecard-newer\.json$/u);

    const fromDir = resolveScorecardPaths('retro', { root });
    assert.ok(fromDir.length >= 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findingSlug is stable for the same candidate', () => {
  const a = findingSlug('sample-skill', '## Filler Section');
  const b = findingSlug('sample-skill', '## Filler Section');
  assert.equal(a, b);
  assert.match(a, /^filler-section-[a-f0-9]{12}$/u);
});

test('CLI main writes findings and skips on re-run', () => {
  const root = makeFixtureRoot();
  try {
    const logs = [];
    const originalLog = console.log;
    console.log = (message) => logs.push(String(message));
    try {
      const first = main(['retro/judge-scorecard-2026-07-09T12-00-00-000Z.json'], { root });
      assert.equal(first.wrote, 2);
      assert.equal(first.stale, 1);

      const second = main(['retro/judge-scorecard-2026-07-09T12-00-00-000Z.json'], { root });
      assert.equal(second.wrote, 0);
      assert.equal(second.skipped, 2);
    } finally {
      console.log = originalLog;
    }
    assert.match(logs.join('\n'), /wrote 2/u);
    assert.match(logs.join('\n'), /stale/u);
    assert.ok(existsSync(path.join(root, 'retro', 'findings', 'sample-skill')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI binary exits 0 against a fixture scorecard path', () => {
  const root = makeFixtureRoot();
  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, path.join(root, 'retro', 'judge-scorecard-2026-07-09T12-00-00-000Z.json'), '--repo-root', root],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote 2/u);
    assert.match(result.stdout, /stale/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runJudgeToFindings with directory input processes all scorecards', () => {
  const root = makeFixtureRoot();
  try {
    const results = runJudgeToFindings({ input: 'retro', root, write: true });
    assert.ok(results.length >= 1);
    const totalWritten = results.reduce((sum, result) => sum + result.written.length, 0);
    assert.equal(totalWritten, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
