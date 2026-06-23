import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createWorld } from "./fixtures/mock-linear-github.mjs";

const skillsRoot = new URL("../.agents/skills/", import.meta.url);
const MVP = ["prospect", "blueprint", "ghosts", "robots", "rocket-launch", "assembler", "bus-first"];
const KIT = [...MVP, "map-seed", "biters", "research", "main-bus", "dispatch", "modules", "quality", "space-age"];

// ---- Golden path: idea -> spec -> ghosts -> robots -> rocket-launch ----

test("golden path: dependency-ordered ghosts, branch carries id, merge closes via bridge", () => {
  const { api } = createWorld();
  const project = api.createProject("offline-mode");
  api.addDoc(project, "PRD: offline mode");

  // ghosts: blocker first so the blocked-by id resolves.
  api.createIssue({ key: "ABC-1", project, labels: ["afk"] });
  api.createIssue({ key: "ABC-2", project, blockedBy: ["ABC-1"], labels: ["afk"] });

  // robots: implement ABC-1 on a branch that carries the id.
  const pr1 = api.openPr("ABC-1", "feat/ABC-1-local-cache", "Closes ABC-1");
  assert.equal(api.issue("ABC-1").state, "in_review");

  // rocket-launch: a red gate refuses the merge; the issue stays open.
  assert.throws(
    () => api.merge(pr1, { tests: true, review: true, acceptance: true, ci: false, busFirst: true }),
    /red gate\(s\) ci/u,
  );
  assert.equal(api.issue("ABC-1").state, "in_review");

  // all gates green -> merge -> bridge closes ABC-1.
  api.merge(pr1, { tests: true, review: true, acceptance: true, ci: true, busFirst: true });
  assert.equal(api.issue("ABC-1").state, "done");
});

test("golden path: a blocked ghost cannot launch before its blocker is done", () => {
  const { api } = createWorld();
  const project = api.createProject("p");
  api.createIssue({ key: "ABC-1", project });
  api.createIssue({ key: "ABC-2", project, blockedBy: ["ABC-1"] });

  const pr2 = api.openPr("ABC-2", "feat/ABC-2-sync");
  assert.throws(
    () => api.merge(pr2, { tests: true, review: true, acceptance: true, ci: true, busFirst: true }),
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
  // Branch carries the id, but the PR body has NO closing keyword.
  const pr = api.openPr("ABC-7", "feat/ABC-7-cache", "wip: cache layer");
  const merged = api.merge(pr, { tests: true, review: true, acceptance: true, ci: true, busFirst: true });
  assert.equal(merged.merged, true); // the merge still lands the code
  assert.notEqual(api.issue("ABC-7").state, "done"); // but the bridge does not auto-close
});

// ---- Eval coverage gate: every kit skill ships runnable trigger evals ----

test("every kit skill ships evals with positive + negative coverage", () => {
  for (const name of KIT) {
    const evalsPath = new URL(`${name}/evals/evals.json`, skillsRoot);
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
    // At least one negative/routing case (must NOT activate or routes elsewhere).
    const hasNegative = data.evals.some((c) =>
      /\bnot\b|does not|NOT|route|->|instead/u.test(c.expected_output),
    );
    assert.ok(hasNegative, `${name}: no negative/routing eval case`);
  }
});

// ---- Handoff graph: every routed-to kit skill actually exists ----

test("kit handoff targets all exist as skills", () => {
  const edges = {
    prospect: ["research", "blueprint", "ghosts"],
    blueprint: ["ghosts", "map-seed", "prospect"],
    ghosts: ["robots", "dispatch"],
    robots: ["rocket-launch", "dispatch", "bus-first"],
    "rocket-launch": ["robots"],
    assembler: ["ghosts", "blueprint", "prospect"],
  };
  for (const [from, targets] of Object.entries(edges)) {
    const skill = readFileSync(new URL(`${from}/SKILL.md`, skillsRoot), "utf8");
    for (const to of targets) {
      // A routed-to target backticked in a SKILL.md MUST exist as a skill;
      // a dangling route fails here instead of being silently skipped.
      if (skill.includes(`\`${to}\``)) {
        const present = existsSync(new URL(`${to}/SKILL.md`, skillsRoot));
        assert.ok(present, `${from} routes to ${to} which must exist`);
      }
    }
  }
});
