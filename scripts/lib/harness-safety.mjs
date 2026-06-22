// Shared safety-scanning primitives for the harness dry-run safety gate
// (scripts/dry-run-harness-safety-gate.mjs) and the render-to-write executor
// (scripts/render-harness-nucleus.mjs).
//
// Both consumers MUST reject the same dangerous destination keys, secret-looking
// values, and absolute private home paths, so the rules live in exactly one place.
// Re-implementing them per consumer would let the gate and the renderer drift.

export const PRIVATE_HOME_PATH_PATTERN = /\/Users\/[^/\s"]+/u;

export const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu,
];

export const DANGEROUS_PATH_RULES = [
  {
    name: "database",
    pattern: /(^|\/)[^/]*\.(?:db|sqlite|sqlite3)(?:$|[-.])/iu,
  },
  {
    name: "database sidecar",
    pattern: /(^|\/)[^/]*(?:-wal|-shm)$/iu,
  },
  {
    name: "session/history state",
    pattern: /(^|\/)(?:sessions?|archived_sessions|session_index\.jsonl|terminal-sessions|terminal_sessions|shell-snapshots|shell_snapshots|projects|todos|history(?:\.jsonl)?)(?:\/|$)/iu,
  },
  {
    name: "blob or attachment state",
    pattern: /(^|\/)(?:blobs?|attachments|generated_images)(?:\/|$)/iu,
  },
  {
    name: "auth/cache state",
    pattern: /(^|\/)(?:auth\.json|cache|plugins\/cache|statsig|\.tmp|browser|computer-use)(?:\/|$)/iu,
  },
  {
    name: "logs or local settings",
    pattern: /(^|\/)(?:logs?|log|settings\.local\.json)(?:\/|$)|\.log$/iu,
  },
  {
    name: "secret or credential file",
    pattern: /(^|\/)(?:\.env(?:\.[^/]*)?|[^/]*\.(?:pem|key)|[^/]*(?:secret|token)[^/]*\.(?:json|ya?ml|toml|env|txt))(?:$|\/)/iu,
    allow: /\.example$/iu,
  },
];

export function textOf(value) {
  return JSON.stringify(value, null, 2);
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizePathText(value) {
  return String(value ?? "")
    .replace(/^repo:/u, "")
    .replaceAll("\\", "/")
    .replace(/\/+/gu, "/");
}

export function isPatternPath(value) {
  return /[*?[{]/u.test(String(value ?? ""));
}

export function globPatternToRegex(pattern) {
  let source = "^";
  for (const char of pattern) {
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
  }
  source += "$";
  return new RegExp(source, "u");
}

export function pathMatchesLocalOnly(value, localOnlyPatterns) {
  if (!isNonEmptyString(value)) return false;
  const normalized = normalizePathText(value);
  return localOnlyPatterns.some((patternValue) => {
    const pattern = normalizePathText(patternValue);
    if (!pattern) return false;
    if (isPatternPath(pattern)) return globPatternToRegex(pattern).test(normalized);
    const withoutTrailingSlash = pattern.replace(/\/$/u, "");
    return normalized === withoutTrailingSlash || normalized.startsWith(`${withoutTrailingSlash}/`);
  });
}

export function secretError(label, value) {
  const text = textOf(value);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) return `${label}: contains API-key/token/secret-looking text`;
  }
  return null;
}

export function dangerousPathReason(value) {
  if (!isNonEmptyString(value)) return null;
  const normalized = normalizePathText(value);
  for (const rule of DANGEROUS_PATH_RULES) {
    if (rule.allow?.test(normalized)) continue;
    if (rule.pattern.test(normalized)) return rule.name;
  }
  return null;
}

export function containsPrivateHomePath(label, value) {
  if (PRIVATE_HOME_PATH_PATTERN.test(textOf(value))) {
    return `${label}: must use home-relative or repo-relative paths instead of absolute private home paths`;
  }
  return null;
}
