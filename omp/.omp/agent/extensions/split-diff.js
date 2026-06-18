import { createPanelShell, resolvePanelPrimitives } from "./panel-shell.js";

const DIFF_USAGE = "Usage: /diff (<base..head> | --worktree | --staged | --pr <number>) [--file <path>]";
const ACTIVE_DIFF_OVERLAYS = new WeakMap();
// Plain ASCII column divider between the OLD and NEW panes. The shell owns the
// outer frame, so this module draws no box-drawing characters of its own.
const DIFF_COLUMN_SEPARATOR = " | ";
const DIFF_KEY_HINTS = "j/k ↑/↓ scroll · space/PgUp/PgDn page · [ ] file · { } hunk · g/G top/end · Esc close";
// Theme diff tokens used for red/green/context styling of the split body.
const DIFF_TOKENS = { removed: "toolDiffRemoved", added: "toolDiffAdded", context: "toolDiffContext" };

function tokenizeArgs(input = "") {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaping = false;

  for (const char of String(input)) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/u.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) current += "\\";
  if (quote) throw new Error("Unclosed quote in /diff arguments");
  if (current) tokens.push(current);
  return tokens;
}

function parseDiffArgs(input = "") {
  const tokens = tokenizeArgs(input);
  let file = "";
  let range = "";
  let staged = false;
  let worktree = false;
  let pr = "";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--file") {
      index += 1;
      if (!tokens[index]) throw new Error("/diff --file requires a path");
      file = tokens[index];
      continue;
    }
    if (token.startsWith("--file=")) {
      file = token.slice("--file=".length);
      if (!file) throw new Error("/diff --file requires a path");
      continue;
    }
    if (token === "--staged") {
      staged = true;
      continue;
    }
    if (token === "--worktree") {
      worktree = true;
      continue;
    }
    if (token === "--pr") {
      index += 1;
      if (!tokens[index]) throw new Error("/diff --pr requires a pull request number");
      pr = tokens[index];
      continue;
    }
    if (token.startsWith("--pr=")) {
      pr = token.slice("--pr=".length);
      if (!pr) throw new Error("/diff --pr requires a pull request number");
      continue;
    }
    if (token.startsWith("--")) throw new Error(`Unknown /diff option: ${token}`);
    if (range) throw new Error(DIFF_USAGE);
    range = token;
  }

  const selectedModes = [Boolean(range), staged, worktree, Boolean(pr)].filter(Boolean).length;
  if (selectedModes !== 1) throw new Error(DIFF_USAGE);
  if (range && !range.includes("..")) throw new Error("/diff revision range must look like base..head");
  if (pr && !/^\d+$/u.test(pr)) throw new Error("/diff --pr accepts a numeric pull request number only");

  if (range) return { kind: "range", label: range, range, file };
  if (staged) return { kind: "staged", label: "staged", file };
  if (worktree) return { kind: "worktree", label: "worktree", file };
  return { kind: "pr", label: `PR #${pr}`, pr, file };
}

function gitDiffArgs(request) {
  if (request.kind === "pr") throw new Error("git diff arguments are unavailable for PR diffs");
  const args = ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--unified=3"];
  if (request.kind === "range") args.push(request.range);
  else if (request.kind === "staged") args.push("--cached");
  args.push("--");
  if (request.file) args.push(request.file);
  return args;
}

function ghPrDiffArgs(request) {
  if (request.kind !== "pr") throw new Error("gh pr diff arguments require a PR request");
  return ["pr", "diff", request.pr, "--patch", "--color=never"];
}

async function runGitDiff(args, cwd) {
  if (!globalThis.Bun?.spawn) throw new Error("Git diff runner unavailable outside the Pi/Bun runtime");
  const proc = globalThis.Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((stderr || stdout || `git diff exited ${code}`).trim());
  return stdout;
}

async function runGhPrDiff(args, cwd) {
  if (!globalThis.Bun?.spawn) throw new Error("GitHub CLI runner unavailable outside the Pi/Bun runtime");
  const proc = globalThis.Bun.spawn(["gh", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((stderr || stdout || `gh pr diff exited ${code}`).trim());
  return stdout;
}

function unquotePath(path) {
  if (!path || path === "/dev/null") return "";
  let value = path;
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      value = JSON.parse(value);
    } catch {
      value = value.slice(1, -1);
    }
  }
  return value.replace(/^[ab]\//u, "");
}

function parseGitHeader(line) {
  const match = line.match(/^diff --git (.+) (.+)$/u);
  if (!match) return { oldPath: "", path: "" };
  return { oldPath: unquotePath(match[1]), path: unquotePath(match[2]) };
}

function fileStatus(file) {
  if (file.status) return file.status;
  if (!file.oldPath) return "added";
  if (!file.path) return "deleted";
  if (file.oldPath !== file.path) return "renamed";
  return "modified";
}

function createFile(header) {
  return { oldPath: header.oldPath, path: header.path, status: "", hunks: [] };
}

function flushChangeRows(hunk, pendingDeletes, pendingAdds) {
  const count = Math.max(pendingDeletes.length, pendingAdds.length);
  for (let index = 0; index < count; index += 1) {
    const deletion = pendingDeletes[index];
    const addition = pendingAdds[index];
    if (deletion && addition) {
      hunk.rows.push({
        type: "change",
        oldLine: deletion.line,
        newLine: addition.line,
        oldText: deletion.text,
        newText: addition.text,
        oldStyle: "delete",
        newStyle: "add",
      });
    } else if (deletion) {
      hunk.rows.push({ type: "delete", oldLine: deletion.line, oldText: deletion.text, oldStyle: "delete" });
    } else if (addition) {
      hunk.rows.push({ type: "add", newLine: addition.line, newText: addition.text, newStyle: "add" });
    }
  }
  pendingDeletes.length = 0;
  pendingAdds.length = 0;
}

function parseUnifiedDiff(text = "") {
  const files = [];
  const lines = String(text).split(/\r?\n/u);
  let file = null;
  let hunk = null;
  let oldLine = 0;
  let newLine = 0;
  const pendingDeletes = [];
  const pendingAdds = [];

  function finishFile() {
    if (!file) return;
    if (hunk) flushChangeRows(hunk, pendingDeletes, pendingAdds);
    file.status = fileStatus(file);
    file.path = file.path || file.oldPath;
    files.push(file);
    file = null;
    hunk = null;
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      finishFile();
      file = createFile(parseGitHeader(line));
      continue;
    }
    if (!file) continue;

    if (line.startsWith("rename from ")) {
      file.oldPath = unquotePath(line.slice("rename from ".length));
      file.status = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      file.path = unquotePath(line.slice("rename to ".length));
      file.status = "renamed";
      continue;
    }
    if (line.startsWith("new file mode ")) {
      file.oldPath = "";
      file.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      file.path = "";
      file.status = "deleted";
      continue;
    }
    if (line.startsWith("--- ")) {
      file.oldPath = unquotePath(line.slice(4)) || file.oldPath;
      continue;
    }
    if (line.startsWith("+++ ")) {
      file.path = unquotePath(line.slice(4)) || file.path;
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/u);
    if (hunkMatch) {
      if (hunk) flushChangeRows(hunk, pendingDeletes, pendingAdds);
      oldLine = Number.parseInt(hunkMatch[1], 10);
      newLine = Number.parseInt(hunkMatch[3], 10);
      hunk = {
        oldStart: oldLine,
        oldLines: Number.parseInt(hunkMatch[2] || "1", 10),
        newStart: newLine,
        newLines: Number.parseInt(hunkMatch[4] || "1", 10),
        heading: hunkMatch[5] || "",
        rows: [],
      };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;

    if (line.startsWith("\\")) {
      const lastRow = hunk.rows.at(-1) || pendingDeletes.at(-1) || pendingAdds.at(-1);
      if (lastRow) lastRow.note = line.slice(1).trim();
      continue;
    }

    const marker = line[0];
    const body = line.slice(1);
    if (marker === " ") {
      flushChangeRows(hunk, pendingDeletes, pendingAdds);
      hunk.rows.push({ type: "context", oldLine, newLine, oldText: body, newText: body });
      oldLine += 1;
      newLine += 1;
    } else if (marker === "-") {
      pendingDeletes.push({ line: oldLine, text: body });
      oldLine += 1;
    } else if (marker === "+") {
      pendingAdds.push({ line: newLine, text: body });
      newLine += 1;
    }
  }
  finishFile();
  return files;
}

function titleForRequest(request) {
  const suffix = request.file ? ` · ${request.file}` : "";
  return `Diff: ${request.label}${suffix}`;
}

function matchesRequestedFile(file, path) {
  return !path || file.path === path || file.oldPath === path;
}

function diffSectionMatchesFile(lines, path) {
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const header = parseGitHeader(line);
      if (matchesRequestedFile(header, path)) return true;
      continue;
    }
    if (line.startsWith("rename from ") && unquotePath(line.slice("rename from ".length)) === path) return true;
    if (line.startsWith("rename to ") && unquotePath(line.slice("rename to ".length)) === path) return true;
    if (line.startsWith("--- ") && unquotePath(line.slice(4)) === path) return true;
    if (line.startsWith("+++ ") && unquotePath(line.slice(4)) === path) return true;
  }
  return false;
}

function filterUnifiedDiffTextByFile(text, path) {
  if (!path) return text;
  const lines = String(text).split(/\r?\n/u);
  const kept = [];
  let section = [];

  function flushSection() {
    if (!section.length) return;
    if (diffSectionMatchesFile(section, path)) kept.push(...section);
    section = [];
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ")) flushSection();
    if (line || section.length) section.push(line);
  }
  flushSection();
  return kept.join("\n");
}

function buildDiffWidget(request, diffText) {
  const filteredText = filterUnifiedDiffTextByFile(diffText, request.file);
  const files = parseUnifiedDiff(filteredText);
  const emptyMessage = request.file ? `No changes for ${request.file}` : "No changes";
  return {
    title: titleForRequest(request),
    mode: "split",
    readOnly: true,
    scrollable: true,
    appearance: { deletion: "red", addition: "green" },
    navigation: {
      files: files.map((file, index) => ({ index, path: file.path, oldPath: file.oldPath, status: file.status })),
      hunks: true,
      keys: [
        "j/k or ↑/↓ scroll",
        "PgUp/PgDn page",
        "[ / ] previous/next file",
        "{ / } previous/next hunk",
        "g/G top/bottom",
        "q/Esc close",
      ],
    },
    state: files.length ? { kind: "ready" } : { kind: "empty", message: emptyMessage },
    files,
  };
}

function buildDiffErrorWidget(message, request = null) {
  return {
    title: request ? titleForRequest(request) : "Diff",
    mode: "split",
    readOnly: true,
    scrollable: true,
    appearance: { deletion: "red", addition: "green" },
    navigation: {
      files: [],
      hunks: false,
      keys: ["q/Esc close"],
    },
    state: { kind: "error", message },
    files: [],
  };
}

function sanitizeText(value) {
  return String(value ?? "").replace(/\t/gu, "  ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ");
}

function truncatePlain(value, width) {
  const text = sanitizeText(value);
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}

function padToWidth(value, width) {
  return truncatePlain(value, width).padEnd(Math.max(0, width));
}

// Apply a theme foreground token to already-padded plain text. Styling wraps the
// final plain string, so no manual ANSI slicing/measuring is needed; the shell's
// ScrollView owns width-aware truncation of the composed rows.
function color(theme, token, text) {
  if (!text) return text;
  if (theme?.fg) {
    try {
      return theme.fg(token, text);
    } catch {
      return text;
    }
  }
  if (token === "error" || token === "toolDiffRemoved") return `\x1b[31m${text}\x1b[0m`;
  if (token === "success" || token === "toolDiffAdded") return `\x1b[32m${text}\x1b[0m`;
  if (token === "accent") return `\x1b[36m${text}\x1b[0m`;
  if (token === "dim" || token === "muted") return `\x1b[2m${text}\x1b[0m`;
  return text;
}

function hunkTitle(hunk) {
  const suffix = hunk.heading ? ` ${hunk.heading}` : "";
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@${suffix}`;
}

function lineNumberWidth(file) {
  let maxLine = 0;
  for (const hunk of file?.hunks || []) {
    maxLine = Math.max(maxLine, hunk.oldStart + hunk.oldLines, hunk.newStart + hunk.newLines);
  }
  return Math.max(4, String(maxLine).length);
}

function flattenFile(file) {
  const rows = [];
  if (!file) return rows;
  file.hunks.forEach((hunk, hunkIndex) => {
    rows.push({ type: "hunk", hunk, hunkIndex });
    for (const row of hunk.rows) rows.push({ ...row, hunkIndex });
  });
  return rows;
}

// Per-overlay closure state: which file is currently shown, the widget it draws
// from, and the body-line offsets of each hunk header (derived during
// buildDiffSections, consumed by handleDiffKey for `{`/`}` navigation).
function createDiffState(widget) {
  return { widget, fileIndex: 0, hunkOffsets: [] };
}

function diffFilePath(file) {
  return file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path;
}

// Render one OLD|NEW pane cell: a right-aligned line-number gutter, a space, then
// width-truncated text, padded to the pane width and styled with `token` only
// when the side carries content (so empty halves of add/delete rows stay blank).
function renderDiffCell(lineNumber, text, paneWidth, gutter, token, theme) {
  const hasContent = Boolean(lineNumber);
  const numberLabel = lineNumber ? String(lineNumber).padStart(gutter) : " ".repeat(gutter);
  const textWidth = Math.max(0, paneWidth - gutter - 1);
  const cell = `${numberLabel} ${truncatePlain(text ?? "", textWidth)}`.slice(0, Math.max(0, paneWidth)).padEnd(Math.max(0, paneWidth));
  return hasContent ? color(theme, token, cell) : cell;
}

function renderDiffSplitRow(row, leftWidth, rightWidth, gutter, theme) {
  const oldToken = row.oldStyle === "delete" ? DIFF_TOKENS.removed : DIFF_TOKENS.context;
  const newToken = row.newStyle === "add" ? DIFF_TOKENS.added : DIFF_TOKENS.context;
  const oldCell = renderDiffCell(row.oldLine, row.oldText, leftWidth, gutter, oldToken, theme);
  const newCell = renderDiffCell(row.newLine, row.newText, rightWidth, gutter, newToken, theme);
  return `${oldCell}${DIFF_COLUMN_SEPARATOR}${newCell}`;
}

// Width-aware sections builder handed to the shell. Composes the current file's
// two-column split (OLD | NEW) sized to `innerWidth`, styling deletions/additions/
// context via theme diff tokens and hunk headers as accent. Records the body-line
// offset of each hunk header on `state.hunkOffsets` for `{`/`}` navigation.
function buildDiffSections(widget, state, innerWidth, theme) {
  const width = Math.max(1, Math.floor(Number(innerWidth) || 80));
  const model = widget.state || {};

  if (model.kind === "error") {
    state.hunkOffsets = [];
    return [{ label: widget.title, lines: [color(theme, "error", model.message || "Diff failed")] }];
  }
  if (!widget.files.length) {
    state.hunkOffsets = [];
    return [{ label: widget.title, lines: [color(theme, "dim", model.message || "No changes")] }];
  }

  const fileCount = widget.files.length;
  state.fileIndex = ((state.fileIndex % fileCount) + fileCount) % fileCount;
  const file = widget.files[state.fileIndex];
  const rows = flattenFile(file);

  const gutter = lineNumberWidth(file);
  const available = Math.max(2, width - DIFF_COLUMN_SEPARATOR.length);
  const leftWidth = Math.floor(available / 2);
  const rightWidth = available - leftWidth;

  const lines = [
    `${color(theme, "dim", padToWidth(" OLD", leftWidth))}${DIFF_COLUMN_SEPARATOR}${color(theme, "dim", padToWidth(" NEW", rightWidth))}`,
  ];

  // Body offset = accent label row (1) + OLD/NEW header row (1) + row index.
  const bodyOffset = 2;
  const hunkOffsets = [];
  rows.forEach((row, index) => {
    if (row.type === "hunk") {
      hunkOffsets.push(bodyOffset + index);
      lines.push(color(theme, "accent", padToWidth(` ${hunkTitle(row.hunk)}`, width)));
      return;
    }
    lines.push(renderDiffSplitRow(row, leftWidth, rightWidth, gutter, theme));
  });
  state.hunkOffsets = hunkOffsets;

  const label = `${widget.title} · ${state.fileIndex + 1}/${fileCount} ${diffFilePath(file)} (${file.status})`;
  return [{ label, lines }];
}

function diffScrollOffset(controller) {
  try {
    const value = Number(controller?.scrollView?.getScrollOffset?.() ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function jumpToHunk(controller, state, direction) {
  const offsets = state.hunkOffsets || [];
  if (!offsets.length) return;
  const current = diffScrollOffset(controller);
  const target = direction > 0
    ? (offsets.find((offset) => offset > current) ?? offsets[0])
    : (offsets.findLast((offset) => offset < current) ?? offsets[offsets.length - 1]);
  controller.scrollTo(target);
}

// Consumer input hook: own file (`[`/`]`) and hunk (`{`/`}`) navigation, returning
// true so the shell suppresses its default for those keys. Every other key
// (scroll, page, top/end, Esc, Ctrl-C) falls through to the shell's defaults.
function handleDiffKey(data, controller, state) {
  const fileCount = state.widget?.files?.length ?? 0;
  switch (data) {
    case "]":
      if (fileCount > 1) {
        state.fileIndex = (state.fileIndex + 1) % fileCount;
        controller.scrollTo(0);
        controller.refresh();
      }
      return true;
    case "[":
      if (fileCount > 1) {
        state.fileIndex = (state.fileIndex - 1 + fileCount) % fileCount;
        controller.scrollTo(0);
        controller.refresh();
      }
      return true;
    case "}":
      jumpToHunk(controller, state, 1);
      return true;
    case "{":
      jumpToHunk(controller, state, -1);
      return true;
    default:
      return false;
  }
}

function fallbackLines(widget) {
  if (widget.state.kind === "error") return [widget.title, widget.state.message];
  if (widget.state.kind === "empty") return [widget.title, widget.state.message];
  const fileWord = widget.files.length === 1 ? "file" : "files";
  return [widget.title, `Parsed ${widget.files.length} changed ${fileWord}. Open an interactive TUI to use the split diff overlay.`];
}

function clearActiveDiffOverlay(ctx) {
  const ui = ctx?.ui;
  if (!ui) return;
  const active = ACTIVE_DIFF_OVERLAYS.get(ui);
  if (!active) return;
  active.close("replaced");
  ACTIVE_DIFF_OVERLAYS.delete(ui);
}

async function presentDiffWidget(ctx, widget) {
  clearActiveDiffOverlay(ctx);
  const ui = ctx?.ui;
  if (!ui) return "none";

  // `ctx.panelPrimitives` is the test-injection seam; default to the live resolver.
  const primitives = ctx.panelPrimitives ?? (await resolvePanelPrimitives());

  if (primitives && ctx.hasUI !== false && typeof ui.custom === "function") {
    // Own ctx.ui.custom factory (not presentPanel) so the body builder can color
    // rows with the live `theme` and drive interactive file/hunk navigation.
    const state = createDiffState(widget);
    let component = null;
    try {
      const promise = ui.custom((tui, theme, _keybindings, done) => {
        component = createPanelShell(primitives, {
          title: widget.title,
          theme,
          tui,
          done,
          keyHints: DIFF_KEY_HINTS,
          sections: (innerWidth) => buildDiffSections(widget, state, innerWidth, theme),
          onInput: (data, controller) => handleDiffKey(data, controller, state),
        });
        ACTIVE_DIFF_OVERLAYS.set(ui, component);
        return component;
      }, { overlay: true });
      Promise.resolve(promise).then(() => {
        if (component && ACTIVE_DIFF_OVERLAYS.get(ui) === component) ACTIVE_DIFF_OVERLAYS.delete(ui);
      }).catch((error) => {
        if (component && ACTIVE_DIFF_OVERLAYS.get(ui) === component) ACTIVE_DIFF_OVERLAYS.delete(ui);
        ui.notify?.(`Diff overlay failed: ${error.message}`, "error");
      });
      return "custom";
    } catch (error) {
      ui.notify?.(`Diff overlay unavailable: ${error.message}`, "error");
    }
  }

  if (typeof ui.setWidget === "function") {
    await ui.setWidget(fallbackLines(widget), { placement: "belowEditor" });
    return "setWidget";
  }
  return "none";
}

async function showDiffError(ctx, message, request) {
  const widget = buildDiffErrorWidget(message, request);
  await presentDiffWidget(ctx, widget);
  ctx?.ui?.notify?.(message, "error");
  return widget;
}

async function renderDiffCommand(args, ctx = {}) {
  let request;
  try {
    request = parseDiffArgs(args);
  } catch (error) {
    return showDiffError(ctx, error.message, null);
  }

  try {
    const diffText = request.kind === "pr"
      ? await (ctx.ghPrDiff || runGhPrDiff)(ghPrDiffArgs(request), ctx.cwd, request)
      : await (ctx.gitDiff || runGitDiff)(gitDiffArgs(request), ctx.cwd, request);
    const widget = buildDiffWidget(request, diffText);
    await presentDiffWidget(ctx, widget);
    const files = widget.files.length;
    ctx.ui?.notify?.(files ? `Showing split diff for ${files} file${files === 1 ? "" : "s"}` : widget.state.message, "info");
    return widget;
  } catch (error) {
    const message = `Diff failed: ${error.message}`;
    return showDiffError(ctx, message, request);
  }
}

export {
  buildDiffErrorWidget,
  buildDiffSections,
  buildDiffWidget,
  createDiffState,
  ghPrDiffArgs,
  gitDiffArgs,
  handleDiffKey,
  parseDiffArgs,
  parseUnifiedDiff,
  presentDiffWidget,
  renderDiffCommand,
  runGhPrDiff,
  runGitDiff,
};
