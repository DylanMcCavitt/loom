import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ROBO_PORTS_SCENARIOS, materialize, scoreRun } from "../scripts/bench.mjs";
import {
  createJudgeProvider,
  parseJudgeResponse,
  resolveJudgeConfig,
  runJudge,
} from "../benchmarks/judge/judge.mjs";
import {
  applyTrimCandidates,
  buildSkillVariants,
  heuristicTrim,
  latestJudgeTrimCandidates,
  runAblation,
} from "../benchmarks/ablation/ablate.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const benchScript = new URL("../scripts/bench.mjs", import.meta.url).pathname;

const offlineEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("LOOM_JUDGE_")),
);

function makeTempRun() {
  return path.join(
    tmpdir(),
    `loom-bench-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    "run",
  );
}

function cleanupRun(runDir) {
  rmSync(path.dirname(runDir), { recursive: true, force: true });
}

function makeTempDir(label) {
  const dir = path.join(
    tmpdir(),
    `loom-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Minimal repo-root fixture so judge/ablation runs never write into the real repo.
function makeJudgeFixtureRoot({ withEvals = true } = {}) {
  const root = makeTempDir("judge-fixture");
  mkdirSync(path.join(root, "benchmarks", "judge"), { recursive: true });
  writeFileSync(
    path.join(root, "benchmarks", "judge", "RUBRIC.md"),
    readFileSync(path.join(repoRoot, "benchmarks", "judge", "RUBRIC.md"), "utf8"),
  );
  const skillDir = path.join(root, "skills", "sample-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: sample-skill",
      "---",
      "",
      "# Sample Skill",
      "",
      "Intro sentence.",
      "",
      "## Core Rules",
      "",
      "- Do the load-bearing thing.",
      "",
      "## Filler Section",
      "",
      "Generic advice that adds nothing.",
      "",
    ].join("\n"),
  );
  if (withEvals) {
    mkdirSync(path.join(skillDir, "evals"), { recursive: true });
    writeFileSync(
      path.join(skillDir, "evals", "evals.json"),
      `${JSON.stringify({ skill_name: "sample-skill", evals: [{ id: 1, prompt: "p", expected_output: "e" }] })}\n`,
    );
  }
  mkdirSync(path.join(root, "retro"), { recursive: true });
  return root;
}

test("bench --list enumerates the fixed roboports scenarios offline", () => {
  const result = spawnSync(process.execPath, [benchScript, "--list"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^roboports benchmark scenarios:/u);
  for (const scenario of ROBO_PORTS_SCENARIOS) {
    assert.match(result.stdout, new RegExp(`${scenario.id} ${scenario.name}`, "u"));
  }
  assert.equal(result.stdout.trim().split("\n").length, 1 + ROBO_PORTS_SCENARIOS.length);
});

test("bench materialize creates a throwaway repo with tasks, checks, and green anchors", () => {
  const runDir = makeTempRun();
  try {
    const result = spawnSync(process.execPath, [benchScript, "--materialize", runDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /materialized:/u);
    assert.match(result.stdout, /baseline commit: [0-9a-f]{40}/u);
    assert.ok(existsSync(path.join(runDir, ".git")));
    assert.ok(existsSync(path.join(runDir, "src", "inventory.js")));
    assert.ok(existsSync(path.join(runDir, ".bench", "baseline.txt")));
    assert.equal(readdirSync(path.join(runDir, ".bench", "tasks")).filter((file) => file.endsWith(".md")).length, 6);
    assert.equal(readdirSync(path.join(runDir, ".bench", "checks")).filter((file) => /^task-\d+\.mjs$/u.test(file)).length, 6);

    const baseline = readFileSync(path.join(runDir, ".bench", "baseline.txt"), "utf8").trim();
    const revParse = spawnSync("git", ["rev-parse", "HEAD"], { cwd: runDir, encoding: "utf8" });
    assert.equal(revParse.status, 0, revParse.stderr);
    assert.equal(revParse.stdout.trim(), baseline);
    const status = spawnSync("git", ["status", "--short"], { cwd: runDir, encoding: "utf8" });
    assert.equal(status.status, 0, status.stderr);
    assert.equal(status.stdout, "");

    const anchors = spawnSync("npm", ["test"], { cwd: runDir, encoding: "utf8" });
    assert.equal(anchors.status, 0, anchors.stderr);
  } finally {
    cleanupRun(runDir);
  }
});

test("bench scoring is deterministic for a materialized baseline run", () => {
  const runDir = makeTempRun();
  try {
    materialize(runDir);

    const first = scoreRun(runDir);
    const second = scoreRun(runDir);

    assert.deepEqual(second, first);
    assert.equal(first.benchmark, "roboports");
    assert.equal(first.anchors_passed, true);
    assert.equal(first.scenarios.length, 6);
    for (const scenario of first.scenarios) {
      assert.equal(scenario.correct, false, `${scenario.id} should be unfixed at baseline`);
      assert.equal(scenario.score.loc, 0);
      assert.equal(scenario.score.new_deps, 0);
      assert.equal(scenario.score.scope, 0);
      assert.deepEqual(scenario.score.files, []);
    }

    writeFileSync(path.join(runDir, "src", "inventory.js"), "\n// simulated task change\n", { flag: "a" });
    const add = spawnSync("git", ["add", "-A"], { cwd: runDir, encoding: "utf8" });
    assert.equal(add.status, 0, add.stderr);
    const commit = spawnSync(
      "git",
      [
        "-c",
        "user.name=bench",
        "-c",
        "user.email=bench@localhost",
        "commit",
        "--quiet",
        "--no-gpg-sign",
        "-m",
        "task: simulate add all",
      ],
      { cwd: runDir, encoding: "utf8" },
    );
    assert.equal(commit.status, 0, commit.stderr);

    const scored = spawnSync(
      process.execPath,
      [".bench/checks/score.mjs", "--task", "01", "--base", first.baseline],
      { cwd: runDir, encoding: "utf8" },
    );
    assert.equal(scored.status, 0, scored.stderr);
    const task01Score = JSON.parse(scored.stdout);
    assert.equal(task01Score.scope, 0);
    assert.deepEqual(task01Score.files, ["src/inventory.js"]);
  } finally {
    cleanupRun(runDir);
  }
});

test("bench --judge with no credentials prints a skip notice and exits 0", () => {
  const result = spawnSync(process.execPath, [benchScript, "--judge"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bench --judge: skipped — no judge backend configured/u);
  assert.match(result.stdout, /Exiting 0/u);
  assert.doesNotMatch(result.stdout, /judge scorecard/u);
});

test("bench --ablate with no credentials prints a skip notice and exits 0", () => {
  const result = spawnSync(process.execPath, [benchScript, "--ablate", "belt"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bench --ablate: skipped — no judge backend configured/u);
  assert.doesNotMatch(result.stdout, /ablation manifest/u);
});

test("bench --judge and --ablate reject malformed arguments", () => {
  const judgeExtra = spawnSync(process.execPath, [benchScript, "--judge", "belt", "extra"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(judgeExtra.status, 1);
  assert.match(judgeExtra.stderr, /unknown argument/u);

  const judgeFlagSkill = spawnSync(process.execPath, [benchScript, "--judge", "--force"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(judgeFlagSkill.status, 1);
  assert.match(judgeFlagSkill.stderr, /unknown argument/u);

  const ablateNoSkill = spawnSync(process.execPath, [benchScript, "--ablate"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(ablateNoSkill.status, 1);
  assert.match(ablateNoSkill.stderr, /--ablate requires <skill>/u);

  const ablateUnknown = spawnSync(process.execPath, [benchScript, "--ablate", "belt", "--bogus"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: offlineEnv,
  });
  assert.equal(ablateUnknown.status, 1);
  assert.match(ablateUnknown.stderr, /unknown argument: --bogus/u);
});

test("resolveJudgeConfig enables on api key, command, or mock, disables otherwise", () => {
  assert.equal(resolveJudgeConfig({}).enabled, false);
  assert.equal(resolveJudgeConfig({ LOOM_JUDGE_API_KEY: "k" }).enabled, true);
  assert.equal(resolveJudgeConfig({ LOOM_JUDGE_CMD: "judge-cli" }).enabled, true);
  assert.equal(resolveJudgeConfig({ LOOM_JUDGE_MOCK: "1" }).enabled, true);
  assert.equal(
    resolveJudgeConfig({ LOOM_JUDGE_BASE_URL: "https://example.test/v1/" }).baseUrl,
    "https://example.test/v1",
  );
});

test("resolveJudgeConfig maps LOOM_JUDGE_BACKEND to the matching CLI command", () => {
  const cursor = resolveJudgeConfig({ LOOM_JUDGE_BACKEND: "cursor" });
  assert.equal(cursor.enabled, true);
  assert.equal(cursor.cmd, 'agent -p --mode ask --model auto --output-format text "$(cat)"');
  assert.equal(cursor.model, "cursor-auto");

  const codex = resolveJudgeConfig({ LOOM_JUDGE_BACKEND: "codex" });
  assert.equal(codex.enabled, true);
  assert.equal(codex.cmd, "codex exec --ephemeral --sandbox read-only -m gpt-5.5 -c model_reasoning_effort=xhigh -");
  assert.equal(codex.model, "gpt-5.5-xhigh");

  // Case-insensitive (secrets UIs sometimes capitalize).
  const mixed = resolveJudgeConfig({ LOOM_JUDGE_BACKEND: "Codex" });
  assert.equal(mixed.cmd, codex.cmd);
  assert.equal(mixed.model, "gpt-5.5-xhigh");
});

test("explicit LOOM_JUDGE_CMD and LOOM_JUDGE_MODEL override the backend mapping", () => {
  const cmdOverride = resolveJudgeConfig({
    LOOM_JUDGE_BACKEND: "cursor",
    LOOM_JUDGE_CMD: "my-judge-cli",
  });
  assert.equal(cmdOverride.cmd, "my-judge-cli");

  const modelOverride = resolveJudgeConfig({
    LOOM_JUDGE_BACKEND: "cursor",
    LOOM_JUDGE_MODEL: "my-label",
  });
  assert.equal(modelOverride.cmd, 'agent -p --mode ask --model auto --output-format text "$(cat)"');
  assert.equal(modelOverride.model, "my-label");
});

test("unknown LOOM_JUDGE_BACKEND fails loudly in createJudgeProvider", () => {
  const config = resolveJudgeConfig({ LOOM_JUDGE_BACKEND: "bogus" });
  assert.equal(config.enabled, true);
  assert.throws(() => createJudgeProvider(config), /unknown LOOM_JUDGE_BACKEND: bogus \(expected cursor or codex\)/u);
});

test("backend-provided cmd yields a command provider without executing it", () => {
  const provider = createJudgeProvider(resolveJudgeConfig({ LOOM_JUDGE_BACKEND: "cursor" }));
  assert.equal(provider.kind, "command");
  assert.equal(provider.model, "cursor-auto");
});

test("runJudge command provider pipes the prompt to a CLI and parses its stdout", async () => {
  const fixtureRoot = makeJudgeFixtureRoot();
  const canned = JSON.stringify({
    scores: { conciseness: 4, delta_over_base: 5, agnosticism: 3, actionability: 4 },
    trim_candidates: [],
    notes: "cli judge",
  });
  // Stand-in for a subscription CLI (codex exec / cursor-agent -p): reads the
  // prompt on stdin, writes rubric JSON to stdout.
  const cmd = `${process.execPath} -e 'let p="";process.stdin.on("data",(c)=>{p+=c}).on("end",()=>{if(!p.includes("--- system ---")||!p.includes("sample-skill"))process.exit(2);console.log(${JSON.stringify(canned)})})'`;

  try {
    const { scorecard } = await runJudge({
      repoRoot: fixtureRoot,
      env: { LOOM_JUDGE_CMD: cmd, LOOM_JUDGE_MODEL: "cli-judge-model" },
    });
    assert.deepEqual(scorecard.judge, { provider: "command", model: "cli-judge-model" });
    assert.equal(scorecard.skills[0].total, 16);
    assert.equal(scorecard.skills[0].notes, "cli judge");
    assert.ok(!JSON.stringify(scorecard).includes(process.execPath), "scorecard must not leak the command line");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("command provider surfaces a failing CLI as an error", async () => {
  const provider = createJudgeProvider(resolveJudgeConfig({ LOOM_JUDGE_CMD: `${process.execPath} -e 'console.error("boom");process.exit(3)'` }));
  assert.equal(provider.kind, "command");
  assert.equal(provider.model, "command");
  await assert.rejects(
    provider.judge({ skill: "x", skillMd: "# x", evalsJson: null }, { rubric: "rubric" }),
    /judge command exited 3: boom/u,
  );
});

test("parseJudgeResponse accepts fenced JSON and rejects out-of-range scores", () => {
  const fenced = [
    "```json",
    JSON.stringify({
      scores: { conciseness: 5, delta_over_base: 4, agnosticism: 3, actionability: 2 },
      trim_candidates: ["## Filler Section"],
      notes: "ok",
    }),
    "```",
  ].join("\n");
  const parsed = parseJudgeResponse(fenced);
  assert.equal(parsed.scores.conciseness, 5);
  assert.deepEqual(parsed.trim_candidates, ["## Filler Section"]);

  assert.throws(
    () => parseJudgeResponse(JSON.stringify({
      scores: { conciseness: 6, delta_over_base: 0, agnosticism: 0, actionability: 0 },
    })),
    /must be an integer 0-5/u,
  );
  assert.throws(() => parseJudgeResponse("not json"), /not valid JSON/u);
});

test("runJudge with LOOM_JUDGE_MOCK writes a well-formed scorecard pair to retro/", async () => {
  const fixtureRoot = makeJudgeFixtureRoot();
  try {
    const { scorecard, jsonPath, mdPath } = await runJudge({
      repoRoot: fixtureRoot,
      env: { LOOM_JUDGE_MOCK: "1" },
    });

    assert.match(path.basename(jsonPath), /^judge-scorecard-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/u);
    assert.match(path.basename(mdPath), /^judge-scorecard-.*\.md$/u);
    assert.ok(jsonPath.startsWith(path.join(fixtureRoot, "retro")));

    const written = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.deepEqual(written, scorecard);
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.benchmark, "skill-judge");
    assert.equal(written.rubric, "benchmarks/judge/RUBRIC.md");
    assert.deepEqual(written.judge, { provider: "mock", model: "mock" });
    assert.equal(written.skills.length, 1);
    const entry = written.skills[0];
    assert.equal(entry.skill, "sample-skill");
    assert.equal(entry.evals_included, true);
    for (const dimension of ["conciseness", "delta_over_base", "agnosticism", "actionability"]) {
      assert.ok(Number.isInteger(entry.scores[dimension]), dimension);
    }
    assert.equal(
      entry.total,
      entry.scores.conciseness + entry.scores.delta_over_base + entry.scores.agnosticism + entry.scores.actionability,
    );
    assert.deepEqual(entry.trim_candidates, ["## Filler Section"]);

    const markdown = readFileSync(mdPath, "utf8");
    assert.match(markdown, /# Loom skill judge scorecard/u);
    assert.match(markdown, /\| `sample-skill` \|/u);
    assert.match(markdown, /## Filler Section/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("runJudge live provider calls an OpenAI-compatible endpoint via injected fetch and leaks no secrets", async () => {
  const fixtureRoot = makeJudgeFixtureRoot();
  const requests = [];
  const fetchStub = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              scores: { conciseness: 2, delta_over_base: 1, agnosticism: 5, actionability: 3 },
              trim_candidates: ["Generic advice that adds nothing."],
              notes: "stubbed live judgment",
            }),
          },
        }],
      }),
    };
  };

  try {
    const { scorecard, jsonPath, mdPath } = await runJudge({
      repoRoot: fixtureRoot,
      env: {
        LOOM_JUDGE_API_KEY: "test-secret-key",
        LOOM_JUDGE_MODEL: "judge-model-x",
        LOOM_JUDGE_BASE_URL: "https://judge.example.test/v1",
      },
      fetchImpl: fetchStub,
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://judge.example.test/v1/chat/completions");
    assert.equal(requests[0].options.headers.authorization, "Bearer test-secret-key");
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.model, "judge-model-x");
    assert.equal(body.messages[0].role, "system");
    assert.match(body.messages[0].content, /judge rubric/iu);
    assert.match(body.messages[1].content, /--- SKILL\.md ---/u);
    assert.match(body.messages[1].content, /routing intent/u);

    assert.deepEqual(scorecard.judge, { provider: "openai-compatible", model: "judge-model-x" });
    assert.equal(scorecard.skills[0].scores.agnosticism, 5);
    for (const file of [jsonPath, mdPath]) {
      const contents = readFileSync(file, "utf8");
      assert.doesNotMatch(contents, /test-secret-key/u, `${file} must not contain the API key`);
      assert.doesNotMatch(contents, /judge\.example\.test/u, `${file} must not contain the endpoint URL`);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("live provider requires LOOM_JUDGE_MODEL alongside the API key", () => {
  assert.throws(
    () => createJudgeProvider(resolveJudgeConfig({ LOOM_JUDGE_API_KEY: "k" })),
    /LOOM_JUDGE_MODEL is required/u,
  );
});

test("trim helpers remove judge candidates and fall back to the first-section heuristic", () => {
  const skillMd = [
    "---",
    "name: x",
    "---",
    "",
    "# X",
    "",
    "Keep this intro. Drop this exact sentence.",
    "",
    "## First",
    "",
    "Keep me.",
    "",
    "## Second",
    "",
    "Cut me.",
    "",
  ].join("\n");

  const applied = applyTrimCandidates(skillMd, ["## Second", "Drop this exact sentence."]);
  assert.doesNotMatch(applied.content, /## Second|Cut me|Drop this exact sentence/u);
  assert.match(applied.content, /## First\n\nKeep me\./u);
  assert.match(applied.content, /Keep this intro\./u);
  assert.deepEqual(applied.missed, []);

  const heuristic = heuristicTrim(skillMd);
  assert.match(heuristic, /## First/u);
  assert.doesNotMatch(heuristic, /## Second/u);

  const fromJudge = buildSkillVariants({
    skillMd,
    judgeTrim: { scorecard: "judge-scorecard-test.json", trimCandidates: ["## Second"] },
  });
  assert.match(fromJudge.trimSource, /judge scorecard/u);
  const fallback = buildSkillVariants({ skillMd, judgeTrim: null });
  assert.match(fallback.trimSource, /heuristic/u);
  assert.deepEqual(fallback.variants.map((variant) => variant.name), ["full", "absent", "trimmed"]);
  assert.equal(fallback.variants.find((variant) => variant.name === "absent").content, null);
});

test("runAblation materializes three variants and writes a comparison manifest", () => {
  const fixtureRoot = makeJudgeFixtureRoot();
  const dest = path.join(makeTempDir("ablation"), "out");
  writeFileSync(
    path.join(fixtureRoot, "retro", "judge-scorecard-2026-01-01T00-00-00-000Z.json"),
    `${JSON.stringify({
      skills: [{ skill: "sample-skill", trim_candidates: ["## Filler Section"] }],
    })}\n`,
  );

  const materializeCalls = [];
  const scoreCalls = [];
  const stubScore = {
    benchmark: "roboports",
    anchors_passed: true,
    scenarios: ROBO_PORTS_SCENARIOS.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      correct: false,
      score: { loc: 0, new_deps: 0, scope: 0, files: [] },
    })),
  };

  try {
    assert.deepEqual(
      latestJudgeTrimCandidates({ repoRoot: fixtureRoot, skill: "sample-skill" }),
      {
        scorecard: "judge-scorecard-2026-01-01T00-00-00-000Z.json",
        trimCandidates: ["## Filler Section"],
      },
    );

    const { manifest, manifestPath, destRoot } = runAblation({
      repoRoot: fixtureRoot,
      skill: "sample-skill",
      dest,
      materializeFn: (variantDest) => {
        materializeCalls.push(variantDest);
        mkdirSync(variantDest, { recursive: true });
        return { dest: variantDest, baseline: "a".repeat(40) };
      },
      scoreFn: (runDir) => {
        scoreCalls.push(runDir);
        return stubScore;
      },
    });

    assert.equal(materializeCalls.length, 3);
    assert.equal(scoreCalls.length, 3);
    assert.ok(existsSync(manifestPath));
    assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), manifest);
    assert.equal(manifest.benchmark, "roboports-ablation");
    assert.equal(manifest.skill, "sample-skill");
    assert.match(manifest.trim_source, /judge scorecard judge-scorecard-2026-01-01T00-00-00-000Z\.json/u);
    assert.deepEqual(manifest.variants.map((variant) => variant.variant), ["full", "absent", "trimmed"]);

    const full = manifest.variants[0];
    const absent = manifest.variants[1];
    const trimmed = manifest.variants[2];
    assert.ok(existsSync(full.skill_file));
    assert.equal(absent.skill_file, null);
    assert.equal(absent.skill_bytes, 0);
    assert.ok(trimmed.skill_bytes < full.skill_bytes);
    assert.doesNotMatch(readFileSync(trimmed.skill_file, "utf8"), /## Filler Section/u);
    assert.match(readFileSync(full.skill_file, "utf8"), /## Filler Section/u);
    for (const variant of manifest.variants) {
      assert.equal(variant.baseline_outcome.correct_count, 0);
      assert.equal(variant.baseline_outcome.scenarios.length, ROBO_PORTS_SCENARIOS.length);
    }
    assert.deepEqual(manifest.deltas_vs_full, [
      { variant: "absent", correct_count_delta: 0 },
      { variant: "trimmed", correct_count_delta: 0 },
    ]);
    assert.ok(manifest.how_to_run.some((line) => /npm run bench -- --score/u.test(line)));
    assert.equal(destRoot, path.resolve(dest));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(path.dirname(dest), { recursive: true, force: true });
  }
});

test("bench --judge CLI with LOOM_JUDGE_MOCK produces a scorecard pair under retro/", () => {
  const result = spawnSync(process.execPath, [benchScript, "--judge", "belt"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...offlineEnv, LOOM_JUDGE_MOCK: "1" },
  });

  const jsonPath = result.stdout.match(/^judge scorecard \(json\): (.+)$/mu)?.[1];
  const mdPath = result.stdout.match(/^judge scorecard \(md\): (.+)$/mu)?.[1];
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.ok(jsonPath && mdPath, `expected scorecard paths in stdout, got: ${result.stdout}`);
    assert.ok(path.resolve(jsonPath).startsWith(path.join(path.resolve(repoRoot), "retro")));
    const scorecard = JSON.parse(readFileSync(jsonPath, "utf8"));
    assert.equal(scorecard.skills.length, 1);
    assert.equal(scorecard.skills[0].skill, "belt");
    assert.equal(scorecard.judge.provider, "mock");
    assert.match(result.stdout, /belt: total \d+\/20/u);
  } finally {
    // Generated scorecards are gitignored and must never be committed; clean up.
    for (const file of [jsonPath, mdPath]) {
      if (file) rmSync(file, { force: true });
    }
  }
});
