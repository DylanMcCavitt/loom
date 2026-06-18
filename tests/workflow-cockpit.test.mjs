import assert from "node:assert/strict";
import { test } from "node:test";
import workflowCockpit from "../omp/.omp/agent/extensions/workflow-cockpit.js";

function install() {
  const commands = new Map();
  const labels = [];
  const pi = {
    setLabel(label) {
      labels.push(label);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
  };
  workflowCockpit(pi);
  return { commands, labels };
}

function context(overrides = {}) {
  const widgets = [];
  const notifications = [];
  return {
    ctx: {
      cwd: "/repo",
      ui: {
        async setWidget(lines, options) {
          widgets.push({ lines, options });
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
      ...overrides,
    },
    widgets,
    notifications,
  };
}

test("workflow cockpit registers visible commands", () => {
  const { commands, labels } = install();
  assert.deepEqual(labels, ["Workflow Cockpit"]);
  for (const command of ["ctx", "route", "new-thread", "spawn-recipe"]) {
    assert.ok(commands.has(command), `${command} command missing`);
  }
});

test("/ctx renders known and unknown context without throwing", async () => {
  const { commands } = install();
  const state = context({
    repo: { nameWithOwner: "DylanMcCavitt/oh-my-pi-config" },
    issue: { number: 7 },
    git: { branch: "issue-7-workflow-cockpit", touchedFiles: ["a", "b"] },
    contextRiskFlags: ["stale verification"],
  });
  const lines = await commands.get("ctx").handler("", state.ctx);
  assert.match(lines.join("\n"), /repo: DylanMcCavitt\/oh-my-pi-config/u);
  assert.match(lines.join("\n"), /active issue: 7/u);
  assert.match(lines.join("\n"), /touched-file count: 2/u);
  assert.match(lines.join("\n"), /last verification: unknown/u);
  assert.equal(state.notifications.at(-1).message, "Workflow context shown");
});

test("/route prefers existing specialized skills", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("route").handler("tests are failing, debug it", state.ctx);
  assert.match(lines.join("\n"), /Recommended: diagnose/u);
  assert.doesNotMatch(lines.join("\n"), /execute-plan/u);
});

test("/new-thread references handoff and does not write it", async () => {
  const { commands } = install();
  const state = context({ activeIssue: "#7" });
  const lines = await commands.get("new-thread").handler("", state.ctx);
  assert.match(lines.join("\n"), /Use the existing handoff skill/u);
  assert.match(lines.join("\n"), /does not write handoffs/u);
});

test("/spawn-recipe displays agent-recipes patterns", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("spawn-recipe").handler("review", state.ctx);
  assert.match(lines.join("\n"), /from agent-recipes patterns/u);
  assert.match(lines.join("\n"), /Role: Security and maintainability reviewer/u);
  assert.match(lines.join("\n"), /# Target/u);
  assert.match(lines.join("\n"), /# Change/u);
  assert.match(lines.join("\n"), /# Acceptance/u);
});

test("invalid command args produce visible errors without throwing", async () => {
  const { commands } = install();
  const routeState = context();
  const routeLines = await commands.get("route").handler("", routeState.ctx);
  assert.deepEqual(routeLines, []);
  assert.equal(routeState.notifications.at(-1).message, "Usage: /route <intent>");

  const recipeState = context();
  const recipeLines = await commands.get("spawn-recipe").handler("", recipeState.ctx);
  assert.deepEqual(recipeLines, []);
  assert.equal(recipeState.notifications.at(-1).message, "Usage: /spawn-recipe <intent>");
});

test("workflow cockpit does not register go or ship in this slice", () => {
  const { commands } = install();
  assert.equal(commands.has("go"), false);
  assert.equal(commands.has("ship"), false);
});
