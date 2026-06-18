const DIFF_USAGE = "Usage: /diff <base..head> [--file <path>]";

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
    if (token === "--pr" || token.startsWith("--pr=")) {
      throw new Error("/diff --pr is not implemented in this config extension; use a local revision range");
    }
    if (token.startsWith("--")) throw new Error(`Unknown /diff option: ${token}`);
    if (range) throw new Error(DIFF_USAGE);
    range = token;
  }

  const selectedModes = [Boolean(range), staged, worktree].filter(Boolean).length;
  if (selectedModes !== 1) throw new Error(DIFF_USAGE);
  if (range && !range.includes("..")) throw new Error("/diff revision range must look like base..head");

  if (range) return { kind: "range", label: range, range, file };
  if (staged) return { kind: "staged", label: "staged", file };
  return { kind: "worktree", label: "worktree", file };
}

function gitDiffArgs(request) {
  const args = ["diff", "--no-ext-diff", "--no-color", "--find-renames", "--unified=3"];
  if (request.kind === "range") args.push(request.range);
  else if (request.kind === "staged") args.push("--cached");
  args.push("--");
  if (request.file) args.push(request.file);
  return args;
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

function buildDiffWidget(request, diffText) {
  const files = parseUnifiedDiff(diffText);
  return {
    title: titleForRequest(request),
    mode: "split",
    readOnly: true,
    scrollable: true,
    appearance: { deletion: "red", addition: "green" },
    navigation: {
      files: files.map((file, index) => ({ index, path: file.path, oldPath: file.oldPath, status: file.status })),
      hunks: true,
      keys: ["j/k scroll", "[ / ] file", "{ / } hunk"],
    },
    state: files.length ? { kind: "ready" } : { kind: "empty", message: "No changes" },
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
    navigation: { files: [], hunks: false, keys: [] },
    state: { kind: "error", message },
    files: [],
  };
}

async function showDiffError(ctx, message, request) {
  if (ctx?.ui?.setDiffWidget) await ctx.ui.setDiffWidget(buildDiffErrorWidget(message, request), { placement: "belowEditor" });
  ctx?.ui?.notify?.(message, "error");
}

async function renderDiffCommand(args, ctx = {}) {
  let request;
  try {
    request = parseDiffArgs(args);
  } catch (error) {
    await showDiffError(ctx, error.message, null);
    return [];
  }

  if (!ctx.ui?.setDiffWidget) {
    ctx.ui?.notify?.("Diff widget API unavailable: ctx.ui.setDiffWidget is required for /diff.", "error");
    return [];
  }

  try {
    const diffArgs = gitDiffArgs(request);
    const diffRunner = ctx.gitDiff || runGitDiff;
    const diffText = await diffRunner(diffArgs, ctx.cwd, request);
    const widget = buildDiffWidget(request, diffText);
    await ctx.ui.setDiffWidget(widget, { placement: "belowEditor" });
    const files = widget.files.length;
    ctx.ui?.notify?.(files ? `Showing split diff for ${files} file${files === 1 ? "" : "s"}` : "No changes", "info");
    return widget;
  } catch (error) {
    const message = `Diff failed: ${error.message}`;
    await showDiffError(ctx, message, request);
    return buildDiffErrorWidget(message, request);
  }
}

export {
  buildDiffErrorWidget,
  buildDiffWidget,
  gitDiffArgs,
  parseDiffArgs,
  parseUnifiedDiff,
  renderDiffCommand,
  runGitDiff,
};
