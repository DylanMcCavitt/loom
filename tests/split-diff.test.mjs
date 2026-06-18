import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildDiffErrorWidget,
  buildDiffSections,
  buildDiffWidget,
  createDiffState,
  ghPrDiffArgs,
  gitDiffArgs,
  handleDiffKey,
  parseDiffArgs,
  parseUnifiedDiff,
  renderDiffCommand,
} from "../omp/.omp/agent/extensions/split-diff.js";

const SPLIT_DIFF_SOURCE = readFileSync(
  new URL("../omp/.omp/agent/extensions/split-diff.js", import.meta.url),
  "utf8",
);

// Identity-ish theme: wraps text in `<token>…</token>` so assertions can detect
// which theme diff token styled each cell (toolDiffRemoved/Added/Context, etc.).
const theme = {
  fg(token, text) {
    return `<${token}>${text}</${token}>`;
  },
};

// Stub of the native `ScrollView`: a fixed-height window over `lines` with an
// offset clamped to [0, max] and the same `handleScrollKey(data)` seam the real
// component exposes. Mirrors the canonical CSI sequences used by the extensions.
class StubScrollView {
  constructor(lines, options = {}) {
    this.lines = [...lines];
    this.height = Math.max(0, Math.trunc(options.height ?? this.lines.length));
    this.offset = 0;
  }

  maxOffset() {
    return Math.max(0, this.lines.length - this.height);
  }

  clamp() {
    this.offset = Math.max(0, Math.min(this.offset, this.maxOffset()));
  }

  getScrollOffset() {
    return this.offset;
  }

  getMaxScrollOffset() {
    return this.maxOffset();
  }

  scrollBy(delta) {
    this.offset += delta;
    this.clamp();
  }

  handleScrollKey(data) {
    switch (data) {
      case "\u001b[A":
        this.scrollBy(-1);
        return true;
      case "\u001b[B":
        this.scrollBy(1);
        return true;
      case "\u001b[5~":
        this.scrollBy(-this.height);
        return true;
      case "\u001b[6~":
        this.scrollBy(this.height);
        return true;
      case "\u001b[H":
        this.offset = 0;
        return true;
      case "\u001b[F":
        this.offset = this.maxOffset();
        return true;
      default:
        return false;
    }
  }

  render() {
    if (this.height === 0) return [];
    this.clamp();
    const out = [];
    for (let row = 0; row < this.height; row += 1) out.push(this.lines[this.offset + row] ?? "");
    return out;
  }

  setLines(lines) {
    this.lines = [...lines];
    this.clamp();
  }

  setHeight(height) {
    this.height = Math.max(0, Math.trunc(height));
    this.clamp();
  }

  setScrollOffset(offset) {
    this.offset = Number.isFinite(offset) ? Math.trunc(offset) : 0;
    this.clamp();
  }
}

// Stub of the native `framedBlock`: calls `build(width)` and flattens the
// resulting block (header + headerMeta, labelled sections, lines) into the
// `readonly string[]` the Component contract returns.
function stubFramedBlock(_theme, build) {
  return {
    render(width) {
      const opts = build(width);
      const lines = [];
      if (opts.header) lines.push(`[${opts.header}${opts.headerMeta ? ` ${opts.headerMeta}` : ""}]`);
      for (const section of opts.sections ?? []) {
        if (section.label) lines.push(`<<${section.label}>>`);
        for (const line of section.lines ?? []) lines.push(line);
      }
      return lines;
    },
    invalidate() {},
  };
}

function panelPrimitives() {
  return { framedBlock: stubFramedBlock, renderOutputBlock: () => [], ScrollView: StubScrollView };
}

// Command-path harness: a ctx whose `ui.custom` builds the real shell from
// injected primitives (so ctx.ui.custom IS exercised under `node --test`) and
// captures the mounted component plus its `done` result.
function context(overrides = {}) {
  const customOverlays = [];
  const legacyWidgets = [];
  const notifications = [];
  return {
    ctx: {
      cwd: "/repo",
      hasUI: true,
      panelPrimitives: panelPrimitives(),
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

// A change near the top (so red/green/context are visible in the first window)
// followed by enough context to overflow any plausible terminal viewport, so the
// shell's scroll handling is genuinely exercised.
const SCROLL_BODY = Array.from({ length: 140 }, (_value, index) => ` keep${index + 1}();`).join("\n");
const SCROLL_DIFF = `diff --git a/src/scroll.js b/src/scroll.js
index 1111111..2222222 100644
--- a/src/scroll.js
+++ b/src/scroll.js
@@ -1,142 +1,143 @@
 topKept();
-oldLine();
+newLine();
${SCROLL_BODY}
+tailAdded();
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

test("buildDiffSections styles red/green/context rows with line numbers for the current file", () => {
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, `${MODIFIED_DIFF}${RENAMED_DIFF}`);
  const state = createDiffState(widget);
  const sections = buildDiffSections(widget, state, 120, theme);

  assert.equal(sections.length, 1);
  // Header carries the diff title, file position, path, and status of file 0.
  assert.match(sections[0].label, /Diff: base\.\.head · 1\/2 src\/app\.js \(modified\)/u);

  const lines = sections[0].lines;
  const text = lines.join("\n");
  assert.ok(text.includes("OLD") && text.includes("NEW"), "OLD/NEW column header present");

  // The modified line is a `change` row: its OLD half is red (toolDiffRemoved),
  // its NEW half is green (toolDiffAdded), and both line numbers are preserved.
  const changeLine = lines.find((line) => line.includes("const name = \"old\";"));
  assert.ok(changeLine, "change row rendered");
  assert.ok(changeLine.includes("<toolDiffRemoved>"), "deletion styled red via toolDiffRemoved");
  assert.ok(changeLine.includes("<toolDiffAdded>"), "addition styled green via toolDiffAdded");
  assert.ok(changeLine.includes("const name = \"new\";"), "new text on the same split row");
  assert.match(changeLine, /\b2\b/u, "old/new line number 2 preserved");

  // Unchanged lines render as context on both panes via toolDiffContext.
  const contextLine = lines.find((line) => line.includes("const keep = true;"));
  assert.ok(contextLine.includes("<toolDiffContext>"), "context styled via toolDiffContext");
  assert.match(contextLine, /\b1\b/u, "context line number 1 preserved");

  // Hunk header rows render as accent.
  assert.ok(lines.some((line) => line.includes("<accent>") && line.includes("@@")), "hunk header styled accent");
});

test("handleDiffKey [ ] switches the current file and resets scroll", () => {
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, `${MODIFIED_DIFF}${RENAMED_DIFF}`);
  const state = createDiffState(widget);
  buildDiffSections(widget, state, 120, theme);

  const calls = { scrollTo: [], refresh: 0 };
  const controller = {
    scrollTo(line) {
      calls.scrollTo.push(line);
    },
    refresh() {
      calls.refresh += 1;
    },
    scrollView: { getScrollOffset: () => 0 },
  };

  assert.equal(handleDiffKey("]", controller, state), true);
  assert.equal(state.fileIndex, 1);
  assert.deepEqual(calls.scrollTo, [0]);
  assert.equal(calls.refresh, 1);

  // The active file is now the renamed file; its section reflects 2/2 + rename path.
  const sections = buildDiffSections(widget, state, 120, theme);
  assert.match(sections[0].label, /2\/2 docs\/old\.txt → docs\/new\.txt \(renamed\)/u);

  assert.equal(handleDiffKey("[", controller, state), true);
  assert.equal(state.fileIndex, 0);
  assert.deepEqual(calls.scrollTo, [0, 0]);
  assert.equal(calls.refresh, 2);
});

test("handleDiffKey { } jumps to the next/previous hunk offsets", () => {
  const widget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, SECOND_HUNK_DIFF);
  const state = createDiffState(widget);
  buildDiffSections(widget, state, 120, theme);
  // Two hunk headers → two recorded body offsets (label + OLD/NEW header above).
  assert.equal(state.hunkOffsets.length, 2);
  const [firstHunk, secondHunk] = state.hunkOffsets;

  let offset = 0;
  const controller = {
    scrollTo(line) {
      offset = line;
    },
    scrollView: { getScrollOffset: () => offset },
  };

  assert.equal(handleDiffKey("}", controller, state), true);
  assert.equal(offset, firstHunk, "first } jumps to the first hunk below the top");
  assert.equal(handleDiffKey("}", controller, state), true);
  assert.equal(offset, secondHunk, "second } advances to the next hunk");
  assert.equal(handleDiffKey("{", controller, state), true);
  assert.equal(offset, firstHunk, "{ steps back to the previous hunk");
});

test("buildDiffSections renders explicit empty and error states", () => {
  const emptyWidget = buildDiffWidget({ kind: "range", label: "base..head", range: "base..head", file: "" }, "");
  const emptySections = buildDiffSections(emptyWidget, createDiffState(emptyWidget), 80, theme);
  assert.equal(emptySections.length, 1);
  assert.match(emptySections[0].lines.join("\n"), /No changes/u);

  const errorWidget = buildDiffErrorWidget("fatal: bad revision 'missing'", {
    kind: "range",
    label: "base..head",
    range: "base..head",
    file: "",
  });
  const errorSections = buildDiffSections(errorWidget, createDiffState(errorWidget), 80, theme);
  const errorText = errorSections[0].lines.join("\n");
  assert.match(errorText, /bad revision/u, "error message is visible");
  assert.ok(errorText.includes("<error>"), "error message styled");
});

test("/diff renders through an injected ctx.ui.custom overlay shell", async () => {
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

  const widget = await renderDiffCommand("base..head --file src/app.js", state.ctx);
  assert.equal(widget.title, "Diff: base..head · src/app.js");
  assert.equal(widget.mode, "split");
  assert.equal(widget.files.length, 1);
  assert.equal(state.customOverlays.length, 1);
  assert.equal(state.customOverlays[0].options.overlay, true);
  assert.equal(state.legacyWidgets.length, 0);
  assert.equal(state.notifications.at(-1).message, "Showing split diff for 1 file");

  // The shell factory built a real panel that renders the styled split body.
  const text = state.customOverlays[0].component.render(120).join("\n");
  assert.ok(text.includes("OLD") && text.includes("NEW"), "split header rendered through the shell");
  assert.ok(text.includes("<toolDiffRemoved>"), "deletion styled in the live render path");
  assert.ok(text.includes("<toolDiffAdded>"), "addition styled in the live render path");
});

test("/diff carries a scrollable multi-file model with file and hunk navigation", async () => {
  const state = context({
    async gitDiff() {
      return `${MODIFIED_DIFF}${RENAMED_DIFF}`;
    },
  });

  const widget = await renderDiffCommand("base..head", state.ctx);
  assert.equal(widget.scrollable, true);
  assert.deepEqual(widget.navigation.files.map((file) => file.path), ["src/app.js", "docs/new.txt"]);
  assert.equal(widget.navigation.hunks, true);
  assert.ok(widget.navigation.keys.some((key) => key.includes("hunk")));
});

test("/diff scrolls a tall diff through the shell's scroll handling", async () => {
  const state = context({
    async gitDiff() {
      return SCROLL_DIFF;
    },
  });

  await renderDiffCommand("base..head", state.ctx);
  const component = state.customOverlays[0].component;
  component.render(120);

  const before = component.controller.scrollView.getScrollOffset();
  component.handleInput("\u001b[6~"); // PgDn routes through the shell to ScrollView
  const after = component.controller.scrollView.getScrollOffset();
  assert.ok(after > before, "shell scroll advances the diff body for tall diffs");
});

test("/diff renders an explicit empty state for no changes", async () => {
  const state = context({
    async gitDiff() {
      return "";
    },
  });

  const widget = await renderDiffCommand("base..head", state.ctx);
  assert.deepEqual(widget.state, { kind: "empty", message: "No changes" });
  assert.equal(state.notifications.at(-1).message, "No changes");
  assert.match(state.customOverlays[0].component.render(80).join("\n"), /No changes/u);
});

test("/diff replaces stale diff overlays on repeated render and invalid input", async () => {
  const state = context({
    async gitDiff(args) {
      if (args.includes("missing..head")) throw new Error("fatal: bad revision 'missing..head'");
      return MODIFIED_DIFF;
    },
  });

  await renderDiffCommand("base..head", state.ctx);
  await renderDiffCommand("other..head", state.ctx);
  assert.equal(state.customOverlays[0].result, "replaced", "first overlay closed when the second mounts");

  const widget = await renderDiffCommand("missing..head", state.ctx);
  assert.equal(state.customOverlays[1].result, "replaced", "second overlay closed before the error overlay");
  assert.equal(widget.state.kind, "error");
  assert.match(widget.state.message, /bad revision/u);
  const errorText = state.customOverlays.at(-1).component.render(80).join("\n");
  assert.match(errorText, /bad revision/u, "error overlay leaves a visible error, not stale UI");
  assert.equal(state.notifications.at(-1).level, "error");
});

test("/diff uses a safe non-TUI fallback instead of requiring custom overlays", async () => {
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

test("split-diff renders without box-art or legacy windowing helpers", () => {
  assert.doesNotMatch(SPLIT_DIFF_SOURCE, /[\u2500-\u257F]/u, "no box-drawing characters remain");
  assert.doesNotMatch(SPLIT_DIFF_SOURCE, /\bOVERLAY_ROWS\b/u, "no manual OVERLAY_ROWS windowing");
  assert.doesNotMatch(SPLIT_DIFF_SOURCE, /\bBODY_ROWS\b/u, "no manual BODY_ROWS windowing");
  assert.doesNotMatch(SPLIT_DIFF_SOURCE, /\btruncateAnsi\b/u, "no hand-rolled ANSI truncation");
  assert.doesNotMatch(SPLIT_DIFF_SOURCE, /\bSplitDiffOverlayComponent\b/u, "hand-rolled overlay component removed");
});
