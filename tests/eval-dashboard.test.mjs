import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildDashboardModel,
  loadScorecards,
  loadSkillVersions,
  main,
  renderDashboardHtml,
  renderSparkline,
  renderTextSummary,
} from "../scripts/eval-dashboard.mjs";

function makeTempRoot() {
  const root = path.join(
    tmpdir(),
    `loom-dashboard-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path.join(root, "retro"), { recursive: true });
  return root;
}

function writeSkill(root, name, version) {
  const dir = path.join(root, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "metadata:",
      `  version: "${version}"`,
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n"),
  );
}

function scorecard({ generatedAt, provider = "mock", model = "mock", skills }) {
  return {
    schemaVersion: 1,
    benchmark: "skill-judge",
    generatedAt,
    rubric: "benchmarks/judge/RUBRIC.md",
    judge: { provider, model },
    skills,
  };
}

function skillEntry({ skill, scores, trim_candidates = [], notes = "" }) {
  return {
    skill,
    evals_included: true,
    scores,
    total: scores.conciseness + scores.delta_over_base + scores.agnosticism + scores.actionability,
    trim_candidates,
    notes,
  };
}

test("main exits gracefully with a hint when no scorecards exist", () => {
  const root = makeTempRoot();
  try {
    const logs = [];
    const originalLog = console.log;
    console.log = (message) => logs.push(message);
    try {
      assert.equal(main({ root }), null);
    } finally {
      console.log = originalLog;
    }
    assert.match(logs.join("\n"), /no judge scorecards found/u);
    assert.match(logs.join("\n"), /npm run bench -- --judge/u);
    assert.ok(!existsSync(path.join(root, "retro", "eval-dashboard.html")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadScorecards skips malformed files with a warning and sorts by generatedAt", () => {
  const root = makeTempRoot();
  try {
    writeFileSync(path.join(root, "retro", "judge-scorecard-b.json"), JSON.stringify(scorecard({
      generatedAt: "2026-01-02T00:00:00.000Z",
      skills: [skillEntry({ skill: "belt", scores: { conciseness: 4, delta_over_base: 4, agnosticism: 4, actionability: 4 } })],
    })));
    writeFileSync(path.join(root, "retro", "judge-scorecard-a.json"), JSON.stringify(scorecard({
      generatedAt: "2026-01-01T00:00:00.000Z",
      skills: [skillEntry({ skill: "belt", scores: { conciseness: 3, delta_over_base: 3, agnosticism: 3, actionability: 3 } })],
    })));
    writeFileSync(path.join(root, "retro", "judge-scorecard-broken.json"), "{not json");
    writeFileSync(path.join(root, "retro", "judge-scorecard-noskills.json"), JSON.stringify({ generatedAt: "2026-01-03T00:00:00.000Z" }));

    const warnings = [];
    const scorecards = loadScorecards({ root, warn: (message) => warnings.push(message) });

    assert.equal(scorecards.length, 2);
    assert.deepEqual(scorecards.map((card) => card.generatedAt), [
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /judge-scorecard-broken\.json/u);
    assert.match(warnings[1], /judge-scorecard-noskills\.json/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildDashboardModel computes deltas, mock flags, and version association", () => {
  const root = makeTempRoot();
  try {
    writeSkill(root, "belt", "0.2.1");
    const scorecards = [
      scorecard({
        generatedAt: "2026-01-01T00:00:00.000Z",
        provider: "mock",
        model: "mock",
        skills: [skillEntry({ skill: "belt", scores: { conciseness: 3, delta_over_base: 3, agnosticism: 3, actionability: 3 } })],
      }),
      scorecard({
        generatedAt: "2026-01-02T00:00:00.000Z",
        provider: "command",
        model: "cursor-auto",
        skills: [skillEntry({
          skill: "belt",
          scores: { conciseness: 4, delta_over_base: 4, agnosticism: 5, actionability: 4 },
          trim_candidates: ["## Example"],
          notes: "second run",
        })],
      }),
    ].map((card, index) => ({ file: `judge-scorecard-${index}.json`, ...card }));

    const model = buildDashboardModel({ scorecards, versions: loadSkillVersions({ root }) });

    assert.equal(model.scorecardCount, 2);
    assert.equal(model.skills.length, 1);
    const belt = model.skills[0];
    assert.equal(belt.skill, "belt");
    assert.equal(belt.version, "0.2.1");
    assert.equal(belt.latest.total, 17);
    assert.equal(belt.previous.total, 12);
    assert.equal(belt.delta, 5);
    assert.equal(belt.latest.mock, false);
    assert.equal(belt.previous.mock, true);
    assert.deepEqual(belt.totalsOverTime, [12, 17]);
    assert.equal(belt.runs[0].generatedAt, "2026-01-02T00:00:00.000Z", "runs are newest first");
    assert.deepEqual(belt.latest.trimCandidates, ["## Example"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderDashboardHtml includes skill rows, mock badges, trims, and sparklines", () => {
  const model = buildDashboardModel({
    scorecards: [
      {
        file: "judge-scorecard-x.json",
        generatedAt: "2026-01-01T00:00:00.000Z",
        judge: { provider: "mock", model: "mock" },
        skills: [skillEntry({
          skill: "belt",
          scores: { conciseness: 4, delta_over_base: 4, agnosticism: 5, actionability: 4 },
          trim_candidates: ["## Example <b>"],
          notes: "note & such",
        })],
      },
    ],
    versions: { belt: "0.2.1" },
    now: new Date("2026-01-05T00:00:00.000Z"),
  });

  const html = renderDashboardHtml(model);
  assert.match(html, /<td>belt<\/td>/u);
  assert.match(html, /<td>0\.2\.1<\/td>/u);
  assert.match(html, /17\/20/u);
  assert.match(html, /class="mock-badge">mock<\/span>/u);
  assert.match(html, /tr class="mock"/u);
  assert.match(html, /## Example &lt;b&gt;/u, "trim candidates are HTML-escaped");
  assert.match(html, /note &amp; such/u);
  assert.match(html, /<svg /u);
  assert.doesNotMatch(html, /<script|https?:\/\//u, "self-contained: no scripts or external URLs");

  assert.equal(renderSparkline([]), "");
  assert.match(renderSparkline([10]), /<circle/u);
  assert.match(renderSparkline([10, 15, 20]), /<polyline/u);
});

test("main writes retro/eval-dashboard.html and prints a text summary", () => {
  const root = makeTempRoot();
  try {
    writeSkill(root, "belt", "0.2.1");
    writeFileSync(path.join(root, "retro", "judge-scorecard-1.json"), JSON.stringify(scorecard({
      generatedAt: "2026-01-01T00:00:00.000Z",
      skills: [skillEntry({ skill: "belt", scores: { conciseness: 3, delta_over_base: 3, agnosticism: 3, actionability: 3 } })],
    })));
    writeFileSync(path.join(root, "retro", "judge-scorecard-2.json"), JSON.stringify(scorecard({
      generatedAt: "2026-01-02T00:00:00.000Z",
      skills: [skillEntry({ skill: "belt", scores: { conciseness: 4, delta_over_base: 4, agnosticism: 5, actionability: 4 } })],
    })));

    const logs = [];
    const originalLog = console.log;
    console.log = (message) => logs.push(String(message));
    let result;
    try {
      result = main({ root });
    } finally {
      console.log = originalLog;
    }

    assert.ok(result);
    assert.equal(result.outPath, path.join(root, "retro", "eval-dashboard.html"));
    assert.ok(existsSync(result.outPath));
    assert.match(readFileSync(result.outPath, "utf8"), /Loom eval dashboard/u);

    const stdout = logs.join("\n");
    assert.match(stdout, /skill\s+version\s+latest total\s+delta/u);
    assert.match(stdout, /belt\s+0\.2\.1\s+17\/20 \(mock\)\s+▲ \+5/u);

    const summary = renderTextSummary(result.model);
    assert.match(summary, /belt/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
