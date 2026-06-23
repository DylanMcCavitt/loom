// Session selection for the OMP runtime control adapter (LOO-7).
//
// An adapter op MUST name its target session explicitly — there is no implicit "current"
// session. A selector is exactly one of:
//   - session_id   : a UUIDv7 prefix (case-insensitive) of an OMP session.
//   - session_file : an explicit `.jsonl` path under the sessions root.
//
// Resolution refuses on zero or ambiguous matches and returns candidate ids only. It derives
// everything from FILENAMES + stat — it never reads session file contents (local-only boundary;
// the file body is excludedRuntimeState).
//
// Layout (omp/16.0.5): ~/.omp/agent/sessions/<sanitized-cwd>/<ISO-timestamp>_<UUIDv7>.jsonl

import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const SESSION_FILENAME = /^(.+)_([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\.jsonl$/u;

export function defaultSessionsDir() {
  return path.join(process.env.HOME ?? homedir(), ".omp", "agent", "sessions");
}

export function parseSessionFilename(name) {
  const match = SESSION_FILENAME.exec(name);
  if (!match) return null;
  return { timestamp: match[1], sessionId: match[2].toLowerCase() };
}

// Resolve `target` to a real, contained, regular file under `root`. Rejects symlinks and any
// path that escapes the sessions root lexically OR after realpath resolution (defends against a
// symlinked session file or ancestor dir pointing outside the local-only boundary).
function resolveContainedFile(root, target) {
  const base = path.resolve(root);
  const lexical = path.resolve(target);
  if (lexical !== base && !lexical.startsWith(base + path.sep)) {
    throw new Error("path escapes sessions root (lexical)");
  }
  const stats = lstatSync(lexical); // throws ENOENT for a missing file
  if (stats.isSymbolicLink()) throw new Error("symlink session file rejected");
  if (!stats.isFile()) throw new Error("not a regular file");
  const realRoot = realpathSync(base);
  const realFile = realpathSync(lexical);
  if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
    throw new Error("path escapes sessions root (realpath)");
  }
  return realFile;
}

// List sessions from filenames + stat only (no content reads). Recurses one level of cwd dirs.
export function listSessions(sessionsDir = defaultSessionsDir()) {
  const out = [];
  let topEntries;
  try {
    topEntries = readdirSync(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return out;
    throw error;
  }
  const scanDir = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue; // regular files only — skips dirs and symlinks
      const parsed = parseSessionFilename(entry.name);
      if (!parsed) continue;
      const sessionFile = path.join(dir, entry.name);
      let bytes = null;
      try {
        bytes = statSync(sessionFile).size;
      } catch {
        bytes = null;
      }
      out.push({ sessionId: parsed.sessionId, timestamp: parsed.timestamp, sessionFile, bytes });
    }
  };
  scanDir(sessionsDir);
  for (const entry of topEntries) {
    if (entry.isDirectory()) scanDir(path.join(sessionsDir, entry.name));
  }
  return out.sort((a, b) => a.sessionFile.localeCompare(b.sessionFile));
}

// Resolve a selector to a single session. Returns { ok, sessionId, sessionFile } or
// { ok:false, error, candidates? } where candidates is a list of session ids (never contents).
export function resolveSelector(selector = {}, options = {}) {
  const sessionsDir = options.sessionsDir ?? defaultSessionsDir();
  const hasId = typeof selector.session_id === "string" && selector.session_id.trim() !== "";
  const hasFile = typeof selector.session_file === "string" && selector.session_file.trim() !== "";

  if (!hasId && !hasFile) {
    return { ok: false, error: "selector_required", message: "Provide exactly one of session_id or session_file; there is no implicit current session." };
  }
  if (hasId && hasFile) {
    return { ok: false, error: "selector_ambiguous", message: "Provide exactly one selector, not both session_id and session_file." };
  }

  if (hasFile) {
    if (!selector.session_file.endsWith(".jsonl")) {
      return { ok: false, error: "selector_invalid", message: "session_file must be a .jsonl session path." };
    }
    let resolved;
    try {
      resolved = resolveContainedFile(sessionsDir, selector.session_file);
    } catch {
      return { ok: false, error: "selector_invalid", message: "session_file must be an existing, non-symlink .jsonl inside the sessions root." };
    }
    const parsed = parseSessionFilename(path.basename(resolved));
    if (!parsed) {
      return { ok: false, error: "selector_invalid", message: "session_file is not a recognized <timestamp>_<uuid>.jsonl name." };
    }
    return { ok: true, sessionId: parsed.sessionId, sessionFile: resolved };
  }

  const prefix = selector.session_id.trim().toLowerCase();
  const matches = listSessions(sessionsDir).filter((s) => s.sessionId.startsWith(prefix));
  if (matches.length === 0) {
    return { ok: false, error: "selector_no_match", message: `No session id starts with "${prefix}".`, candidates: [] };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: "selector_ambiguous",
      message: `Ambiguous session_id "${prefix}" matches ${matches.length} sessions; pass a longer id.`,
      candidates: matches.map((s) => s.sessionId),
    };
  }
  return { ok: true, sessionId: matches[0].sessionId, sessionFile: matches[0].sessionFile };
}
