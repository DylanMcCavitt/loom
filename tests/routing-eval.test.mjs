import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildRoutingPrompt,
  collectSkillDescriptions,
  computeRoutingScores,
  deriveExpectedSkill,
  formatRoutingSummary,
  loadRoutingCases,
  NONE_SKILL,
  parseRoutingResponse,
  renderRoutingScorecardMarkdown,
  runRoutingEval,
} from "../benchmarks/routing/route.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const benchScript = new URL("../scripts/bench.mjs", import.meta.url).pathname;

const offlineEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("LOOM_JUDGE_")),
  ),
  LOOM_JUDGE_BACKEND: "none",
};

const ROSTER = Object.freeze([
  "assembler",
  "belt",
  "biters",
  "blueprint",
  "lab",
  "map-seed",
  "prospect",
  "repair-pack",
  "roboports",
  "rocket-launch",
  "space-age",
]);

function makeTempDir(label) {
  const dir = path.join(
    tmpdir(),
    `loom-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkill(root, name, description) {
  const skillDir = path.join(root, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n"),
  );
}

function writeEvals(root, skill, evals) {
  const evalsDir = path.join(root, "skills", skill, "evals");
  mkdirSync(evalsDir, { recursive: true });
  writeFileSync(
    path.join(evalsDir, "evals.json"),
    `${JSON.stringify({ skill_name: skill, evals }, null, 2)}\n`,
  );
}

function makeRoutingFixture() {
  const root = makeTempDir("routing-fixture");
  writeSkill(root, "alpha", "Use when doing alpha work.");
  writeSkill(root, "beta", "Use when doing beta work.");
  writeEvals(root, "alpha", [
    {
      id: 1,
      prompt: "Please do the alpha thing.",
      expected_output: "Activates alpha and completes the alpha workflow.",
    },
    {
      id: 2,
      prompt: "Please do the beta thing instead.",
      expected_output: "Does NOT activate alpha; routes to beta for the beta workflow.",
    },
    {
      id: 3,
      prompt: "Explain photosynthesis.",
      expected_output: "Does NOT activate; this is a conceptual explanation request.",
    },
  ]);
  writeEvals(root, "beta", [
    {
      id: 1,
      prompt: "Run beta.",
      expected_output: "Activates beta for the beta workflow.",
    },
  ]);
  mkdirSync(path.join(root, "retro"), { recursive: true });
  return root;
}

test("collectSkillDescriptions reads name+description only from SKILL.md frontmatter", () => {
  const root = makeRoutingFixture();
  try {
    const descriptions = collectSkillDescriptions(root);
    assert.deepEqual(descriptions, [
      { name: "alpha", description: "Use when doing alpha work." },
      { name: "beta", description: "Use when doing beta work." },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectSkillDescriptions covers the shipped 11-skill roster", () => {
  const descriptions = collectSkillDescriptions(repoRoot);
  assert.equal(descriptions.length, 11);
  assert.deepEqual(descriptions.map((entry) => entry.name), [...ROSTER].sort((a, b) => a.localeCompare(b)));
  for (const entry of descriptions) {
    assert.ok(entry.description.length > 0, entry.name);
    assert.match(entry.description, /\bUse (?:when|for)\b/u, entry.name);
  }
});

test("deriveExpectedSkill handles activation, reroute, and none cases", () => {
  assert.equal(
    deriveExpectedSkill("Activates belt with the handoff lens.", "belt", ROSTER),
    "belt",
  );
  assert.equal(
    deriveExpectedSkill(
      "Does NOT activate belt; routes to blueprint for triage.",
      "belt",
      ROSTER,
    ),
    "blueprint",
  );
  assert.equal(
    deriveExpectedSkill(
      "Does NOT activate; this is a conceptual explanation request.",
      "biters",
      ROSTER,
    ),
    NONE_SKILL,
  );
  assert.equal(
    deriveExpectedSkill(
      "Does not build a prototype itself. Routes prototyping to the map-seed skill.",
      "blueprint",
      ROSTER,
    ),
    "map-seed",
  );
  assert.equal(
    deriveExpectedSkill(
      "Does NOT create issues under the default lens. Switches to blueprint's issue-decomposition lens.",
      "blueprint",
      ROSTER,
    ),
    "blueprint",
  );
  assert.equal(
    deriveExpectedSkill(
      "Despite the typos, activates repair-pack in repair mode.",
      "repair-pack",
      ROSTER,
    ),
    "repair-pack",
  );
});

test("deriveExpectedSkill matches live corpus non-self expectations", () => {
  const expected = {
    "assembler#4": "blueprint",
    "assembler#5": "blueprint",
    "belt#5": "blueprint",
    "belt#6": "rocket-launch",
    "biters#6": "none",
    "blueprint#5": "map-seed",
    "blueprint#6": "roboports",
    "lab#5": "biters",
    "lab#6": "roboports",
    "map-seed#4": "blueprint",
    "map-seed#5": "none",
    "prospect#4": "blueprint",
    "prospect#5": "blueprint",
    "repair-pack#4": "roboports",
    "repair-pack#5": "biters",
    "roboports#4": "blueprint",
    "roboports#5": "rocket-launch",
    "rocket-launch#4": "roboports",
    "space-age#4": "rocket-launch",
    "space-age#5": "roboports",
  };
  for (const skill of ROSTER) {
    for (const entry of loadRoutingCases(skill, repoRoot)) {
      const key = `${skill}#${entry.id}`;
      const derived = deriveExpectedSkill(entry.expected_output, skill, ROSTER);
      if (expected[key]) {
        assert.equal(derived, expected[key], key);
      } else {
        assert.equal(derived, skill, key);
      }
    }
  }
});

test("parseRoutingResponse accepts JSON, fenced JSON, and bare skill tokens", () => {
  assert.equal(parseRoutingResponse('{"skill":"belt"}', ROSTER), "belt");
  assert.equal(parseRoutingResponse('{"chosen":"none"}', ROSTER), "none");
  assert.equal(
    parseRoutingResponse("```json\n{\"skill\":\"roboports\"}\n```", ROSTER),
    "roboports",
  );
  assert.equal(parseRoutingResponse("repair-pack", ROSTER), "repair-pack");
  assert.throws(() => parseRoutingResponse('{"skill":"not-a-skill"}', ROSTER), /not in the roster/u);
  assert.throws(() => parseRoutingResponse("not json at all", ROSTER), /not valid skill JSON/u);
});

test("buildRoutingPrompt includes catalog, user prompt, and JSON instruction", () => {
  const prompt = buildRoutingPrompt({
    descriptions: [
      { name: "alpha", description: "Use when alpha." },
      { name: "beta", description: "Use when beta." },
    ],
    prompt: "Do the thing.",
    allowedSkills: ["alpha", "beta"],
  });
  assert.match(prompt, /skill catalog/u);
  assert.match(prompt, /- alpha: Use when alpha\./u);
  assert.match(prompt, /- beta: Use when beta\./u);
  assert.match(prompt, /Do the thing\./u);
  assert.match(prompt, /\{"skill":"<name>"\}/u);
  assert.match(prompt, /alpha, beta, none/u);
});

test("computeRoutingScores reports accuracy and confusion matrix", () => {
  const results = [
    { corpus_skill: "alpha", expected: "alpha", chosen: "alpha" },
    { corpus_skill: "alpha", expected: "beta", chosen: "alpha" },
    { corpus_skill: "alpha", expected: "none", chosen: "none" },
    { corpus_skill: "beta", expected: "beta", chosen: "beta" },
  ];
  const scores = computeRoutingScores(results, ["alpha", "beta"]);
  assert.equal(scores.total, 4);
  assert.equal(scores.correct, 3);
  assert.equal(scores.accuracy, 0.75);
  assert.deepEqual(scores.perSkill.alpha, { total: 3, correct: 2, accuracy: 2 / 3 });
  assert.deepEqual(scores.perSkill.beta, { total: 1, correct: 1, accuracy: 1 });
  assert.equal(scores.confusionMatrix.alpha.alpha, 1);
  assert.equal(scores.confusionMatrix.beta.alpha, 1);
  assert.equal(scores.confusionMatrix.none.none, 1);
  assert.equal(scores.confusionMatrix.beta.beta, 1);
  assert.ok(scores.labels.includes("none"));
});

test("runRoutingEval with injected router writes scorecards and summary", async () => {
  const root = makeRoutingFixture();
  try {
    const answers = new Map([
      ["alpha:1", "alpha"],
      ["alpha:2", "beta"],
      ["alpha:3", "none"],
    ]);
    const { scorecard, jsonPath, mdPath } = await runRoutingEval({
      repoRoot: root,
      skill: "alpha",
      env: { LOOM_JUDGE_MOCK: "1" },
      now: () => new Date("2026-07-09T12:00:00.000Z"),
      routeFn: async (context) => answers.get(`${context.corpusSkill}:${context.caseId}`),
    });

    assert.equal(scorecard.benchmark, "skill-routing");
    assert.equal(scorecard.scores.total, 3);
    assert.equal(scorecard.scores.correct, 3);
    assert.equal(scorecard.scores.accuracy, 1);
    assert.equal(scorecard.cases[1].expected, "beta");
    assert.equal(scorecard.cases[2].expected, "none");
    assert.ok(existsSync(jsonPath));
    assert.ok(existsSync(mdPath));
    assert.match(path.basename(jsonPath), /^routing-scorecard-.*\.json$/u);
    assert.match(path.basename(mdPath), /^routing-scorecard-.*\.md$/u);

    const written = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.deepEqual(written, scorecard);
    const markdown = readFileSync(mdPath, "utf8");
    assert.match(markdown, /# Loom routing eval scorecard/u);
    assert.match(markdown, /Confusion matrix/u);
    assert.match(formatRoutingSummary(scorecard), /routing: 3\/3 correct/u);
    assert.match(renderRoutingScorecardMarkdown(scorecard), /Per-skill activation accuracy/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runRoutingEval mock backend defaults to the corpus skill", async () => {
  const root = makeRoutingFixture();
  try {
    const { scorecard } = await runRoutingEval({
      repoRoot: root,
      skill: "alpha",
      env: { LOOM_JUDGE_MOCK: "1" },
      now: () => new Date("2026-07-09T12:01:00.000Z"),
    });
    // Mock always returns corpus skill: case 1 correct, 2+3 wrong.
    assert.equal(scorecard.scores.correct, 1);
    assert.equal(scorecard.cases[0].chosen, "alpha");
    assert.equal(scorecard.cases[1].chosen, "alpha");
    assert.equal(scorecard.cases[1].correct, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bench --route with no credentials prints a skip notice and exits 0", () => {
  const result = spawnSync(process.execPath, [benchScript, "--route"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bench --route: skipped — no judge backend configured/u);
  assert.doesNotMatch(result.stdout, /routing scorecard/u);
});

test("bench --route rejects malformed arguments", () => {
  const extra = spawnSync(process.execPath, [benchScript, "--route", "belt", "extra"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(extra.status, 1);
  assert.match(extra.stderr, /unknown argument/u);

  const flagSkill = spawnSync(process.execPath, [benchScript, "--route", "--force"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(flagSkill.status, 1);
  assert.match(flagSkill.stderr, /unknown argument/u);
});

test("bench --route CLI with LOOM_JUDGE_MOCK produces a routing scorecard pair", () => {
  const result = spawnSync(process.execPath, [benchScript, "--route", "belt"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...offlineEnv,
      LOOM_JUDGE_BACKEND: "",
      LOOM_JUDGE_MOCK: "1",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const jsonPath = result.stdout.match(/^routing scorecard \(json\): (.+)$/mu)?.[1];
  const mdPath = result.stdout.match(/^routing scorecard \(md\): (.+)$/mu)?.[1];
  try {
    assert.ok(jsonPath && mdPath, `expected scorecard paths in stdout, got: ${result.stdout}`);
    assert.match(result.stdout, /routing: \d+\/\d+ correct/u);
    const scorecard = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(scorecard.benchmark, "skill-routing");
    assert.equal(scorecard.judge.provider, "mock");
    assert.ok(scorecard.cases.every((entry) => entry.corpus_skill === "belt"));
    assert.ok(scorecard.scores.confusionMatrix);
  } finally {
    if (jsonPath) rmSync(jsonPath, { force: true });
    if (mdPath) rmSync(mdPath, { force: true });
  }
});
