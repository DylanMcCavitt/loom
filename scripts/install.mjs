#!/usr/bin/env node
// Installer for the Loom skill pack: links or copies skills/<name> into harness
// skill directories under a home root. Interactive checkbox TUI by default on a
// TTY; flag-driven otherwise. Only writes real HOME when the operator runs it —
// tests must pass --home pointed at a sandbox.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { skillsRoot } from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const repoSkillsDir = path.join(repoRoot, skillsRoot);

// Global target paths follow the vercel-labs/skills (skills.sh) supported-agents
// matrix. Everything defaults to symlink except cursor/factory (copy is safest
// where symlink support is undocumented) and omp (config snippet only).
export const HARNESSES = Object.freeze({
  claude: { label: "Claude Code", targetDir: ".claude/skills", mode: "symlink", note: "symlinks documented-supported" },
  codex: { label: "Codex CLI", targetDir: ".codex/skills", mode: "symlink", note: "symlinks documented-supported" },
  agents: { label: "Generic Agent Skills (Cline, Dexto, Kimi Code CLI, Warp, Zed)", targetDir: ".agents/skills", mode: "symlink", note: "shared Agent Skills convention directory" },
  cursor: { label: "Cursor", targetDir: ".cursor/skills", mode: "copy", note: "symlink support undocumented; copy is safest" },
  gemini: { label: "Gemini CLI", targetDir: ".gemini/skills", mode: "symlink", note: "skills.sh-supported global path" },
  copilot: { label: "GitHub Copilot", targetDir: ".copilot/skills", mode: "symlink", note: "skills.sh-supported global path" },
  opencode: { label: "OpenCode", targetDir: ".config/opencode/skills", mode: "symlink", note: "skills.sh-supported global path" },
  amp: { label: "Amp (also Replit / universal)", targetDir: ".config/agents/skills", mode: "symlink", note: "skills.sh-supported global path" },
  goose: { label: "Goose", targetDir: ".config/goose/skills", mode: "symlink", note: "skills.sh-supported global path" },
  windsurf: { label: "Windsurf", targetDir: ".codeium/windsurf/skills", mode: "symlink", note: "skills.sh-supported global path" },
  factory: { label: "Factory Droid", targetDir: ".factory/skills", mode: "copy", note: "symlink support undocumented; copy is safest" },
  roo: { label: "Roo Code", targetDir: ".roo/skills", mode: "symlink", note: "skills.sh-supported global path" },
  kilo: { label: "Kilo Code", targetDir: ".kilocode/skills", mode: "symlink", note: "skills.sh-supported global path" },
  crush: { label: "Charm Crush", targetDir: ".config/crush/skills", mode: "symlink", note: "skills.sh-supported global path" },
  continue: { label: "Continue", targetDir: ".continue/skills", mode: "symlink", note: "skills.sh-supported global path" },
  qwen: { label: "Qwen Code", targetDir: ".qwen/skills", mode: "symlink", note: "skills.sh-supported global path" },
  trae: { label: "Trae", targetDir: ".trae/skills", mode: "symlink", note: "skills.sh-supported global path" },
  openhands: { label: "OpenHands", targetDir: ".openhands/skills", mode: "symlink", note: "skills.sh-supported global path" },
  augment: { label: "Augment", targetDir: ".augment/skills", mode: "symlink", note: "skills.sh-supported global path" },
  omp: { label: "OMP", targetDir: null, mode: "config", note: "config-based; prints a skills.customDirectories snippet, writes nothing" },
});

export const HARNESS_ALIASES = Object.freeze({
  droid: "factory",
  "gemini-cli": "gemini",
  "claude-code": "claude",
  "github-copilot": "copilot",
  kilocode: "kilo",
  warp: "agents",
  zed: "agents",
  cline: "agents",
});

const HARNESS_NAMES = Object.freeze(Object.keys(HARNESSES));

const USAGE = `Usage: node scripts/install.mjs [options]

Interactive TUI when run on a TTY with no selection flags; otherwise flags drive it.

Options:
  --harness <name>   Target harness (repeatable or comma-separated): ${HARNESS_NAMES.join(", ")}
                     Aliases: ${Object.entries(HARNESS_ALIASES).map(([alias, canonical]) => `${alias}=${canonical}`).join(", ")}
  --all              Install every skill
  --skills <a,b,c>   Install only the named skills
  --home <dir>       Base dir standing in for HOME (default: os.homedir())
  --copy             Force copy mode for all harnesses
  --symlink          Force symlink mode for all harnesses
  --force            Overwrite existing targets that are not loom-owned
  --yes              Skip the confirmation prompt
  --dry-run          Print the plan and write nothing
  --list             List skills and the harness matrix, then exit
  --help             Show this help`;

export function listSkillNames(root = repoSkillsDir) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(root, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function parseArgs(argv) {
  const options = {
    harnesses: [],
    skills: [],
    all: false,
    home: null,
    modeOverride: null,
    force: false,
    yes: false,
    dryRun: false,
    list: false,
    help: false,
  };
  const takeValue = (argv2, index, name) => {
    const value = argv2[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, null];
    const value = () => {
      if (inline !== null) return inline;
      const v = takeValue(argv, index, flag);
      index += 1;
      return v;
    };
    if (flag === "--harness") options.harnesses.push(...value().split(",").map((s) => s.trim()).filter(Boolean));
    else if (flag === "--skills") options.skills.push(...value().split(",").map((s) => s.trim()).filter(Boolean));
    else if (flag === "--home") options.home = value();
    else if (flag === "--all") options.all = true;
    else if (flag === "--copy") options.modeOverride = "copy";
    else if (flag === "--symlink") options.modeOverride = "symlink";
    else if (flag === "--force") options.force = true;
    else if (flag === "--yes" || flag === "-y") options.yes = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--list") options.list = true;
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  options.harnesses = options.harnesses.map((name) => {
    const canonical = HARNESS_ALIASES[name] ?? name;
    if (!HARNESSES[canonical]) throw new Error(`Unknown harness: ${name} (expected one of ${HARNESS_NAMES.join(", ")})`);
    return canonical;
  });
  return options;
}

export function ompConfigSnippet(skillsDir = repoSkillsDir) {
  return [
    "omp: no files written. Add the pack to your OMP config instead:",
    `  skills: { customDirectories: ["${skillsDir}"] }`,
  ].join("\n");
}

function harnessMode(name, modeOverride) {
  const harness = HARNESSES[name];
  if (harness.mode === "config") return "config";
  return modeOverride ?? harness.mode;
}

export function buildPlan({ skills, harnesses, home, modeOverride = null }) {
  const homeRoot = path.resolve(home ?? homedir());
  return harnesses.map((name) => {
    const harness = HARNESSES[name];
    const mode = harnessMode(name, modeOverride);
    return {
      harness: name,
      label: harness.label,
      mode,
      targetDir: harness.targetDir ? path.join(homeRoot, harness.targetDir) : null,
      skills: mode === "config" ? [] : [...skills],
    };
  });
}

function safeRealTarget(linkPath) {
  try {
    const target = readlinkSync(linkPath);
    return path.resolve(path.dirname(linkPath), target);
  } catch {
    return null;
  }
}

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

// A destination is loom-owned when it is a symlink into this repo's skills/
// tree, or a directory whose SKILL.md frontmatter names the skill (i.e. what a
// prior loom install would have produced). Anything else is foreign and only
// replaced under --force.
export function classifyDestination(dest, skillName) {
  let stat;
  try {
    stat = lstatSync(dest);
  } catch {
    return "absent";
  }
  if (stat.isSymbolicLink()) {
    const target = safeRealTarget(dest);
    return target && isInsidePath(repoSkillsDir, target) ? "loom" : "foreign";
  }
  if (stat.isDirectory()) {
    const skillMd = path.join(dest, "SKILL.md");
    if (!existsSync(skillMd)) return "foreign";
    const parsed = parseFrontmatter(readFileSync(skillMd, "utf8"));
    return parsed?.values?.name === skillName ? "loom" : "foreign";
  }
  return "foreign";
}

function installOne({ targetDir, skillName, mode, force }) {
  const dest = path.join(targetDir, skillName);
  const source = path.join(repoSkillsDir, skillName);
  const existing = classifyDestination(dest, skillName);
  if (existing === "foreign" && !force) {
    return { skillName, status: "skipped", detail: `${dest} exists and is not loom-owned; use --force to overwrite` };
  }
  if (existing !== "absent") rmSync(dest, { recursive: true, force: true });
  if (mode === "symlink") symlinkSync(source, dest, "dir");
  else cpSync(source, dest, { recursive: true });
  if (existing === "loom") return { skillName, status: "updated" };
  if (existing === "foreign") return { skillName, status: "replaced" };
  return { skillName, status: "installed" };
}

export function executePlan(plan, { force = false, output = process.stdout } = {}) {
  let failures = 0;
  for (const entry of plan) {
    if (entry.mode === "config") {
      output.write(`${ompConfigSnippet()}\n`);
      continue;
    }
    mkdirSync(entry.targetDir, { recursive: true });
    const counts = { installed: 0, updated: 0, replaced: 0, skipped: 0 };
    for (const skillName of entry.skills) {
      const result = installOne({ targetDir: entry.targetDir, skillName, mode: entry.mode, force });
      counts[result.status] += 1;
      if (result.status === "skipped") {
        failures += 1;
        output.write(`warning: ${entry.harness}: ${result.detail}\n`);
      }
    }
    const summary = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${count} ${status}`)
      .join(", ");
    output.write(`${entry.harness}: ${summary || "nothing to do"} (${entry.mode}) -> ${entry.targetDir}\n`);
  }
  return failures;
}

const ANSI = Object.freeze({
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
  clearLine: "\u001b[2K",
  dim: (text) => `\u001b[2m${text}\u001b[22m`,
  up: (count) => `\u001b[${count}A`,
});

// skills.sh-style checkbox picker. Streams are injectable so tests can drive it
// with a PassThrough emitting keypress bytes; raw mode only engages on a TTY.
export function promptMultiSelect({
  title,
  hint = "up/down or j/k move · space toggle · a all · enter confirm · q quit",
  items,
  input = process.stdin,
  output = process.stdout,
}) {
  return new Promise((resolve) => {
    const state = items.map((item) => ({ ...item, selected: item.selected ?? true }));
    let cursor = 0;
    let renderedLines = 0;
    const rawCapable = input.isTTY && typeof input.setRawMode === "function";

    readline.emitKeypressEvents(input);
    if (rawCapable) input.setRawMode(true);
    input.resume?.();
    output.write(ANSI.hideCursor);

    const render = () => {
      if (renderedLines > 0) output.write(ANSI.up(renderedLines));
      const lines = [
        title,
        ANSI.dim(hint),
        ...state.map((item, index) => `${index === cursor ? "\u276f" : " "} ${item.selected ? "\u25c9" : "\u25ef"} ${item.label}`),
      ];
      output.write(`${lines.map((line) => `${ANSI.clearLine}${line}`).join("\n")}\n`);
      renderedLines = lines.length;
    };

    const finish = (result) => {
      input.removeListener("keypress", onKeypress);
      if (rawCapable) input.setRawMode(false);
      input.pause?.();
      output.write(ANSI.showCursor);
      resolve(result);
    };

    const onKeypress = (str, key = {}) => {
      const name = key.name ?? str;
      if ((key.ctrl && name === "c") || name === "q" || name === "escape") return finish(null);
      if (name === "return" || name === "enter") {
        return finish(state.filter((item) => item.selected).map((item) => item.value));
      }
      if (name === "up" || name === "k") cursor = (cursor + state.length - 1) % state.length;
      else if (name === "down" || name === "j") cursor = (cursor + 1) % state.length;
      else if (name === "space" || str === " ") state[cursor].selected = !state[cursor].selected;
      else if (name === "a") {
        const allSelected = state.every((item) => item.selected);
        for (const item of state) item.selected = !allSelected;
      }
      render();
      return undefined;
    };

    input.on("keypress", onKeypress);
    render();
  });
}

export function promptConfirm({ message, input = process.stdin, output = process.stdout }) {
  return new Promise((resolve) => {
    const rawCapable = input.isTTY && typeof input.setRawMode === "function";
    readline.emitKeypressEvents(input);
    if (rawCapable) input.setRawMode(true);
    input.resume?.();
    output.write(`${message} (y/N) `);
    const onKeypress = (str, key = {}) => {
      input.removeListener("keypress", onKeypress);
      if (rawCapable) input.setRawMode(false);
      input.pause?.();
      const yes = (key.name ?? str) === "y";
      output.write(`${yes ? "y" : "n"}\n`);
      resolve(yes);
    };
    input.on("keypress", onKeypress);
  });
}

function listOutput() {
  const lines = ["Skills:"];
  for (const name of listSkillNames()) lines.push(`  ${name}`);
  lines.push("", "Harnesses:");
  for (const [name, harness] of Object.entries(HARNESSES)) {
    const route = harness.targetDir ? `~/${harness.targetDir} (${harness.mode})` : "config snippet only";
    lines.push(`  ${name.padEnd(10)} ${harness.label} -> ${route}; ${harness.note}`);
  }
  return lines.join("\n");
}

function planSummary(plan, { dryRun }) {
  const lines = [dryRun ? "Plan (dry run — nothing will be written):" : "Plan:"];
  for (const entry of plan) {
    if (entry.mode === "config") {
      lines.push(`  ${entry.harness}: config snippet only, no files written`);
      continue;
    }
    lines.push(`  ${entry.harness}: ${entry.mode} ${entry.skills.length} skill(s) -> ${entry.targetDir}`);
    lines.push(`    ${entry.skills.join(", ")}`);
  }
  return lines.join("\n");
}

async function resolveSelections(options, { input, output, errorOutput, skillNames }) {
  const flagsGiven = options.harnesses.length > 0 || options.all || options.skills.length > 0;
  if (!flagsGiven && input.isTTY && output.isTTY) {
    const skills = await promptMultiSelect({
      title: "Select skills to install",
      items: skillNames.map((name) => ({ value: name, label: name, selected: true })),
      input,
      output,
    });
    if (!skills || skills.length === 0) {
      errorOutput.write("Aborted: no skills selected.\n");
      return null;
    }
    // Default no harnesses selected: spraying files across ~20 harness dirs by
    // default would be worse than making the user pick the ones they use.
    const harnesses = await promptMultiSelect({
      title: "Select target harnesses",
      items: Object.entries(HARNESSES).map(([name, harness]) => ({ value: name, label: `${name} — ${harness.label}`, selected: false })),
      input,
      output,
    });
    if (!harnesses || harnesses.length === 0) {
      errorOutput.write("Aborted: no harnesses selected.\n");
      return null;
    }
    return { skills, harnesses };
  }

  if (options.harnesses.length === 0) {
    errorOutput.write(`No harness selected. Pass --harness <${HARNESS_NAMES.join("|")}> (repeatable or comma-separated), or run interactively from a TTY.\n`);
    return null;
  }
  const skills = options.all ? [...skillNames] : options.skills;
  if (skills.length === 0) {
    errorOutput.write("No skills selected. Pass --all or --skills <a,b,c>, or run interactively from a TTY.\n");
    return null;
  }
  const unknown = skills.filter((name) => !skillNames.includes(name));
  if (unknown.length > 0) {
    errorOutput.write(`Unknown skill(s): ${unknown.join(", ")}. Run with --list to see available skills.\n`);
    return null;
  }
  return { skills, harnesses: [...new Set(options.harnesses)] };
}

export async function main(argv = process.argv.slice(2), { input = process.stdin, output = process.stdout, errorOutput = process.stderr } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    errorOutput.write(`${error.message}\n${USAGE}\n`);
    return 1;
  }
  if (options.help) {
    output.write(`${USAGE}\n`);
    return 0;
  }
  if (options.list) {
    output.write(`${listOutput()}\n`);
    return 0;
  }

  const skillNames = listSkillNames();
  const selections = await resolveSelections(options, { input, output, errorOutput, skillNames });
  if (!selections) return 1;

  const plan = buildPlan({
    skills: selections.skills,
    harnesses: selections.harnesses,
    home: options.home,
    modeOverride: options.modeOverride,
  });
  output.write(`${planSummary(plan, { dryRun: options.dryRun })}\n`);

  if (options.dryRun) {
    for (const entry of plan) {
      if (entry.mode === "config") output.write(`${ompConfigSnippet()}\n`);
    }
    output.write("Dry run complete — nothing written.\n");
    return 0;
  }

  const writesPlanned = plan.some((entry) => entry.mode !== "config");
  if (!options.yes && writesPlanned) {
    if (!input.isTTY) {
      errorOutput.write("Refusing to write without --yes when stdin is not a TTY.\n");
      return 1;
    }
    const confirmed = await promptConfirm({ message: "Proceed with install?", input, output });
    if (!confirmed) {
      errorOutput.write("Aborted.\n");
      return 1;
    }
  }

  const failures = executePlan(plan, { force: options.force, output });
  return failures > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}
