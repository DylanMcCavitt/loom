import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createWorld } from "./fixtures/mock-linear-github.mjs";

const skillsRoot = new URL("../skills/", import.meta.url);
const MVP = ["prospect", "blueprint", "roboports", "biters", "lab", "repair-pack", "rocket-launch", "belt", "assembler"];
const KIT = [...MVP, "space-age", "map-seed"];
const MOVED_OPERATOR_LOCAL = [
  "chrome-devtools", "chronicle", "computer-use", "debug-tools", "deliverable-report",
  "execute-plan", "find-skills", "grill-with-docs", "openai-docs", "repo-triage",
  "security-best-practices", "security-ownership-map", "security-threat-model",
  "skill-maintenance", "swiftui-pro", "tdd", "write-a-skill",
];
const OPERATOR_LOCAL_ENGINES = new Set(["tdd", "diagnose", "debug-tools"]);

function skillUrl(name, file) {
  return new URL(`${name}/${file}`, skillsRoot);
}

const manifest = readFileSync(new URL("../docs/skills/factorio-kit.md", import.meta.url), "utf8");
const assemblerSkill = readFileSync(new URL("../skills/assembler/SKILL.md", import.meta.url), "utf8");
const adr0003 = readFileSync(new URL("../docs/decisions/0003-factorio-workflow-kit.md", import.meta.url), "utf8");

test("golden path: dependency-ordered ghosts, branch carries id, merge closes via bridge", () => {
  const { api } = createWorld();
  const project = api.createProject("offline-mode");
  api.addDoc(project, "PRD: offline mode");

  api.createIssue({ key: "ABC-1", project, labels: ["afk"] });
  api.createIssue({ key: "ABC-2", project, blockedBy: ["ABC-1"], labels: ["afk"] });

  const pr1 = api.openPr("ABC-1", "feat/ABC-1-local-cache", "Closes ABC-1");
  assert.equal(api.issue("ABC-1").state, "in_review");

  assert.throws(
    () => api.merge(pr1, { tests: true, review: true, acceptance: true, ci: false, minimalDiff: true }),
    /red gate\(s\) ci/u,
  );
  assert.equal(api.issue("ABC-1").state, "in_review");

  api.merge(pr1, { tests: true, review: true, acceptance: true, ci: true, minimalDiff: true });
  assert.equal(api.issue("ABC-1").state, "done");
});

test("golden path: a blocked ghost cannot launch before its blocker is done", () => {
  const { api } = createWorld();
  const project = api.createProject("p");
  api.createIssue({ key: "ABC-1", project });
  api.createIssue({ key: "ABC-2", project, blockedBy: ["ABC-1"] });

  const pr2 = api.openPr("ABC-2", "feat/ABC-2-sync");
  assert.throws(
    () => api.merge(pr2, { tests: true, review: true, acceptance: true, ci: true, minimalDiff: true }),
    /open blockers ABC-1/u,
  );
});

test("bridge invariant: a branch that omits the issue id is rejected", () => {
  const { api } = createWorld();
  const project = api.createProject("p");
  api.createIssue({ key: "ABC-9", project });
  assert.throws(() => api.openPr("ABC-9", "feat/random-branch"), /must carry issue id/u);
});

test("bridge invariant: a merge without the PR closing keyword does not close the issue", () => {
  const { api } = createWorld();
  const project = api.createProject("p");
  api.createIssue({ key: "ABC-7", project });
  const pr = api.openPr("ABC-7", "feat/ABC-7-cache", "wip: cache layer");
  const merged = api.merge(pr, { tests: true, review: true, acceptance: true, ci: true, minimalDiff: true });
  assert.equal(merged.merged, true);
  assert.notEqual(api.issue("ABC-7").state, "done");
});

test("every kit skill ships a SKILL.md in a shipped root", () => {
  for (const name of KIT) {
    assert.ok(existsSync(skillUrl(name, "SKILL.md")), `${name}: missing SKILL.md`);
  }
});

test("every eval-bearing kit skill ships evals with positive + negative coverage", () => {
  for (const name of KIT) {
    const evalsPath = skillUrl(name, "evals/evals.json");
    assert.ok(existsSync(evalsPath), `${name}: missing evals/evals.json`);
    const data = JSON.parse(readFileSync(evalsPath, "utf8"));
    assert.equal(data.skill_name, name, `${name}: evals skill_name mismatch`);
    assert.ok(Array.isArray(data.evals) && data.evals.length >= 4, `${name}: need >=4 eval cases`);
    for (const c of data.evals) {
      assert.ok(typeof c.prompt === "string" && c.prompt.length > 0, `${name}: eval missing prompt`);
      assert.ok(
        typeof c.expected_output === "string" && c.expected_output.length > 0,
        `${name}: eval ${c.id} missing expected_output`,
      );
    }
    const hasNegative = data.evals.some((c) =>
      /\bnot\b|does not|NOT|route|->|instead/u.test(c.expected_output),
    );
    assert.ok(hasNegative, `${name}: no negative/routing eval case`);
  }
});

test("manifest maps absorbed skills to lenses instead of live contracts", () => {
  const historical = manifest.match(/## Historical: absorbed skills[\s\S]*?(?=\n## |\n*$)/u)?.[0] ?? "";
  assert.ok(historical, "missing Historical: absorbed skills section");
  assert.match(historical, /not live routing targets/u);
  for (const [retired, absorber] of [["radar", "biters"], ["proof-pass", "lab"], ["bus-first", "biters"], ["ghosts", "blueprint"]]) {
    const line = historical.split("\n").find((l) => l.includes(`\`${retired}\``));
    assert.ok(line, `${retired}: missing from historical mapping`);
    assert.ok(line.includes(`\`${absorber}\``) || historical.includes(`\`${absorber}\``), `${retired}: mapping does not name ${absorber}`);
  }
  for (const retired of ["radar", "proof-pass", "bus-first", "ghosts"]) {
    assert.equal(manifest.includes(`### \`${retired}\``), false, `${retired}: still has a live contract section`);
  }
});

test("envelope docs bind through repo-local Markdown with no runtime mirror", () => {
  assert.match(assemblerSkill, /single binding point/u);
  assert.match(assemblerSkill, /no runtime mirror or second source/u);
  assert.match(manifest, /\.agents\/envelope\/` Markdown/u);
  assert.equal(/~\/\.loom\/factory-nucleus/u.test(manifest), false, "manifest still cites the deleted factory-nucleus mirror");
  assert.match(adr0003, /\.agents\/envelope\/`/u);
  assert.match(adr0003, /not a\s+second binding point/u);
});

test("workflow docs use post-cutover content-envelope terminology", () => {
  const targetDocs = `${manifest}\n${assemblerSkill}\n${adr0003}`;
  assert.doesNotMatch(targetDocs, /content-contract/u);
  assert.match(targetDocs, /content-envelope/u);
});

test("renamed and absorbed skills have no duplicate canonical old paths", () => {
  for (const retired of ["dispatch", "robots", "inserter", "ghosts", "radar", "proof-pass", "bus-first", "main-bus", "science-pack", "research", "spitters", "spidertron", "recycler", "quality", "modules"]) {
    assert.equal(existsSync(new URL(`${retired}/SKILL.md`, skillsRoot)), false, `${retired} must not remain in skills/`);
    assert.equal(existsSync(new URL(`${retired}/SKILL.md`, skillsRoot)), false, `${retired} must not remain in the skills tree`);
  }
  assert.ok(existsSync(new URL("roboports/SKILL.md", skillsRoot)), "roboports skill missing");
});

test("operator-local utilities are not tracked under skills tree", () => {
  for (const name of MOVED_OPERATOR_LOCAL) {
    assert.equal(
      existsSync(new URL(`${name}/SKILL.md`, skillsRoot)),
      false,
      `${name} must not remain in skills tree after LOO-152`,
    );
  }
  for (const name of ["assembler", "prospect", "space-age", "map-seed"]) {
    assert.ok(existsSync(new URL(`${name}/SKILL.md`, skillsRoot)), `${name} kit utility missing`);
  }
});

test("kit handoff targets all exist as skills", () => {
  const edges = {
    prospect: ["blueprint", "roboports"],
    blueprint: ["map-seed", "prospect", "roboports"],
    roboports: ["lab", "rocket-launch", "tdd", "belt"],
    biters: ["repair-pack", "belt"],
    lab: ["belt"],
    "rocket-launch": ["roboports", "lab", "belt"],
    assembler: ["blueprint", "prospect"],
    "map-seed": ["blueprint"],
    "space-age": ["rocket-launch", "roboports"],
  };
  for (const [from, targets] of Object.entries(edges)) {
    const skill = readFileSync(skillUrl(from, "SKILL.md"), "utf8");
    for (const to of targets) {
      if (skill.includes(`\`${to}\``)) {
        if (OPERATOR_LOCAL_ENGINES.has(to)) continue;
        const present = existsSync(skillUrl(to, "SKILL.md"));
        assert.ok(present, `${from} routes to ${to} which must exist`);
      }
    }
  }
});
