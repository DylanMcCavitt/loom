import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  NO_ACTIVATION,
  buildRosterContext,
  buildTriggerMessages,
  expectedPolarity,
  extractExpectedLens,
  extractRouteTarget,
  gradeCase,
  listTriggerSkills,
  loadTriggerCorpus,
  mockTriggerPrediction,
  parseTriggerResponse,
  renderTriggerScorecardMarkdown,
  runTriggers,
} from "../benchmarks/judge/triggers.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const benchScript = new URL("../scripts/bench.mjs", import.meta.url).pathname;

// LOOM_JUDGE_BACKEND=none opts out of the committed default backend so
// offline tests stay hermetic.
const offlineEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("LOOM_JUDGE_")),
  ),
  LOOM_JUDGE_BACKEND: "none",
};

const EXPECTED_SECRET_SENTINEL = "EXPECTED-OUTPUT-SENTINEL-must-never-reach-the-model";

function makeTempDir(label) {
  const dir = path.join(
    tmpdir(),
    `loom-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkill(root, name, { description, evals }) {
  const skillDir = path.join(root, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  );
  if (evals) {
    mkdirSync(path.join(skillDir, "evals"), { recursive: true });
    writeFileSync(
      path.join(skillDir, "evals", "evals.json"),
      `${JSON.stringify({ skill_name: name, evals })}\n`,
    );
  }
}

// Two-skill fixture: alpha-skill carries the corpus under test, beta-skill
// exists so negative cases have a real route target in the roster.
function makeTriggerFixtureRoot() {
  const root = makeTempDir("trigger-fixture");
  writeSkill(root, "alpha-skill", {
    description: "Reviews changes adversarially. Use when reviewing a change.",
    evals: [
      {
        id: 1,
        prompt: "Review this PR before merge.",
        expected_output: `Activates alpha-skill with the correctness lens. ${EXPECTED_SECRET_SENTINEL}`,
        files: [],
      },
      {
        id: 2,
        prompt: "Do an adversarial pass on the change.",
        expected_output: `Activates alpha-skill and hunts regressions. ${EXPECTED_SECRET_SENTINEL}`,
        files: [],
      },
      {
        id: 3,
        prompt: "Write a handoff for the next agent.",
        expected_output: `Does NOT activate alpha-skill; routes to beta-skill for handoffs. ${EXPECTED_SECRET_SENTINEL}`,
        files: [],
      },
    ],
  });
  writeSkill(root, "beta-skill", {
    description: "Carries durable handoff context. Use when writing a handoff.",
    evals: null,
  });
  mkdirSync(path.join(root, "retro"), { recursive: true });
  return root;
}

test("bench --triggers with no credentials prints a skip notice and exits 0", () => {
  const result = spawnSync(process.execPath, [benchScript, "--triggers"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bench --triggers: skipped — no judge backend configured/u);
  assert.match(result.stdout, /Exiting 0/u);
  assert.doesNotMatch(result.stdout, /trigger scorecard/u);
});

test("bench --triggers rejects malformed arguments", () => {
  const extra = spawnSync(process.execPath, [benchScript, "--triggers", "belt", "extra"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(extra.status, 1);
  assert.match(extra.stderr, /unknown argument/u);

  const flagSkill = spawnSync(process.execPath, [benchScript, "--triggers", "--force"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(flagSkill.status, 1);
  assert.match(flagSkill.stderr, /unknown argument: --force/u);
});

test("trigger messages are blind: roster and prompt only, never expected_output", () => {
  const root = makeTriggerFixtureRoot();
  try {
    const roster = buildRosterContext(root);
    const corpus = loadTriggerCorpus("alpha-skill", root);
    for (const evalCase of corpus.evals) {
      const messages = buildTriggerMessages({ roster, prompt: evalCase.prompt });
      const flattened = messages.map((message) => message.content).join("\n");
      assert.ok(flattened.includes(evalCase.prompt), "prompt must be present");
      assert.ok(flattened.includes("alpha-skill:"), "roster must be present");
      assert.doesNotMatch(flattened, new RegExp(EXPECTED_SECRET_SENTINEL, "u"));
      assert.ok(!flattened.includes(evalCase.expected_output), "expected_output must never leak");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("listTriggerSkills only lists skills that ship an eval corpus", () => {
  const root = makeTriggerFixtureRoot();
  try {
    assert.deepEqual(listTriggerSkills(root), ["alpha-skill"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("polarity, lens, and route extraction read the corpus phrasing", () => {
  assert.equal(expectedPolarity("Activates belt with the handoff lens."), "positive");
  assert.equal(expectedPolarity("Does NOT activate belt; routes to blueprint."), "negative");
  assert.equal(expectedPolarity("Despite the typos, activates belt."), "positive");
  assert.equal(extractExpectedLens("Activates biters with the minimal-diff lens (lens-minimal-diff.md)."), "minimal-diff");
  assert.equal(extractExpectedLens("Activates roboports."), null);
  assert.equal(extractRouteTarget("Does NOT activate belt; routes to rocket-launch to run the gate."), "rocket-launch");
  assert.equal(extractRouteTarget("Does NOT activate biters; this is conceptual."), null);
});

test("gradeCase passes positives on a match and negatives on a non-match", () => {
  const positiveHit = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Activates alpha-skill with the correctness lens.",
    prediction: { skill: "alpha-skill", lens: "correctness" },
  });
  assert.equal(positiveHit.polarity, "positive");
  assert.equal(positiveHit.pass, true);
  assert.equal(positiveHit.lens_match, true);

  const positiveWrongLens = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Activates alpha-skill with the correctness lens.",
    prediction: { skill: "alpha-skill", lens: "security" },
  });
  assert.equal(positiveWrongLens.pass, true, "lens is a soft signal, not a gate");
  assert.equal(positiveWrongLens.lens_match, false);

  const positiveMiss = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Activates alpha-skill.",
    prediction: { skill: NO_ACTIVATION, lens: null },
  });
  assert.equal(positiveMiss.pass, false);
  assert.equal(positiveMiss.lens_match, null);

  const negativeHit = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Does NOT activate alpha-skill; routes to beta-skill.",
    prediction: { skill: "beta-skill", lens: null },
  });
  assert.equal(negativeHit.polarity, "negative");
  assert.equal(negativeHit.pass, true);
  assert.equal(negativeHit.route_target, "beta-skill");
  assert.equal(negativeHit.route_match, true);

  const negativeOffRoute = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Does NOT activate alpha-skill; routes to beta-skill.",
    prediction: { skill: NO_ACTIVATION, lens: null },
  });
  assert.equal(negativeOffRoute.pass, true, "route target is informational, not a gate");
  assert.equal(negativeOffRoute.route_match, false);

  const negativeMiss = gradeCase({
    corpusSkill: "alpha-skill",
    expectedOutput: "Does NOT activate alpha-skill.",
    prediction: { skill: "alpha-skill", lens: null },
  });
  assert.equal(negativeMiss.pass, false);
});

test("parseTriggerResponse accepts fenced JSON and rejects unknown skills", () => {
  const roster = ["alpha-skill", "beta-skill"];
  const fenced = ["```json", '{"skill": "alpha-skill", "lens": "correctness"}', "```"].join("\n");
  assert.deepEqual(parseTriggerResponse(fenced, roster), { skill: "alpha-skill", lens: "correctness" });
  assert.deepEqual(
    parseTriggerResponse(`{"skill": "${NO_ACTIVATION}", "lens": null}`, roster),
    { skill: NO_ACTIVATION, lens: null },
  );
  assert.throws(() => parseTriggerResponse('{"skill": "made-up"}', roster), /unknown skill: made-up/u);
  assert.throws(() => parseTriggerResponse('{"lens": "x"}', roster), /missing a skill string/u);
  assert.throws(() => parseTriggerResponse("not json", roster), /not valid JSON/u);
});

test("runTriggers with LOOM_JUDGE_MOCK writes a well-formed scorecard pair to retro/", async () => {
  const root = makeTriggerFixtureRoot();
  try {
    const { scorecard, jsonPath, mdPath } = await runTriggers({
      repoRoot: root,
      env: { LOOM_JUDGE_MOCK: "1" },
    });

    assert.match(path.basename(jsonPath), /^trigger-scorecard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/u);
    assert.match(path.basename(mdPath), /^trigger-scorecard-.*\.md$/u);
    assert.ok(jsonPath.startsWith(path.join(root, "retro")));

    const written = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.deepEqual(written, scorecard);
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.benchmark, "trigger-evals");
    assert.deepEqual(written.judge, { provider: "mock", model: "mock" });
    assert.equal(written.skills.length, 1);

    // Canned mock rule: even ids predict the corpus skill, odd ids none.
    // Case 1 (positive, odd) fails; case 2 (positive, even) passes;
    // case 3 (negative, odd) passes.
    const [entry] = written.skills;
    assert.equal(entry.skill, "alpha-skill");
    assert.deepEqual(
      entry.cases.map((c) => [c.id, c.polarity, c.pass]),
      [[1, "positive", false], [2, "positive", true], [3, "negative", true]],
    );
    assert.equal(entry.passed, 2);
    assert.equal(entry.errors, 0);
    assert.deepEqual(written.totals, { cases: 3, passed: 2, errors: 0, accuracy: 0.6667 });

    const markdown = readFileSync(mdPath, "utf8");
    assert.match(markdown, /# Loom trigger-eval scorecard/u);
    assert.match(markdown, /\| `alpha-skill` \| 2 \| 3 \| 0 \|/u);
    assert.match(markdown, /case 1 \[positive\] FAIL/u);
    assert.match(markdown, /case 3 \[negative\] pass/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a canned JSON mock overrides the deterministic prediction rule", async () => {
  const root = makeTriggerFixtureRoot();
  try {
    const { scorecard } = await runTriggers({
      repoRoot: root,
      env: { LOOM_JUDGE_MOCK: '{"skill": "alpha-skill", "lens": null}' },
    });
    const [entry] = scorecard.skills;
    assert.deepEqual(entry.cases.map((c) => c.pass), [true, true, false]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runTriggers command provider stays blind and pipes the roster prompt to the CLI", async () => {
  const root = makeTriggerFixtureRoot();
  // Stand-in for a subscription CLI: fails hard if the sentinel from
  // expected_output ever reaches stdin, otherwise predicts alpha-skill.
  const cmd = `${process.execPath} -e 'let p="";process.stdin.on("data",(c)=>{p+=c}).on("end",()=>{if(p.includes(${JSON.stringify(EXPECTED_SECRET_SENTINEL)}))process.exit(2);if(!p.includes("alpha-skill:")||!p.includes("--- system ---"))process.exit(3);console.log(JSON.stringify({skill:"alpha-skill",lens:null}))})'`;

  try {
    const { scorecard, jsonPath, mdPath } = await runTriggers({
      repoRoot: root,
      env: { LOOM_JUDGE_CMD: cmd, LOOM_JUDGE_MODEL: "cli-trigger-model" },
    });
    assert.deepEqual(scorecard.judge, { provider: "command", model: "cli-trigger-model" });
    assert.equal(scorecard.totals.errors, 0);
    assert.deepEqual(scorecard.skills[0].cases.map((c) => c.pass), [true, true, false]);
    for (const file of [jsonPath, mdPath]) {
      const contents = readFileSync(file, "utf8");
      assert.ok(!contents.includes(process.execPath), `${file} must not leak the command line`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed model responses surface as case-level errors, not crashes", async () => {
  const root = makeTriggerFixtureRoot();
  const cmd = `${process.execPath} -e 'console.log("routing vibes, no json")'`;

  try {
    const { scorecard } = await runTriggers({
      repoRoot: root,
      env: { LOOM_JUDGE_CMD: cmd },
    });
    const [entry] = scorecard.skills;
    assert.equal(entry.errors, 3);
    assert.equal(entry.passed, 0);
    for (const c of entry.cases) {
      assert.equal(c.pass, false);
      assert.match(c.error, /not valid JSON/u);
      assert.equal(c.predicted, null);
    }
    assert.equal(scorecard.totals.errors, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runTriggers rejects an unknown or eval-less skill argument", async () => {
  const root = makeTriggerFixtureRoot();
  try {
    await assert.rejects(
      runTriggers({ repoRoot: root, skill: "beta-skill", env: { LOOM_JUDGE_MOCK: "1" } }),
      /no skills\/beta-skill\/evals\/evals\.json/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mockTriggerPrediction is deterministic on case id parity", () => {
  assert.deepEqual(mockTriggerPrediction({ corpusSkill: "s", caseId: 2 }), { skill: "s", lens: null });
  assert.deepEqual(mockTriggerPrediction({ corpusSkill: "s", caseId: 3 }), { skill: NO_ACTIVATION, lens: null });
});

test("renderTriggerScorecardMarkdown includes totals, table, and per-case verdicts", () => {
  const markdown = renderTriggerScorecardMarkdown({
    generatedAt: "2026-07-09T00:00:00.000Z",
    judge: { provider: "mock", model: "mock" },
    totals: { cases: 2, passed: 1, errors: 1, accuracy: 0.5 },
    skills: [{
      skill: "alpha-skill",
      passed: 1,
      errors: 1,
      cases: [
        { id: 1, polarity: "positive", pass: true, predicted: { skill: "alpha-skill", lens: "x" }, error: null },
        { id: 2, polarity: "negative", pass: false, predicted: null, error: "boom" },
      ],
    }],
  });
  assert.match(markdown, /Cases: 1\/2 passed \(1 errored\)/u);
  assert.match(markdown, /case 1 \[positive\] pass — predicted alpha-skill \(x lens\)/u);
  assert.match(markdown, /case 2 \[negative\] ERROR — boom/u);
});
