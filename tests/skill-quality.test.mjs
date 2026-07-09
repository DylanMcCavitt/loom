import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BANNED_PHRASES,
  DEFAULT_ALLOWLIST_PATH,
  DEFAULT_TOKEN_BUDGETS_PATH,
  DESCRIPTION_BUDGET,
  WORD_BUDGET,
  buildAllowlist,
  collectSkillQualityViolations,
  compareAgainstAllowlist,
  evaluateSkillQuality,
} from "../scripts/validate-skill-quality.mjs";
import {
  TOKEN_BUDGET_SHRINK_REPORT_MIN,
  buildTokenBudgets,
  compareTokenBudgets,
  estimateSkillActivationTokens,
  estimateTokensFromChars,
  resolveDefaultLensRelPath,
} from "../scripts/lib/skill-token-budget.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function makeRoot() {
  const root = path.join(tmpdir(), `skill-quality-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(path.join(root, "skills"), { recursive: true });
  return root;
}

const COMPLIANT_EVALS = Object.freeze({
  evals: [
    { id: 1, prompt: "Run the gate.", expected_output: "Activates the skill and runs the gate.", files: [] },
    { id: 2, prompt: "Explain gates conceptually.", expected_output: "Does NOT activate; conceptual question.", files: [] },
  ],
});

function writeSkill(root, name, { body = "Short compliant body.", description = "Use when testing skill quality.", references = {}, evals = COMPLIANT_EVALS, evalsRaw } = {}) {
  const skillDir = path.join(root, "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
  for (const [relFile, content] of Object.entries(references)) {
    mkdirSync(path.join(skillDir, "references"), { recursive: true });
    writeFileSync(path.join(skillDir, "references", relFile), content);
  }
  if (evals !== null || evalsRaw !== undefined) {
    mkdirSync(path.join(skillDir, "evals"), { recursive: true });
    const payload = evalsRaw ?? JSON.stringify({ skill_name: name, ...evals }, null, 2);
    writeFileSync(path.join(skillDir, "evals", "evals.json"), payload);
  }
}

function violationsFor(root) {
  return collectSkillQualityViolations({ root }).violations;
}

test("compliant skill produces no violations and passes with an empty allowlist", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo");
    assert.deepEqual(violationsFor(root), []);
    assert.deepEqual(evaluateSkillQuality({ root, allowlist: { skills: {} } }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("word budget flags a SKILL.md body over the limit, excluding frontmatter", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: Array.from({ length: WORD_BUDGET + 1 }, (_, i) => `w${i}`).join(" ") });
    const violations = violationsFor(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, "word-budget");
    assert.equal(violations[0].count, WORD_BUDGET + 1);
    assert.match(violations[0].details[0], /body is 651 words; budget is 650/u);

    writeSkill(root, "demo", { body: Array.from({ length: WORD_BUDGET }, (_, i) => `w${i}`).join(" ") });
    assert.deepEqual(violationsFor(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("description budget flags a frontmatter description over the limit", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { description: `Use when testing. ${"x".repeat(DESCRIPTION_BUDGET)}` });
    const violations = violationsFor(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, "description-budget");
    assert.ok(violations[0].count > DESCRIPTION_BUDGET);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("banned filler phrases are flagged case-insensitively with file and line", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", {
      body: "First line.\nMake SURE to run the gate.",
      references: { "guide.md": "Intro.\n\nPlease Note the ratchet.\n" },
    });
    const violations = violationsFor(root).filter((violation) => violation.rule === "filler-phrase");
    assert.equal(violations.length, 3);
    const skillHit = violations.find((violation) => violation.key === "SKILL.md::make sure to");
    assert.ok(skillHit, JSON.stringify(violations));
    // body starts after 4 frontmatter lines plus a blank line; phrase is body line 2 = file line 7
    assert.match(skillHit.details[0], /^skills\/demo\/SKILL\.md:7: banned filler phrase "make sure to"$/u);
    const referenceHit = violations.find((violation) => violation.key === "references/guide.md::please note");
    assert.match(referenceHit.details[0], /^skills\/demo\/references\/guide\.md:3: /u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every banned phrase in the ban list is detected", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: BANNED_PHRASES.join("\n") });
    const keys = violationsFor(root).filter((violation) => violation.rule === "filler-phrase").map((violation) => violation.key);
    assert.deepEqual(keys.sort(), BANNED_PHRASES.map((phrase) => `SKILL.md::${phrase}`).sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("tracker coupling flags vendor words with word boundaries, case-sensitively", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", {
      body: "Track it in Linear and Linear only; linear algebra and Linearize stay fine.\nHost the PR on GitHub.",
      references: { "bridge.md": "The GitHub bridge closes the issue.\n" },
    });
    const violations = violationsFor(root).filter((violation) => violation.rule === "tracker-coupling");
    const byKey = Object.fromEntries(violations.map((violation) => [violation.key, violation.count]));
    assert.deepEqual(byKey, {
      "SKILL.md::Linear": 2,
      "SKILL.md::GitHub": 1,
      "references/bridge.md::GitHub": 1,
    });
    assert.match(violations[0].details[0], /vendor word "Linear"; use neutral vocabulary/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing evals.json is a violation", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { evals: null });
    const violations = violationsFor(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].rule, "missing-evals");
    assert.equal(violations[0].key, "evals/evals.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("eval schema flags bad JSON, name mismatch, ids, empty fields, and missing case polarity", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "bad-json", { evalsRaw: "{not json" });
    writeSkill(root, "wrong-name", { evalsRaw: JSON.stringify({ skill_name: "other", evals: COMPLIANT_EVALS.evals }) });
    writeSkill(root, "bad-entries", {
      evals: {
        evals: [
          { id: 1, prompt: "One.", expected_output: "Activates." },
          { id: 1, prompt: "", expected_output: "Activates again." },
          { id: "two", prompt: "Three.", expected_output: "" },
        ],
      },
    });
    writeSkill(root, "no-negative", { evals: { evals: [{ id: 1, prompt: "Go.", expected_output: "Activates." }] } });
    writeSkill(root, "no-positive", { evals: { evals: [{ id: 1, prompt: "Go.", expected_output: "does not activate here." }] } });

    const keysBySkill = {};
    for (const violation of violationsFor(root)) {
      (keysBySkill[violation.skill] ??= []).push(violation.key);
    }
    assert.deepEqual(keysBySkill["bad-json"], ["evals/evals.json::parse"]);
    assert.deepEqual(keysBySkill["wrong-name"], ["evals/evals.json::skill-name"]);
    assert.deepEqual(keysBySkill["bad-entries"].sort(), [
      "evals/evals.json::expected-output",
      "evals/evals.json::id",
      "evals/evals.json::negative-case",
      "evals/evals.json::prompt",
    ]);
    assert.deepEqual(keysBySkill["no-negative"], ["evals/evals.json::negative-case"]);
    assert.deepEqual(keysBySkill["no-positive"], ["evals/evals.json::positive-case"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allowlisted violations pass; unlisted violations fail with details", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: "Track it in Linear.", evals: null });
    const allowlist = {
      skills: {
        demo: {
          "tracker-coupling": { "SKILL.md::Linear": 1 },
          "missing-evals": { "evals/evals.json": 1 },
        },
      },
    };
    assert.deepEqual(evaluateSkillQuality({ root, allowlist }).failures, []);

    const partial = { skills: { demo: { "missing-evals": { "evals/evals.json": 1 } } } };
    const { failures } = evaluateSkillQuality({ root, allowlist: partial });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /tracker-coupling: skills\/demo\/SKILL\.md:6: vendor word "Linear"/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allowlist ratchet: growth fails, shrink demands a smaller allowlist, fixed entries go stale", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: "Linear and Linear again." });
    const grown = evaluateSkillQuality({ root, allowlist: { skills: { demo: { "tracker-coupling": { "SKILL.md::Linear": 1 } } } } });
    assert.equal(grown.failures.length, 2, grown.failures.join("\n"));
    assert.match(grown.failures[0], /grew to 2 \(allowlisted at 1\)/u);
    assert.match(grown.failures[1], /vendor word "Linear"/u);

    const shrunk = evaluateSkillQuality({ root, allowlist: { skills: { demo: { "tracker-coupling": { "SKILL.md::Linear": 3 } } } } });
    assert.deepEqual(shrunk.failures, [
      "stale allowlist entry: demo/tracker-coupling/SKILL.md::Linear shrank to 2 (allowlisted at 3); ratchet the allowlist down to 2",
    ]);

    writeSkill(root, "demo", { body: "Neutral tracker wording only." });
    const stale = evaluateSkillQuality({ root, allowlist: { skills: { demo: { "tracker-coupling": { "SKILL.md::Linear": 2 } } } } });
    assert.deepEqual(stale.failures, [
      "stale allowlist entry: demo/tracker-coupling/SKILL.md::Linear no longer fails; remove it from the allowlist",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("malformed allowlists are rejected", () => {
  const failures = compareAgainstAllowlist([], { skills: { demo: { "made-up-rule": { key: 1 }, "word-budget": { "SKILL.md": 0 } } } });
  assert.equal(failures.length, 2, failures.join("\n"));
  assert.match(failures[0], /unknown rule 'made-up-rule'/u);
  assert.match(failures[1], /count must be a positive integer/u);
});

test("buildAllowlist round-trips current violations into a passing allowlist", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: "Track in Linear.\nMake sure to push.", evals: null });
    const { violations } = collectSkillQualityViolations({ root });
    assert.ok(violations.length >= 3);
    assert.deepEqual(evaluateSkillQuality({ root, allowlist: buildAllowlist(violations) }).failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checked-in allowlist matches the shipped skills exactly", () => {
  const allowlist = JSON.parse(readFileSync(path.join(repoRoot, DEFAULT_ALLOWLIST_PATH), "utf8"));
  const { checked, failures } = evaluateSkillQuality({ root: repoRoot, allowlist });
  assert.equal(checked, 11);
  assert.deepEqual(failures, []);
});

test("estimateTokensFromChars uses ceil(chars/4)", () => {
  assert.equal(estimateTokensFromChars(0), 0);
  assert.equal(estimateTokensFromChars(1), 1);
  assert.equal(estimateTokensFromChars(4), 1);
  assert.equal(estimateTokensFromChars(5), 2);
  assert.equal(estimateTokensFromChars(100), 25);
});

test("activation estimate covers SKILL.md + default lens + rules.md only", () => {
  const root = makeRoot();
  try {
    const skillMd = "---\nname: demo\ndescription: Demo.\n---\n\nBody text here.\n";
    const lens = "# Default lens\n\nLens body.\n";
    const rules = "# Rules\n\nRule body.\n";
    const other = "# Other lens\n\nShould not count.\n";
    writeSkill(root, "demo", {
      body: "Body text here.",
      references: {
        "lens-handoff.md": lens,
        "lens-other.md": other,
        "rules.md": rules,
      },
    });
    // writeSkill overwrites SKILL.md; rewrite with AGENTS.md default lens prose.
    writeFileSync(
      path.join(root, "skills", "demo", "SKILL.md"),
      skillMd,
    );
    writeFileSync(
      path.join(root, "skills", "demo", "AGENTS.md"),
      "## Load order\n\n1. SKILL.md\n2. when the packet names no lens, load the default `references/lens-handoff.md`.\n3. `references/rules.md`\n",
    );

    const estimate = estimateSkillActivationTokens(path.join(root, "skills", "demo"), "demo");
    assert.equal(estimate.defaultLens, "references/lens-handoff.md");
    assert.deepEqual(estimate.files, ["SKILL.md", "references/lens-handoff.md", "references/rules.md"]);
    const expectedChars = skillMd.length + lens.length + rules.length;
    assert.equal(estimate.chars, expectedChars);
    assert.equal(estimate.tokens, Math.ceil(expectedChars / 4));
    assert.equal(resolveDefaultLensRelPath(path.join(root, "skills", "demo")), "references/lens-handoff.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skills without a default lens estimate SKILL.md (+ rules when present)", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "utility", { body: "Short utility body." });
    const estimate = estimateSkillActivationTokens(path.join(root, "skills", "utility"), "utility");
    assert.equal(estimate.defaultLens, null);
    assert.deepEqual(estimate.files, ["SKILL.md"]);
    assert.ok(estimate.tokens > 0);

    writeSkill(root, "with-rules", {
      body: "Short body.",
      references: { "rules.md": "# Rules\n\nAccepted.\n" },
    });
    const withRules = estimateSkillActivationTokens(path.join(root, "skills", "with-rules"), "with-rules");
    assert.deepEqual(withRules.files, ["SKILL.md", "references/rules.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("token budget exceed fails; meaningful shrink reports; update map rebuilds", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "demo", { body: "Short compliant body." });
    const estimate = estimateSkillActivationTokens(path.join(root, "skills", "demo"), "demo");
    const budgets = { demo: estimate.tokens };

    assert.deepEqual(compareTokenBudgets([estimate], budgets).failures, []);
    assert.deepEqual(compareTokenBudgets([estimate], budgets).notices, []);

    const over = compareTokenBudgets([estimate], { demo: estimate.tokens - 1 });
    assert.equal(over.failures.length, 1);
    assert.match(over.failures[0], /token-budget: demo activation estimate is \d+ tokens; budget is \d+/u);
    assert.match(over.failures[0], /consciously raise the budget/u);

    const underBudget = estimate.tokens + TOKEN_BUDGET_SHRINK_REPORT_MIN;
    const under = compareTokenBudgets([estimate], { demo: underBudget });
    assert.deepEqual(under.failures, []);
    assert.equal(under.notices.length, 1);
    assert.match(under.notices[0], /meaningfully under budget/u);

    const missing = compareTokenBudgets([estimate], {});
    assert.match(missing.failures[0], /has no recorded budget/u);

    const stale = compareTokenBudgets([estimate], { demo: estimate.tokens, gone: 10 });
    assert.match(stale.failures[0], /stale budget entry for removed skill 'gone'/u);

    assert.deepEqual(buildTokenBudgets([estimate]), { demo: estimate.tokens });

    const { failures } = evaluateSkillQuality({
      root,
      allowlist: { skills: {} },
      tokenBudgets: { demo: estimate.tokens - 1 },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /token-budget: demo /u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checked-in token budgets match shipped skill activation estimates", () => {
  const allowlist = JSON.parse(readFileSync(path.join(repoRoot, DEFAULT_ALLOWLIST_PATH), "utf8"));
  const tokenBudgets = JSON.parse(readFileSync(path.join(repoRoot, DEFAULT_TOKEN_BUDGETS_PATH), "utf8"));
  const { checked, failures, tokenNotices, tokenRows } = evaluateSkillQuality({
    root: repoRoot,
    allowlist,
    tokenBudgets,
  });
  assert.equal(checked, 11);
  assert.deepEqual(failures, []);
  assert.deepEqual(tokenNotices, []);
  assert.equal(tokenRows.length, 11);
  for (const row of tokenRows) {
    assert.equal(row.status, "ok");
    assert.equal(row.tokens, tokenBudgets[row.skill]);
  }
});

test("--update-budgets rewrites the token budget file to current estimates", () => {
  const root = makeRoot();
  const budgetsPath = path.join(root, "budgets.json");
  try {
    writeSkill(root, "demo", { body: "Short compliant body." });
    writeFileSync(path.join(root, "empty-allowlist.json"), `${JSON.stringify({ skills: {} }, null, 2)}\n`);
    writeFileSync(budgetsPath, `${JSON.stringify({ demo: 1 }, null, 2)}\n`);

    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "scripts/validate-skill-quality.mjs"),
        "--skills-dir",
        "skills",
        "--allowlist",
        "empty-allowlist.json",
        "--token-budgets",
        "budgets.json",
        "--update-budgets",
      ],
      { encoding: "utf8", cwd: root },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const updated = JSON.parse(readFileSync(budgetsPath, "utf8"));
    const estimate = estimateSkillActivationTokens(path.join(root, "skills", "demo"), "demo");
    assert.deepEqual(updated, { demo: estimate.tokens });
    assert.match(result.stdout, /Updated token budgets/u);
    assert.match(result.stdout, /Activation token estimates/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
