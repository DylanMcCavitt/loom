import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { REPO_ROOT, readJson, repoPath } from "./harness-candidate-model.mjs";

const MARKER_DIR = ".loom-harness";
const MARKER_FILE = "applied-manifest.json";
const MARKER_SCHEMA_VERSION = 1;

const OMP_REPO_OWNED_DESTINATIONS = new Set([
  "~/.omp/agent/AGENTS.md",
  "~/.omp/agent/RULES.md",
  "~/.omp/agent/config.yml",
]);

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

// Join relPath under root, refusing any result that escapes root (path traversal backstop).
export function safeJoin(root, relPath) {
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`refusing to resolve outside ${base}: ${relPath}`);
  }
  return target;
}

// Live HOME path for a home-anchored ("~/...") display destination; null for project-scoped
// or otherwise non-home destinations that cannot be applied against a single HOME.
export function resolveLivePath(displayDestination, homeRoot) {
  if (!displayDestination.startsWith("~/")) return null;
  return safeJoin(homeRoot, displayDestination.slice(2));
}

// --- live inspection (read-only) -------------------------------------------------------------

export function repoMirrorSymlink(candidate, livePath) {
  if (candidate.harness !== "omp" || !candidate.source) return false;
  let stat;
  try {
    stat = lstatSync(livePath);
  } catch {
    return false;
  }
  if (!stat.isSymbolicLink()) return false;
  const linkTarget = readlinkSync(livePath);
  const resolvedTarget = path.resolve(path.dirname(livePath), linkTarget);
  if (resolvedTarget === repoPath(candidate.source)) return true;
  const siblingRepoRelative = path.relative(path.dirname(REPO_ROOT), resolvedTarget).split(path.sep).slice(1).join("/");
  return siblingRepoRelative === candidate.source;
}

export function liveInspect(candidate, homeRoot, marker) {
  let livePath;
  try {
    livePath = resolveLivePath(candidate.destination, homeRoot);
  } catch {
    // Unsafe (traversing/absolute) destination — the preflight reports it; never resolve it live.
    return { livePath: null, status: "unsafe-destination", overwriteRisk: "rejected (unsafe path)", ownership: "none" };
  }
  if (!livePath) {
    return { livePath: null, status: "not-home-scoped", overwriteRisk: "project-scoped (not resolved against HOME)", ownership: "none" };
  }
  if (!pathExists(livePath)) {
    return { livePath, status: "absent", overwriteRisk: "no existing file", ownership: "none" };
  }
  const marked = Boolean(marker.entries[candidate.destination]);
  if (!marked) {
    if (repoMirrorSymlink(candidate, livePath)) {
      return {
        livePath,
        status: "repo-mirror-symlink",
        overwriteRisk: "would not claim or replace without explicit OMP apply gate",
        ownership: "repo-mirror",
      };
    }
    return { livePath, status: "user-file", overwriteRisk: "would not overwrite (existing non-marker file skipped)", ownership: "user-file" };
  }
  if (lstatSync(livePath).isSymbolicLink()) {
    if (!repoMirrorSymlink(candidate, livePath)) {
      return {
        livePath,
        status: "marker-symlink-retargeted",
        overwriteRisk: "would not follow retargeted marker-owned symlink",
        ownership: "marker-owned",
      };
    }
    if (sha256(readFileSync(livePath)) === sha256(candidate.content)) {
      return { livePath, status: "already-applied", overwriteRisk: "already applied (no change)", ownership: "marker-owned" };
    }
    return {
      livePath,
      status: "repo-mirror-content-mismatch",
      overwriteRisk: "would not follow divergent repo-mirror symlink",
      ownership: "marker-owned",
    };
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

export function requiresOmpRepoOwnedApproval(candidate) {
  return candidate.harness === "omp" && OMP_REPO_OWNED_DESTINATIONS.has(candidate.destination);
}

export function requiredApproval(candidate, live) {
  if (!candidate.appliable) return "n/a (reported only)";
  if (
    requiresOmpRepoOwnedApproval(candidate) &&
    (live.ownership === "repo-mirror" || live.ownership === "user-file")
  ) {
    return "strict-manual + --approve-omp-repo-owned";
  }
  return "strict-manual";
}


// --- marker manifest -------------------------------------------------------------------------

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

// --- apply engine (create-missing-only / backup-on-drift / marker idempotency) ---------------

// Pure apply loop shared by --write: creates missing live files, skips existing non-marker user
// files unless the narrow OMP repo-owned approval gate is set, backs up + updates drifted
// kit-owned markers, and records the marker. Mutates `marker.entries`; persisting the marker is
// the caller's job. Returns { actions, backups }.
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
    if (!marked) {
      if (requiresOmpRepoOwnedApproval(candidate)) {
        if (!options.approveOmpRepoOwned) {
          actions.push({ destination: candidate.destination, action: "skipped", reason: "omp-approval-required", livePath });
          continue;
        }
        if (repoMirrorSymlink(candidate, livePath)) {
          if (sha256(readFileSync(livePath)) !== wantHash) {
            actions.push({ destination: candidate.destination, action: "skipped", reason: "repo-mirror-content-mismatch", livePath });
            continue;
          }
          recordMarker(marker, candidate, wantHash);
          actions.push({ destination: candidate.destination, action: "claimed-repo-mirror-symlink", livePath });
          continue;
        }
        if (lstatSync(livePath).isSymbolicLink()) {
          actions.push({ destination: candidate.destination, action: "skipped", reason: "not-repo-mirror-symlink", livePath });
          continue;
        }
        const backup = `${livePath}.loom-bak-${backupTimestamp()}`;
        copyFileSync(livePath, backup);
        writeFileSync(livePath, candidate.content);
        recordMarker(marker, candidate, wantHash);
        backups.push(backup);
        actions.push({ destination: candidate.destination, action: "replaced-existing-omp", livePath, backup });
        continue;
      }
      actions.push({ destination: candidate.destination, action: "skipped", reason: "exists", livePath });
      continue;
    }
    if (lstatSync(livePath).isSymbolicLink()) {
      if (!repoMirrorSymlink(candidate, livePath)) {
        actions.push({ destination: candidate.destination, action: "skipped", reason: "not-repo-mirror-symlink", livePath });
        continue;
      }
      if (sha256(readFileSync(livePath)) !== wantHash) {
        actions.push({ destination: candidate.destination, action: "skipped", reason: "repo-mirror-content-mismatch", livePath });
        continue;
      }
      actions.push({ destination: candidate.destination, action: "already-applied", livePath });
      continue;
    }
    if (sha256(readFileSync(livePath)) === wantHash) {
      actions.push({ destination: candidate.destination, action: "already-applied", livePath });
      continue;
    }
    // Kit-owned marker drifted from the rendered content: back up, then update.
    const backup = `${livePath}.loom-bak-${backupTimestamp()}`;
    copyFileSync(livePath, backup);
    writeFileSync(livePath, candidate.content);
    recordMarker(marker, candidate, wantHash);
    backups.push(backup);
    actions.push({ destination: candidate.destination, action: "updated", livePath, backup });
  }
  return { actions, backups };
}

