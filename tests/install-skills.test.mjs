import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { HARNESSES, listSkillNames, promptMultiSelect } from "../scripts/install.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const installScript = path.join(repoRoot, "scripts", "install.mjs");
const repoSkillsDir = realpathSync(path.join(repoRoot, "skills"));

const EXPECTED_SKILLS = [
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
];

function sandboxHome(label) {
  return mkdtempSync(path.join(os.tmpdir(), `loom-install-${label}-`));
}

// HOME is also pointed at the sandbox for defense in depth: even a bug that
// falls back to os.homedir() must never touch the operator's real HOME.
function runInstaller(args, home) {
  return spawnSync(process.execPath, [installScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

function assertOnlyHarnessDirs(home, expectedDirs) {
  const entries = readdirSync(home).sort((a, b) => a.localeCompare(b));
  assert.deepEqual(entries, [...expectedDirs].sort((a, b) => a.localeCompare(b)));
}

test("shipped skill roster matches expectations", () => {
  assert.deepEqual(listSkillNames(), EXPECTED_SKILLS);
});

test("--list names every skill and harness", () => {
  assert.equal(Object.keys(HARNESSES).length, 20);
  const home = sandboxHome("list");
  const result = runInstaller(["--list"], home);
  assert.equal(result.status, 0, result.stderr);
  for (const skill of EXPECTED_SKILLS) assert.match(result.stdout, new RegExp(`^  ${skill}$`, "mu"));
  for (const harness of Object.keys(HARNESSES)) assert.match(result.stdout, new RegExp(`^  ${harness}\\b`, "mu"));
  assertOnlyHarnessDirs(home, []);
});

test("non-interactive symlink install links every skill into codex target", () => {
  const home = sandboxHome("codex");
  const result = runInstaller(["--harness", "codex", "--all", "--home", home, "--yes"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex: 11 installed \(symlink\)/u);

  const target = path.join(home, ".codex", "skills");
  for (const skill of EXPECTED_SKILLS) {
    const dest = path.join(target, skill);
    assert.ok(lstatSync(dest).isSymbolicLink(), `${dest} must be a symlink`);
    assert.equal(realpathSync(dest), path.join(repoSkillsDir, skill));
    assert.match(readFileSync(path.join(dest, "SKILL.md"), "utf8"), /^---/u);
  }
  assertOnlyHarnessDirs(home, [".codex"]);
});

test("non-interactive copy install copies only the selected skills", () => {
  const home = sandboxHome("cursor");
  const result = runInstaller(["--harness", "cursor", "--skills", "belt,lab", "--home", home, "--yes"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cursor: 2 installed \(copy\)/u);

  const target = path.join(home, ".cursor", "skills");
  assert.deepEqual(readdirSync(target).sort(), ["belt", "lab"]);
  for (const skill of ["belt", "lab"]) {
    const dest = path.join(target, skill);
    assert.ok(!lstatSync(dest).isSymbolicLink(), `${dest} must be a real directory`);
    assert.ok(lstatSync(dest).isDirectory());
    assert.equal(
      readFileSync(path.join(dest, "SKILL.md"), "utf8"),
      readFileSync(path.join(repoSkillsDir, skill, "SKILL.md"), "utf8"),
    );
  }
  assertOnlyHarnessDirs(home, [".cursor"]);
});

test("re-running an install refreshes loom-owned targets and reports updated", () => {
  const home = sandboxHome("idempotent");
  const first = runInstaller(["--harness", "codex", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /codex: 1 installed/u);

  const second = runInstaller(["--harness", "codex", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /codex: 1 updated/u);

  const dest = path.join(home, ".codex", "skills", "belt");
  assert.ok(lstatSync(dest).isSymbolicLink());
  assert.equal(realpathSync(dest), path.join(repoSkillsDir, "belt"));

  const copyFirst = runInstaller(["--harness", "cursor", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(copyFirst.status, 0, copyFirst.stderr);
  const copySecond = runInstaller(["--harness", "cursor", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(copySecond.status, 0, copySecond.stderr);
  assert.match(copySecond.stdout, /cursor: 1 updated/u);
});

test("foreign destinations are skipped without --force and replaced with it", () => {
  const home = sandboxHome("foreign");
  const dest = path.join(home, ".cursor", "skills", "belt");
  mkdirSync(dest, { recursive: true });
  writeFileSync(path.join(dest, "notes.txt"), "not a loom skill\n");

  const skipped = runInstaller(["--harness", "cursor", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(skipped.status, 1);
  assert.match(skipped.stdout, /warning: cursor: .* not loom-owned; use --force/u);
  assert.equal(readFileSync(path.join(dest, "notes.txt"), "utf8"), "not a loom skill\n");

  const forced = runInstaller(["--harness", "cursor", "--skills", "belt", "--home", home, "--yes", "--force"], home);
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /cursor: 1 replaced/u);
  assert.ok(!existsSync(path.join(dest, "notes.txt")));
  assert.ok(existsSync(path.join(dest, "SKILL.md")));
});

test("--dry-run prints the plan and writes nothing", () => {
  const home = sandboxHome("dryrun");
  const result = runInstaller(["--harness", "claude,factory", "--all", "--home", home, "--dry-run"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry run — nothing will be written/u);
  assert.match(result.stdout, /claude: symlink 11 skill\(s\)/u);
  assert.match(result.stdout, /factory: copy 11 skill\(s\)/u);
  assertOnlyHarnessDirs(home, []);
});

test("omp prints the customDirectories snippet and writes nothing", () => {
  const home = sandboxHome("omp");
  const result = runInstaller(["--harness", "omp", "--all", "--home", home, "--yes"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skills: \{ customDirectories: \[/u);
  assert.ok(result.stdout.includes(repoSkillsDir));
  assertOnlyHarnessDirs(home, []);
});

test("harness aliases normalize to canonical targets", () => {
  const home = sandboxHome("alias");
  const result = runInstaller(["--harness", "droid", "--skills", "belt", "--home", home, "--yes"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /factory: 1 installed \(copy\)/u);
  const dest = path.join(home, ".factory", "skills", "belt");
  assert.ok(lstatSync(dest).isDirectory());
  assert.ok(!lstatSync(dest).isSymbolicLink());
  assertOnlyHarnessDirs(home, [".factory"]);
});

test("gemini harness symlinks into .gemini/skills", () => {
  const home = sandboxHome("gemini");
  const result = runInstaller(["--harness", "gemini", "--skills", "belt,lab", "--home", home, "--yes"], home);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /gemini: 2 installed \(symlink\)/u);
  for (const skill of ["belt", "lab"]) {
    const dest = path.join(home, ".gemini", "skills", skill);
    assert.ok(lstatSync(dest).isSymbolicLink());
    assert.equal(realpathSync(dest), path.join(repoSkillsDir, skill));
  }
  assertOnlyHarnessDirs(home, [".gemini"]);
});

test("unknown harness names error listing canonical keys", () => {
  const home = sandboxHome("badharness");
  const result = runInstaller(["--harness", "notreal", "--all", "--home", home, "--yes"], home);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown harness: notreal/u);
  assert.match(result.stderr, /claude, codex, agents/u);
  assertOnlyHarnessDirs(home, []);
});

test("mode overrides flip the per-harness default", () => {
  const home = sandboxHome("override");
  const copied = runInstaller(["--harness", "codex", "--skills", "belt", "--home", home, "--yes", "--copy"], home);
  assert.equal(copied.status, 0, copied.stderr);
  const dest = path.join(home, ".codex", "skills", "belt");
  assert.ok(!lstatSync(dest).isSymbolicLink());
  assert.ok(lstatSync(dest).isDirectory());
});

test("non-TTY run without selections fails and points at the flags", () => {
  const home = sandboxHome("noflags");
  const result = runInstaller([], home);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--harness/u);
  assertOnlyHarnessDirs(home, []);
});

test("non-TTY writes are refused without --yes", () => {
  const home = sandboxHome("noyes");
  const result = runInstaller(["--harness", "codex", "--all", "--home", home], home);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--yes/u);
  assertOnlyHarnessDirs(home, []);
});

test("interactive picker toggles, moves, and confirms via keypress stream", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  const picked = promptMultiSelect({
    title: "pick",
    items: [
      { value: "one", label: "one" },
      { value: "two", label: "two" },
      { value: "three", label: "three" },
    ],
    input,
    output,
  });
  input.write(" ");
  input.write("\u001b[B");
  input.write("\r");
  assert.deepEqual(await picked, ["two", "three"]);
});

test("harness-style picker starts empty and needs a toggle before enter selects anything", async () => {
  const items = () => [
    { value: "claude", label: "claude", selected: false },
    { value: "codex", label: "codex", selected: false },
  ];

  const emptyInput = new PassThrough();
  const emptyOutput = new PassThrough();
  emptyOutput.resume();
  const untouched = promptMultiSelect({ title: "harnesses", items: items(), input: emptyInput, output: emptyOutput });
  emptyInput.write("\r");
  assert.deepEqual(await untouched, []);

  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();
  const picked = promptMultiSelect({ title: "harnesses", items: items(), input, output });
  input.write("\u001b[B");
  input.write(" ");
  input.write("\r");
  assert.deepEqual(await picked, ["codex"]);
});

test("interactive picker aborts on q", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  const picked = promptMultiSelect({
    title: "pick",
    items: [{ value: "one", label: "one" }],
    input,
    output,
  });
  input.write("q");
  assert.equal(await picked, null);
});
