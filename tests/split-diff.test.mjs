import assert from "node:assert/strict";
import { test } from "node:test";
import workflowCockpit from "../omp/.omp/agent/extensions/workflow-cockpit.js";
import {
  SplitDiffOverlayComponent,
  buildDiffWidget,
  ghPrDiffArgs,
  gitDiffArgs,
  parseDiffArgs,
  parseUnifiedDiff,
  renderDiffCommand,
} from "../omp/.omp/agent/extensions/split-diff.js";

function install() {
  const commands = new Map();
  workflowCockpit({
    setLabel() {},
    registerCommand(name, command) {
      commands.set(name, command);
    },
  });
  return commands;
}

function context(overrides = {}) {
  const diffWidgets = [];
  const legacyWidgets = [];
  const customOverlays = [];
  const notifications = [];
  const theme = {
    fg(token, text) {
      return `<${token}>${text}</${token}>`;
    },
  };
  return {
    ctx: {
      cwd: "/repo",
      hasUI: true,
      ui: {
        custom(factory, options) {
          let resolvePromise;
          const promise = new Promise((resolve) => {
            resolvePromise = resolve;
          });
          const component = factory({}, theme, { matches: () => false }, (result) => {
            customOverlays.at(-1).result = result;
            resolvePromise(result);
          });
          customOverlays.push({ component, options, result: undefined });
          return promise;
        },
        async setDiffWidget(widget, options) {
          diffWidgets.push({ widget, options });
        },
        async setWidget(lines, options) {
          legacyWidgets.push({ lines, options });
        },
        notify(message, level) {
          notifications.push({ message, level });
        },
      },
      ...overrides,
    },
    customOverlays,
    diffWidgets,
    legacyWidgets,
    notifications,
  };
}

const MODIFIED_DIFF = `diff --git a/src/app.js b/src/app.js
index 1111111..2222222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,4 +1,5 @@
 const keep = true;
-const name = "old";
+const name = "new";
 unchanged();
-removeOnly();
+addOnly();
+after();
`;

const RENAMED_DIFF = `diff --git a/docs/old.txt b/docs/new.txt
similarity index 70%
rename from docs/old.txt
rename to docs/new.txt
--- a/docs/old.txt
+++ b/docs/new.txt
@@ -1 +1 @@
-old title
+new title
`;

const SECOND_HUNK_DIFF = `diff --git a/src/two.js b/src/two.js
index 1111111..2222222 100644
--- a/src/two.js
+++ b/src/two.js
@@ -1,2 +1,2 @@
 one();
-oldOne();
+newOne();
@@ -20,2 +20,2 @@ tail
 twenty();
-oldTwenty();
+newTwenty();
`;

test("parseUnifiedDiff builds split rows for additions, deletions, and modifications", () => {
  const files = parseUnifiedDiff(MODIFIED_DIFF);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/app.js");
  assert.equal(files[0].status, "modified");
  assert.equal(files[0].hunks.length, 1);

  const rows = files[0].hunks[0].rows;
  assert.deepEqual(rows.map((row) => row.type), ["context", "change", "context", "change", "add"]);
  assert.deepEqual(rows[1], {
    type: "change",
    oldLine: 2,
    newLine: 2,
    oldText: "const name = \"old\";",
    newText: "const name = \"new\";",
    oldStyle: "delete",
    newStyle: "add",
  });
  assert.equal(rows[4].newLine, 5);
  assert.equal(rows[4].newStyle, "add");
});

test("parseUnifiedDiff records renamed files", () => {
  const [file] = parseUnifiedDiff(RENAMED_DIFF);
  assert.equal(file.status, "renamed");
  assert.equal(file.oldPath, "docs/old.txt");
  assert.equal(file.path, "docs/new.txt");
  assert.equal(file.hunks[0].rows[0].type, "change");
});

test("buildDiffWidget represents empty diffs without fake text output", () => {
  const widget = buildDiffWidget({ kind: "range", label: "main..topic", range: "main..topic", file: "" }, "");
  assert.equal(widget.mode, "split");
  assert.equal(widget.readOnly, true);
  assert.equal(widget.scrollable, true);
  assert.deepEqual(widget.appearance, { deletion: "red", addition: "green" });
  assert.deepEqual(widget.state, { kind: "empty", message: "No changes" });
  assert.deepEqual(widget.files, []);
});

test("parseDiffArgs accepts local modes and file pathspecs only in one mode", () => {
  const request = parseDiffArgs("main..feature --file omp/.omp/agent/extensions/workflow-cockpit.js");
  assert.deepEqual(request, {
    kind: "range",
    label: "main..feature",
    range: "main..feature",
    file: "omp/.omp/agent/extensions/workflow-cockpit.js",
  });
  assert.deepEqual(gitDiffArgs(request), [
    "diff",
    "--no-ext-diff",
    "--no-color",
    "--find-renames",
    "--unified=3",
    "main..feature",
    "--",
    "omp/.omp/agent/extensions/workflow-cockpit.js",
  ]);
  assert.throws(() => parseDiffArgs("main feature"), /Usage/u);
  assert.throws(() => parseDiffArgs("main..feature --staged"), /Usage/u);
});

test("parseDiffArgs accepts explicit PR mode without local GitHub calls", () => {
  const request = parseDiffArgs("--pr 20 --file src/app.js");
  assert.deepEqual(request, { kind: "pr", label: "PR #20", pr: "20", file: "src/app.js" });
  assert.deepEqual(ghPrDiffArgs(request), ["pr", "diff", "20", "--patch", "--color=never"]);
  assert.throws(() => parseDiffArgs("--pr abc"), /numeric/u);
});

test("buildDiffWidget applies --file filtering before rendering the panel model", () => {
  const widget = buildDiffWidget({ kind: "pr", label: "PR #20", pr: "20", file: "docs/new.txt" }, `${MODIFIED_DIFF}${RENAMED_DIFF}`);
  assert.deepEqual(widget.files.map((file) => file.path), ["docs/new.txt"]);
  assert.deepEqual(widget.navigation.files.map((file) => file.path), ["docs/new.txt"]);
});

test("SplitDiffOverlayComponent renders split panes with styled deletion and addition cells", () => {
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, MODIFIED_DIFF);
  const component = new SplitDiffOverlayComponent(widget, { fg: (token, text) => `<${token}>${text}</${token}>` }, null, () => {});
  const lines = component.render(180);

  assert.ok(lines.some((line) => line.includes("OLD") && line.includes("NEW")));
  assert.ok(lines.some((line) => line.includes("src/app.js")));
  assert.ok(lines.some((line) => line.includes("<error>") && line.includes("const name = \"old\";")));
  assert.ok(lines.some((line) => line.includes("<success>") && line.includes("const name = \"new\";")));
  assert.ok(lines.at(-1).includes("[ ] file"));
  assert.ok(lines.at(-1).includes("{ } hunk"));
});

test("SplitDiffOverlayComponent keeps narrow renders inside the requested width", () => {
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, MODIFIED_DIFF);
  const component = new SplitDiffOverlayComponent(widget, null, null, () => {});
  const lines = component.render(24);

  assert.ok(lines.some((line) => line.includes("Widen terminal")));
  for (const line of lines) assert.ok(line.length <= 24, line);
});

test("SplitDiffOverlayComponent supports scrolling, file navigation, hunk navigation, and close keys", () => {
  const longContext = Array.from({ length: 22 }, (_value, index) => ` line${index + 1}();`).join("\n");
  const longTwoHunkDiff = `diff --git a/src/two.js b/src/two.js
index 1111111..2222222 100644
--- a/src/two.js
+++ b/src/two.js
@@ -1,22 +1,22 @@
${longContext}
@@ -40,2 +40,2 @@ tail
 forty();
-oldForty();
+newForty();
`;
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, `${MODIFIED_DIFF}${longTwoHunkDiff}`);
  let closed = "";
  const component = new SplitDiffOverlayComponent(widget, null, null, (result) => {
    closed = result;
  });

  component.handleInput("]");
  assert.equal(component.currentFile().path, "src/two.js");
  assert.equal(component.scroll, 0);
  component.handleInput("j");
  assert.equal(component.scroll, 1);
  component.handleInput("}");
  assert.ok(component.scroll > 1);
  component.handleInput("{");
  assert.equal(component.scroll, 0);
  component.handleInput("q");
  assert.equal(closed, "closed");
});

test("/diff registers and renders through ctx.ui.custom overlay", async () => {
  const commands = install();
  const state = context({
    async gitDiff(args) {
      assert.deepEqual(args, [
        "diff",
        "--no-ext-diff",
        "--no-color",
        "--find-renames",
        "--unified=3",
        "base..head",
        "--",
        "src/app.js",
      ]);
      return MODIFIED_DIFF;
    },
  });

  const widget = await commands.get("diff").handler("base..head --file src/app.js", state.ctx);
  assert.equal(widget.title, "Diff: base..head · src/app.js");
  assert.equal(widget.mode, "split");
  assert.equal(widget.files.length, 1);
  assert.equal(state.customOverlays.length, 1);
  assert.equal(state.customOverlays[0].options.overlay, true);
  assert.equal(state.diffWidgets.length, 0);
  assert.equal(state.legacyWidgets.length, 0);
  assert.equal(state.notifications.at(-1).message, "Showing split diff for 1 file");
});

test("/diff carries a scrollable multi-file model with file and hunk navigation", async () => {
  const commands = install();
  const state = context({
    async gitDiff() {
      return `${MODIFIED_DIFF}${RENAMED_DIFF}`;
    },
  });

  const widget = await commands.get("diff").handler("base..head", state.ctx);
  assert.equal(widget.scrollable, true);
  assert.deepEqual(widget.navigation.files.map((file) => file.path), ["src/app.js", "docs/new.txt"]);
  assert.equal(widget.navigation.hunks, true);
  assert.ok(widget.navigation.keys.some((key) => key.includes("hunk")));
});

test("/diff renders an explicit empty state for no changes", async () => {
  const commands = install();
  const state = context({
    async gitDiff() {
      return "";
    },
  });

  const widget = await commands.get("diff").handler("base..head", state.ctx);
  assert.deepEqual(widget.state, { kind: "empty", message: "No changes" });
  assert.equal(state.customOverlays[0].component.widget.files.length, 0);
  assert.equal(state.notifications.at(-1).message, "No changes");
});

test("/diff replaces stale diff overlays on repeated render and invalid input", async () => {
  const commands = install();
  const state = context({
    async gitDiff(args) {
      if (args.includes("missing..head")) throw new Error("fatal: bad revision 'missing..head'");
      return MODIFIED_DIFF;
    },
  });

  await commands.get("diff").handler("base..head", state.ctx);
  await commands.get("diff").handler("other..head", state.ctx);
  assert.equal(state.customOverlays[0].result, "replaced");

  const widget = await commands.get("diff").handler("missing..head", state.ctx);
  assert.equal(state.customOverlays[1].result, "replaced");
  assert.equal(widget.state.kind, "error");
  assert.match(widget.state.message, /bad revision/u);
  assert.equal(state.customOverlays.at(-1).component.widget.state.kind, "error");
  assert.equal(state.notifications.at(-1).level, "error");
});

test("/diff uses a safe non-TUI fallback instead of requiring setDiffWidget", async () => {
  const notifications = [];
  const legacyWidgets = [];
  const result = await renderDiffCommand("base..head", {
    cwd: "/repo",
    hasUI: false,
    gitDiff: async () => MODIFIED_DIFF,
    ui: {
      async setWidget(lines) {
        legacyWidgets.push(lines);
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });
  assert.equal(result.files.length, 1);
  assert.equal(legacyWidgets.length, 1);
  assert.match(legacyWidgets[0][1], /Open an interactive TUI/u);
  assert.equal(notifications.at(-1).level, "info");
});
