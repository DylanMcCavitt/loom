import assert from "node:assert/strict";
import { test } from "node:test";
import workflowCockpit from "../omp/.omp/agent/extensions/workflow-cockpit.js";

const GO_PROMPT = "Proceed with the current plan. Do not ask unless blocked by missing external information. Preserve unrelated changes. Use subagents for parallelizable work. Verify before yielding.";
const SHIP_PROMPT = "Finish the active issue end-to-end. Check acceptance criteria, implement missing work, verify behavior, and prepare closeout evidence. Ask only if the active issue or target repository is unknown.";

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
        async setWidget(key, lines, options) {
          widgets.push({ key, lines, options });
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
  for (const command of ["ctx", "route", "new-thread", "spawn-recipe", "diff", "go", "ship"]) {
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
  assert.equal(state.widgets.at(-1).key, "workflow-cockpit");
  assert.deepEqual(state.widgets.at(-1).options, { placement: "belowEditor" });
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

test("/go displays the exact execute-plan prompt", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("go").handler("", state.ctx);
  assert.deepEqual(lines, [GO_PROMPT]);
  assert.equal(state.notifications.at(-1).message, "Go prompt shown");
});

test("/ship requires an active issue", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("ship").handler("", state.ctx);
  assert.deepEqual(lines, []);
  assert.equal(state.notifications.at(-1).message, "Active issue is unknown; set or provide one before /ship.");
});

test("/ship displays the exact issue-autopilot prompt with active issue", async () => {
  const { commands } = install();
  const state = context({ activeIssue: "#8" });
  const lines = await commands.get("ship").handler("", state.ctx);
  assert.deepEqual(lines, [SHIP_PROMPT]);
  assert.equal(state.notifications.at(-1).message, "Ship prompt shown");
});

test("/go and /ship do not call shell or GitHub APIs", async () => {
  const { commands } = install();
  let unsafeCalls = 0;
  const state = context({
    activeIssue: "#8",
    shell() {
      unsafeCalls += 1;
    },
    github() {
      unsafeCalls += 1;
    },
    gh() {
      unsafeCalls += 1;
    },
  });
  await commands.get("go").handler("", state.ctx);
  await commands.get("ship").handler("", state.ctx);
  assert.equal(unsafeCalls, 0);
});
