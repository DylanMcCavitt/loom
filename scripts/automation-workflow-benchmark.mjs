#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import workflowCockpit from "../omp/.omp/agent/extensions/workflow-cockpit.js";
import { routeIntent } from "../omp/.omp/agent/extensions/workflow-routing.js";
import { recipeCount } from "../omp/.omp/agent/extensions/workflow-recipes.js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const ROUTING_FIXTURES = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/automation-routing.json"), "utf8"));
const PROTECTED_EXISTING_SKILLS = new Set([
  "handoff",
  "diagnose",
  "tdd",
  "to-issues",
  "to-prd",
  "triage",
  "prototype",
  "workflow-kit",
  "computer-use",
  "chrome-devtools",
  "openai-docs",
]);

function installCockpit() {
  const commands = new Map();
  workflowCockpit({
    setLabel() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
  });
  return commands;
}

function parseSkillName(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/u);
  if (!match) return null;
  const name = match[1].split("\n").find((line) => line.startsWith("name:"));
  return name ? name.slice("name:".length).trim().replace(/^['"]|['"]$/gu, "") : null;
}

function localSkillNames() {
  const skillsDir = path.join(ROOT, ".agents/skills");
  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        return parseSkillName(readFileSync(skillPath, "utf8")) || entry.name;
      })
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function duplicateSkillOverlapCount() {
  const names = localSkillNames();
  const seen = new Set();
  let overlaps = 0;
  for (const name of names) {
    if (seen.has(name)) overlaps += 1;
    seen.add(name);
    if (PROTECTED_EXISTING_SKILLS.has(name)) overlaps += 1;
  }
  return overlaps;
}

function routeAccuracyScore() {
  let checks = 0;
  let passed = 0;
  for (const fixture of ROUTING_FIXTURES) {
    const routes = routeIntent(fixture.input).routes;
    for (const expected of fixture.expectedRoutes) {
      checks += 1;
      if (routes.includes(expected)) passed += 1;
    }
    for (const forbidden of fixture.forbiddenRoutes) {
      checks += 1;
      if (!routes.includes(forbidden)) passed += 1;
    }
  }
  return checks ? passed / checks : 0;
}

async function runCommand(command, args, ctxOverrides = {}) {
  const widgets = [];
  const notifications = [];
  const ctx = {
    cwd: ROOT,
    ui: {
      async setWidget(lines) {
        widgets.push(lines);
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
    ...ctxOverrides,
  };
  const lines = await command.handler(args, ctx);
  return { lines, widgets, notifications };
}

async function contextVisibilityScore(commands) {
  const labels = [
    "repo:",
    "active issue:",
    "branch:",
    "worktree:",
    "touched-file count:",
    "last verification:",
    "active agents:",
    "context-risk flags:",
  ];
  const { lines } = await runCommand(commands.get("ctx"), "", {});
  const joined = lines.join("\n");
  return labels.filter((label) => joined.includes(label)).length / labels.length;
}

async function newThreadReusesHandoffSkill(commands) {
  const { lines } = await runCommand(commands.get("new-thread"), "", { activeIssue: "#9" });
  const joined = lines.join("\n").toLowerCase();
  return joined.includes("existing handoff skill") && joined.includes("does not write handoffs") ? 1 : 0;
}

async function unsafeAutonomyViolations(commands) {
  let unsafeCalls = 0;
  const unsafe = () => {
    unsafeCalls += 1;
  };
  await runCommand(commands.get("go"), "", { shell: unsafe, gh: unsafe, github: unsafe });
  await runCommand(commands.get("ship"), "", { activeIssue: "#9", shell: unsafe, gh: unsafe, github: unsafe });
  const missingIssue = await runCommand(commands.get("ship"), "", { shell: unsafe, gh: unsafe, github: unsafe });
  const source = readFileSync(path.join(ROOT, "omp/.omp/agent/extensions/workflow-cockpit.js"), "utf8");
  const forbiddenSourceCalls = /\bBun\.spawn\b|\bspawnSync\b|\bexecFile\b|\bgh\b/u.test(source) ? 1 : 0;
  const missingIssueError = missingIssue.notifications.some((notification) => notification.level === "error") ? 0 : 1;
  return unsafeCalls + forbiddenSourceCalls + missingIssueError;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

async function main() {
  const commands = installCockpit();
  const automation_command_count = commands.size;
  const route_accuracy_score = routeAccuracyScore();
  const duplicate_skill_overlap_count = duplicateSkillOverlapCount();
  const context_visibility_score = await contextVisibilityScore(commands);
  const new_thread_reuses_handoff_skill = await newThreadReusesHandoffSkill(commands);
  const unsafe_autonomy_violations = await unsafeAutonomyViolations(commands);
  const spawn_recipe_count = recipeCount();
  const commands_to_start_issue = commands.has("ship") ? 1 : 0;
  const commands_to_safe_handoff = commands.has("new-thread") ? 1 : 0;

  const automation_workflow_friction = Math.round(
    automation_command_count
      + (1 - route_accuracy_score) * 100
      + duplicate_skill_overlap_count * 1000
      + (1 - context_visibility_score) * 100
      + (1 - new_thread_reuses_handoff_skill) * 1000
      + unsafe_autonomy_violations * 1000
      + Math.max(0, 5 - spawn_recipe_count) * 10
      + commands_to_start_issue
      + commands_to_safe_handoff,
  );

  const metrics = {
    automation_workflow_friction,
    automation_command_count,
    route_accuracy_score,
    duplicate_skill_overlap_count,
    context_visibility_score,
    new_thread_reuses_handoff_skill,
    unsafe_autonomy_violations,
    spawn_recipe_count,
    commands_to_start_issue,
    commands_to_safe_handoff,
  };

  for (const [name, value] of Object.entries(metrics)) {
    metrics[name] = finite(value);
  }

  const hardChecks = [
    ["duplicate_skill_overlap_count=0", metrics.duplicate_skill_overlap_count === 0],
    ["unsafe_autonomy_violations=0", metrics.unsafe_autonomy_violations === 0],
    ["new_thread_reuses_handoff_skill=1", metrics.new_thread_reuses_handoff_skill === 1],
  ];

  for (const [name, ok] of hardChecks) {
    console.log(`CHECK ${name} ${ok ? "ok" : "fail"}`);
  }
  for (const [name, value] of Object.entries(metrics)) {
    console.log(`METRIC ${name}=${value}`);
  }

  if (hardChecks.some(([, ok]) => !ok)) process.exit(1);
}

await main();
