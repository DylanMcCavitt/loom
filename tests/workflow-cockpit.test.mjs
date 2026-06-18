import assert from "node:assert/strict";
import { test } from "node:test";
import workflowCockpit, { WorkflowCockpitPanel, cockpitOverlayOptions } from "../omp/.omp/agent/extensions/workflow-cockpit.js";

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
  const customCalls = [];
  const renderRequests = [];
  const theme = {
    fg(_token, text) {
      return text;
    },
  };
  const ui = {
    async setWidget(key, lines, options) {
      widgets.push({ key, lines, options });
    },
    notify(message, level) {
      notifications.push({ message, level });
    },
    custom(factory, options) {
      const tui = {
        requestRender() {
          renderRequests.push("render");
        },
      };
      const call = { options, component: undefined, result: undefined, handle: undefined };
      customCalls.push(call);
      const promise = new Promise((resolve) => {
        const done = (result) => {
          call.result = result;
          resolve(result);
        };
        call.component = factory(tui, theme, undefined, done);
        options?.onHandle?.({
          focus() {
            call.focused = true;
          },
          hide() {
            call.hidden = true;
          },
        });
      });
      return promise;
    },
  };

  return {
    ctx: {
      cwd: "/repo",
      ui,
      ...overrides,
    },
    widgets,
    notifications,
    customCalls,
    renderRequests,
  };
}

function panelSections(extraRows = []) {
  return [
    { title: "Repository", rows: ["repo: owner/repo", "branch: issue-22", "worktree: /repo"] },
    { title: "Issue state", rows: ["active issue: 22", "open issues: #22 Rebuild cockpit"] },
    { title: "Working context", rows: ["touched-file count: 2", "last verification: node --test", ...extraRows] },
  ];
}

function plainTheme() {
  return {
    fg(_token, text) {
      return text;
    },
  };
}

test("workflow cockpit registers visible commands", () => {
  const { commands, labels } = install();
  assert.deepEqual(labels, ["Workflow Cockpit"]);
  for (const command of ["ctx", "route", "new-thread", "spawn-recipe", "diff", "go", "ship"]) {
    assert.ok(commands.has(command), `${command} command missing`);
  }
});

test("/ctx renders fallback context without throwing outside TUI", async () => {
  const { commands } = install();
  const state = context({
    repo: { nameWithOwner: "DylanMcCavitt/oh-my-pi-config" },
    issue: { number: 7 },
    git: { branch: () => "not displayable", currentBranch: "issue-7-workflow-cockpit", touchedFiles: ["a", "b"] },
    contextRiskFlags: ["stale verification"],
    hasUI: false,
  });
  const lines = await commands.get("ctx").handler("", state.ctx);
  assert.equal(state.widgets.at(-1).key, "workflow-cockpit");
  assert.deepEqual(state.widgets.at(-1).options, { placement: "belowEditor" });
  assert.match(lines.join("\n"), /repo: DylanMcCavitt\/oh-my-pi-config/u);
  assert.match(lines.join("\n"), /active issue: 7/u);
  assert.match(lines.join("\n"), /branch: issue-7-workflow-cockpit/u);
  assert.doesNotMatch(lines.join("\n"), /branch: \(\) =>/u);
  assert.match(lines.join("\n"), /touched-file count: 2/u);
  assert.match(lines.join("\n"), /last verification: unknown/u);
  assert.equal(state.notifications.at(-1).message, "Workflow context shown");
});

test("/ctx opens a focused overlay when custom UI is available", async () => {
  const { commands } = install();
  const state = context({
    repo: { nameWithOwner: "DylanMcCavitt/oh-my-pi-config" },
    activeIssue: 22,
    git: { currentBranch: "issue-22-native-cockpit", worktree: "/repo", touchedFiles: ["a", "b", "c"] },
    openIssues: [{ number: 22, title: "Rebuild workflow cockpit", state: "open" }],
  });

  const pending = commands.get("ctx").handler("", state.ctx);
  await Promise.resolve();
  assert.equal(state.widgets[0].key, "workflow-cockpit");
  assert.equal(state.widgets[0].lines, undefined);
  assert.equal(state.customCalls.length, 1);
  assert.equal(state.customCalls[0].options.overlay, true);
  assert.equal(typeof state.customCalls[0].options.overlayOptions, "function");
  assert.equal(state.customCalls[0].focused, true);

  const rendered = state.customCalls[0].component.render(52).join("\n");
  assert.match(rendered, /Workflow Cockpit/u);
  assert.match(rendered, /repo: DylanMcCavitt\/oh-my-pi-config/u);
  assert.match(rendered, /active issue: 22/u);
  assert.match(rendered, /#22 Rebuild workflow cockpit · open/u);
  assert.match(rendered, /Esc close/u);

  state.customCalls[0].component.handleInput("\u001b");
  const lines = await pending;
  assert.match(lines.join("\n"), /branch: issue-22-native-cockpit/u);
  assert.equal(state.notifications.at(-1).message, "Workflow cockpit closed");
});

test("/ctx command returns immediately after opening overlay", async () => {
  const { commands } = install();
  const state = context({ repo: "owner/repo" });

  const lines = await commands.get("ctx").handler("", state.ctx);
  assert.equal(state.customCalls.length, 1);
  assert.match(lines.join("\n"), /repo: owner\/repo/u);
  assert.equal(state.customCalls[0].result, undefined);

  state.customCalls[0].component.handleInput("\u001b[27u");
  await Promise.resolve();
  assert.equal(state.customCalls[0].result, "closed");
});

test("workflow cockpit panel renders narrow terminal fallback", () => {
  const panel = new WorkflowCockpitPanel(panelSections(), plainTheme(), () => {});
  const lines = panel.render(24);
  assert.match(lines.join("\n"), /Terminal too narrow/u);
  assert.match(lines.join("\n"), /Esc close/u);
  for (const line of lines) assert.ok(line.length <= 24, line);
});

test("workflow cockpit panel scrolls and closes from keyboard input", () => {
  const extraRows = Array.from({ length: 20 }, (_value, index) => `extra row ${index}`);
  let closedWith;
  let renders = 0;
  const panel = new WorkflowCockpitPanel(panelSections(extraRows), plainTheme(), (result) => {
    closedWith = result;
  }, () => {
    renders += 1;
  });

  assert.doesNotMatch(panel.render(60).join("\n"), /extra row 19/u);
  panel.handleInput("end");
  assert.equal(renders, 1);
  assert.match(panel.render(60).join("\n"), /extra row 19/u);
  panel.handleInput("up");
  assert.equal(renders, 2);
  panel.handleInput("\u001b");
  assert.equal(closedWith, "closed");
});

test("/ctx replaces an active cockpit instead of stacking overlays", async () => {
  const { commands } = install();
  const state = context({ mode: "tui" });
  const first = commands.get("ctx").handler("", state.ctx);
  await Promise.resolve();
  assert.equal(state.customCalls.length, 1);
  const firstCall = state.customCalls[0];

  const second = commands.get("ctx").handler("", state.ctx);
  await Promise.resolve();
  assert.equal(firstCall.result, "replaced");
  assert.equal(firstCall.hidden, true);
  assert.equal(state.customCalls.length, 2);

  state.customCalls[1].component.handleInput("escape");
  await Promise.all([first, second]);
});

test("cockpit overlay options use a responsive native overlay surface", () => {
  const options = cockpitOverlayOptions();
  assert.match(["center", "right-center"].join(" "), new RegExp(options.anchor, "u"));
  assert.ok(options.width);
  assert.ok(options.maxHeight);
});

test("/route prefers existing specialized skills", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("route").handler("debug this failing test", state.ctx);
  assert.match(lines.join("\n"), /Recommended: diagnose/u);
  assert.match(lines.join("\n"), /diagnose/u);
  assert.equal(state.widgets.at(-1).key, "workflow-cockpit");
  assert.equal(state.notifications.at(-1).message, "Route: diagnose");
});

test("/new-thread references handoff and does not write it", async () => {
  const { commands } = install();
  const state = context({ activeIssue: "#7" });
  const lines = await commands.get("new-thread").handler("", state.ctx);
  assert.match(lines.join("\n"), /handoff skill/u);
  assert.match(lines.join("\n"), /resume #7/u);
  assert.equal(state.widgets.length, 1);
});

test("/spawn-recipe displays agent-recipes patterns", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("spawn-recipe").handler("parallel implementation", state.ctx);
  assert.match(lines.join("\n"), /Parallel implementation recipe/u);
  assert.match(lines.join("\n"), /Role: Scoped implementation specialist/u);
  assert.equal(state.notifications.at(-1).message, "Spawn recipe shown");
});

test("invalid command args produce visible errors without throwing", async () => {
  const { commands } = install();
  const state = context();
  const route = await commands.get("route").handler("", state.ctx);
  const recipe = await commands.get("spawn-recipe").handler("unknown niche", state.ctx);
  assert.deepEqual(route, []);
  assert.deepEqual(recipe, []);
  assert.deepEqual(state.notifications.map((entry) => entry.level), ["error", "error"]);
});

test("/go displays the exact execute-plan prompt", async () => {
  const { commands } = install();
  const state = context();
  const lines = await commands.get("go").handler("", state.ctx);
  assert.deepEqual(lines, [GO_PROMPT]);
  assert.equal(state.widgets.at(-1).lines[0], GO_PROMPT);
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
  assert.equal(state.widgets.at(-1).lines[0], SHIP_PROMPT);
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
