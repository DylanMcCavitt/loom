import assert from "node:assert/strict";
import { test } from "node:test";
import workflowCockpit from "../omp/.omp/agent/extensions/workflow-cockpit.js";
import {
  buildDiffWidget,
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
  const notifications = [];
  return {
    ctx: {
      cwd: "/repo",
      ui: {
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

test("parseDiffArgs accepts ranges and file pathspecs only in one mode", () => {
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
  assert.throws(() => parseDiffArgs("--pr 12"), /not implemented/u);
});

test("/diff registers and renders through ctx.ui.setDiffWidget", async () => {
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
  assert.equal(state.diffWidgets.length, 1);
  assert.equal(state.diffWidgets[0].options.placement, "belowEditor");
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
  assert.deepEqual(state.diffWidgets[0].widget.files, []);
  assert.equal(state.notifications.at(-1).message, "No changes");
});

test("/diff clears stale diff UI with an error model on invalid git input", async () => {
  const commands = install();
  const state = context({
    async gitDiff() {
      throw new Error("fatal: bad revision 'missing..head'");
    },
  });

  const widget = await commands.get("diff").handler("missing..head", state.ctx);
  assert.equal(widget.state.kind, "error");
  assert.match(widget.state.message, /bad revision/u);
  assert.equal(state.diffWidgets.length, 1);
  assert.equal(state.diffWidgets[0].widget.state.kind, "error");
  assert.equal(state.notifications.at(-1).level, "error");
});

test("/diff reports the missing TUI primitive instead of falling back to setWidget", async () => {
  const notifications = [];
  const legacyWidgets = [];
  const result = await renderDiffCommand("base..head", {
    cwd: "/repo",
    ui: {
      async setWidget(lines) {
        legacyWidgets.push(lines);
      },
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  });
  assert.deepEqual(result, []);
  assert.equal(legacyWidgets.length, 0);
  assert.equal(notifications.at(-1).level, "error");
  assert.match(notifications.at(-1).message, /setDiffWidget is required/u);
});
