import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { readJson } from "./harness-candidate-model.mjs";

const MARKER_DIR = ".loom-harness";
const MARKER_FILE = "applied-manifest.json";
const MARKER_SCHEMA_VERSION = 1;

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

export function resolveHomeRoot(options) {
  return options.home ? path.resolve(options.home) : process.env.HOME ?? homedir();
}

export function pathExists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function safeJoin(root, relPath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`refusing to resolve outside ${base}: ${relPath}`);
  }
  return target;
}

export function resolveLivePath(displayDestination, homeRoot) {
  if (!displayDestination.startsWith("~/")) return null;
  return safeJoin(homeRoot, displayDestination.slice(2));
}

export function liveInspect(candidate, homeRoot, marker) {
  let livePath;
  try {
    livePath = resolveLivePath(candidate.destination, homeRoot);
  } catch {
    return { livePath: null, status: "unsafe-destination", overwriteRisk: "rejected (unsafe path)", ownership: "none" };
  }
  if (!livePath) {
    return { livePath: null, status: "not-home-scoped", overwriteRisk: "project-scoped (not resolved against HOME)", ownership: "none" };
  }
  if (!pathExists(livePath)) {
    return { livePath, status: "absent", overwriteRisk: "no existing file", ownership: "none" };
  }
  const marked = Boolean(marker.entries[candidate.destination]);
  if (!marked || lstatSync(livePath).isSymbolicLink()) {
    return { livePath, status: "user-file", overwriteRisk: "would not overwrite (existing non-marker file skipped)", ownership: "user-file" };
  }
  const current = sha256(readFileSync(livePath));
  if (current === sha256(candidate.content)) {
    return { livePath, status: "already-applied", overwriteRisk: "already applied (no change)", ownership: "marker-owned" };
  }
  return { livePath, status: "marker-outdated", overwriteRisk: "would update kit-owned marker (backup taken)", ownership: "marker-owned" };
}

function recordMarker(marker, candidate, wantHash) {
  marker.entries[candidate.destination] = {
    sha256: wantHash,
    renderedFrom: candidate.source,
    appliedAt: new Date().toISOString(),
  };
}

export function requiredApproval(candidate, live) {
  if (!candidate.appliable) return "n/a (reported only)";
  if (candidate.harness === "claude") {
    return "strict-manual + --approve-claude-apply";
  }
  return "strict-manual";
}

export function markerPath(homeRoot) {
  return path.join(homeRoot, MARKER_DIR, MARKER_FILE);
}

export function loadMarker(homeRoot, generatedBy = "render-nucleus") {
  const file = markerPath(homeRoot);
  if (!existsSync(file)) {
    return { schemaVersion: MARKER_SCHEMA_VERSION, generatedBy, entries: {} };
  }
  const parsed = readJson(file);
  if (!parsed.entries || typeof parsed.entries !== "object") parsed.entries = {};
  return parsed;
}

function serializeMarker(marker, generatedBy = marker.generatedBy ?? "render-nucleus") {
  const entries = {};
  for (const key of Object.keys(marker.entries).sort()) entries[key] = marker.entries[key];
  return `${JSON.stringify({ schemaVersion: MARKER_SCHEMA_VERSION, generatedBy, entries }, null, 2)}\n`;
}

export function saveMarkerIfChanged(homeRoot, marker, generatedBy = marker.generatedBy ?? "render-nucleus") {
  marker.generatedBy = generatedBy;
  const file = markerPath(homeRoot);
  const serialized = serializeMarker(marker, generatedBy);
  if (existsSync(file) && readFileSync(file, "utf8") === serialized) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, serialized);
  return true;
}

export function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/gu, "-");
}

export function applyCandidates(candidates, homeRoot, marker, options = {}) {
  const actions = [];
  const backups = [];
  for (const candidate of candidates) {
    if (!candidate.appliable) continue;
    const livePath = resolveLivePath(candidate.destination, homeRoot);
    if (!livePath) {
      actions.push({ destination: candidate.destination, action: "skipped", reason: "not home-scoped" });
      continue;
    }
    const wantHash = sha256(candidate.content);
    if (!pathExists(livePath)) {
      mkdirSync(path.dirname(livePath), { recursive: true });
      writeFileSync(livePath, candidate.content);
      recordMarker(marker, candidate, wantHash);
      actions.push({ destination: candidate.destination, action: "created", livePath });
      continue;
    }
    const marked = Boolean(marker.entries[candidate.destination]);
    if (!marked || lstatSync(livePath).isSymbolicLink()) {
      actions.push({ destination: candidate.destination, action: "skipped", reason: "exists", livePath });
      continue;
    }
    if (sha256(readFileSync(livePath)) === wantHash) {
      actions.push({ destination: candidate.destination, action: "already-applied", livePath });
      continue;
    }
    const backup = `${livePath}.loom-bak-${backupTimestamp()}`;
    copyFileSync(livePath, backup);
    writeFileSync(livePath, candidate.content);
    recordMarker(marker, candidate, wantHash);
    backups.push(backup);
    actions.push({ destination: candidate.destination, action: "updated", livePath, backup });
  }
  return { actions, backups };
}
