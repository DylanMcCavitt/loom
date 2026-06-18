const DIFF_USAGE = "Usage: /diff (<base..head> | --worktree | --staged | --pr <number>) [--file <path>]";
const OVERLAY_ROWS = 24;
const BODY_ROWS = 17;
const ANSI_PATTERN = /\x1b\[[0-9;]*m/gu;
const ACTIVE_DIFF_OVERLAYS = new WeakMap();

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

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function visibleLength(value) {
  return stripAnsi(value).length;
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

function padPlain(value, width) {
  const text = truncatePlain(value, width);
  return `${text}${" ".repeat(Math.max(0, width - text.length))}`;
}

function truncateAnsi(value, width) {
  const text = String(value);
  if (visibleLength(text) <= width) return text;
  return truncatePlain(stripAnsi(text), width);
}


function color(theme, token, text) {
  if (!text) return text;
  if (theme?.fg) {
    try {
      return theme.fg(token, text);
    } catch {
      return text;
    }
  }
  if (token === "error") return `\x1b[31m${text}\x1b[0m`;
  if (token === "success") return `\x1b[32m${text}\x1b[0m`;
  if (token === "accent") return `\x1b[36m${text}\x1b[0m`;
  if (token === "dim" || token === "muted") return `\x1b[2m${text}\x1b[0m`;
  return text;
}

function rawKey(data) {
  if (data === "\u001b[A") return "up";
  if (data === "\u001b[B") return "down";
  if (data === "\u001b[5~") return "pageup";
  if (data === "\u001b[6~") return "pagedown";
  if (data === "\u001b[H" || data === "\u001bOH") return "home";
  if (data === "\u001b[F" || data === "\u001bOF") return "end";
  if (data === "\u0003") return "ctrl-c";
  if (data === "\u001b") return "escape";
  return data;
}

function safeMatches(keybindings, data, action) {
  try {
    return Boolean(keybindings?.matches?.(data, action));
  } catch {
    return false;
  }
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

class SplitDiffOverlayComponent {
  constructor(widget, theme, keybindings, done) {
    this.widget = widget;
    this.theme = theme;
    this.keybindings = keybindings;
    this.done = done;
    this.fileIndex = 0;
    this.scroll = 0;
    this.closed = false;
    this.cachedWidth = 0;
    this.cachedRows = null;
  }

  invalidate() {
    this.cachedRows = null;
  }

  dispose() {
    this.closed = true;
    this.invalidate();
  }

  close(result = "closed") {
    if (this.closed) return;
    this.closed = true;
    this.invalidate();
    this.done?.(result);
  }

  currentFile() {
    return this.widget.files[this.fileIndex] || null;
  }

  currentRows() {
    return flattenFile(this.currentFile());
  }

  clampScroll() {
    const max = Math.max(0, this.currentRows().length - BODY_ROWS);
    this.scroll = Math.max(0, Math.min(this.scroll, max));
  }

  markChanged() {
    this.clampScroll();
    this.invalidate();
  }

  scrollBy(delta) {
    this.scroll += delta;
    this.markChanged();
  }

  goTop() {
    this.scroll = 0;
    this.markChanged();
  }

  goBottom() {
    this.scroll = Number.POSITIVE_INFINITY;
    this.markChanged();
  }

  moveFile(delta) {
    if (!this.widget.files.length) return;
    this.fileIndex = (this.fileIndex + delta + this.widget.files.length) % this.widget.files.length;
    this.scroll = 0;
    this.markChanged();
  }

  moveHunk(delta) {
    const rows = this.currentRows();
    if (!rows.length) return;
    const hunkOffsets = rows.flatMap((row, index) => (row.type === "hunk" ? [index] : []));
    if (!hunkOffsets.length) return;
    let next = hunkOffsets.at(delta > 0 ? 0 : -1);
    if (delta > 0) {
      next = hunkOffsets.find((offset) => offset > this.scroll) ?? hunkOffsets[0];
    } else {
      next = hunkOffsets.findLast((offset) => offset < this.scroll) ?? hunkOffsets.at(-1);
    }
    this.scroll = next;
    this.markChanged();
  }

  handleInput(data) {
    if (this.closed) return;
    if (safeMatches(this.keybindings, data, "app.interrupt")) {
      this.close("cancelled");
      return;
    }

    switch (rawKey(data)) {
      case "q":
      case "escape":
      case "ctrl-c":
        this.close("closed");
        return;
      case "j":
      case "down":
        this.scrollBy(1);
        return;
      case "k":
      case "up":
        this.scrollBy(-1);
        return;
      case " ":
      case "pagedown":
        this.scrollBy(BODY_ROWS);
        return;
      case "b":
      case "pageup":
        this.scrollBy(-BODY_ROWS);
        return;
      case "g":
      case "home":
        this.goTop();
        return;
      case "G":
      case "end":
        this.goBottom();
        return;
      case "]":
        this.moveFile(1);
        return;
      case "[":
        this.moveFile(-1);
        return;
      case "}":
        this.moveHunk(1);
        return;
      case "{":
        this.moveHunk(-1);
        return;
      default:
        return;
    }
  }

  render(width) {
    const safeWidth = Math.max(1, Math.floor(width || 80));
    if (this.cachedRows && this.cachedWidth === safeWidth) return this.cachedRows;

    this.clampScroll();
    const rows = safeWidth < 40
      ? this.renderNarrowRows(safeWidth)
      : this.widget.files.length
        ? this.renderDiffRows(safeWidth)
        : this.renderStateRows(safeWidth);
    this.cachedWidth = safeWidth;
    this.cachedRows = rows.slice(0, OVERLAY_ROWS).map((line) => truncateAnsi(line, safeWidth));
    return this.cachedRows;
  }

  renderNarrowRows(width) {
    const state = this.widget.state;
    const message = state.kind === "ready" ? "Widen terminal for split diff" : state.message || "No changes";
    return [
      padPlain(" Diff ", width),
      padPlain(message, width),
      padPlain("q/Esc close", width),
    ];
  }

  renderStateRows(width) {
    const state = this.widget.state;
    const style = state.kind === "error" ? "error" : "accent";
    return [
      color(this.theme, "accent", padPlain(` ${this.widget.title} `, width)),
      "─".repeat(width),
      color(this.theme, style, padPlain(` ${state.message || "No changes"}`, width)),
      padPlain(" q/Esc close", width),
    ];
  }

  renderDiffRows(width) {
    const file = this.currentFile();
    const rows = this.currentRows();
    const maxScroll = Math.max(0, rows.length - BODY_ROWS);
    const start = Math.min(this.scroll, maxScroll);
    const end = Math.min(rows.length, start + BODY_ROWS);
    const gutter = lineNumberWidth(file);
    const separator = " │ ";
    const paneWidth = Math.max(12, Math.floor((width - visibleLength(separator)) / 2));
    const rightWidth = Math.max(12, width - paneWidth - visibleLength(separator));
    const hunkCount = file.hunks.length;
    const visibleHunk = rows[start]?.hunkIndex ?? 0;
    const path = file.oldPath && file.oldPath !== file.path ? `${file.oldPath} → ${file.path}` : file.path;
    const title = ` ${this.widget.title} · ${this.fileIndex + 1}/${this.widget.files.length} ${path} (${file.status}) `;
    const position = ` lines ${rows.length ? start + 1 : 0}-${end}/${rows.length} · hunk ${Math.min(visibleHunk + 1, hunkCount)}/${hunkCount || 0}`;
    const output = [
      color(this.theme, "accent", padPlain(title, width)),
      color(this.theme, "dim", padPlain(position, width)),
      `${padPlain("OLD", paneWidth)}${separator}${padPlain("NEW", rightWidth)}`,
    ];

    for (const row of rows.slice(start, end)) output.push(this.renderRow(row, paneWidth, rightWidth, gutter, separator, width));
    while (output.length < BODY_ROWS + 3) output.push(`${" ".repeat(paneWidth)}${separator}${" ".repeat(rightWidth)}`);
    output.push(color(this.theme, "dim", padPlain(" j/k ↑/↓ scroll · PgUp/PgDn page · [ ] file · { } hunk · g/G top/end · q/Esc close", width)));
    return output;
  }

  renderRow(row, paneWidth, rightWidth, gutter, separator, width) {
    if (row.type === "hunk") {
      return color(this.theme, "accent", padPlain(` ${hunkTitle(row.hunk)}`, width));
    }
    const oldCell = this.renderCell(row.oldLine, row.oldText, paneWidth, gutter, row.oldStyle === "delete" ? "error" : "");
    const newCell = this.renderCell(row.newLine, row.newText, rightWidth, gutter, row.newStyle === "add" ? "success" : "");
    return `${oldCell}${separator}${newCell}`;
  }

  renderCell(lineNumber, text, width, gutter, style) {
    const line = lineNumber ? String(lineNumber).padStart(gutter) : " ".repeat(gutter);
    const plain = padPlain(`${line} │ ${text ?? ""}`, width);
    return style ? color(this.theme, style, plain) : plain;
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

  if (ctx.hasUI !== false && typeof ui.custom === "function") {
    let component = null;
    try {
      const promise = ui.custom((_tui, theme, keybindings, done) => {
        component = new SplitDiffOverlayComponent(widget, theme, keybindings, done);
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
  SplitDiffOverlayComponent,
  buildDiffErrorWidget,
  buildDiffWidget,
  ghPrDiffArgs,
  gitDiffArgs,
  parseDiffArgs,
  parseUnifiedDiff,
  presentDiffWidget,
  renderDiffCommand,
  runGhPrDiff,
  runGitDiff,
};
