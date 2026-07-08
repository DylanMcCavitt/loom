// Shared safety-scanning primitives for harness validators.

import { existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

export const PRIVATE_HOME_PATH_PATTERN = /\/Users\/[^/\s"]+/u;

export const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
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

export const MANIFEST_DISPOSITIONS = new Set(["track", "adapt", "reference-only", "local-only"]);
export const MANIFEST_SOURCE_HARNESSES = new Set(["omp", "codex", "claude", "cross-harness"]);
export const MANIFEST_REQUIRED_FIELDS = [
  "id",
  "sourceHarness",
  "resourceCategory",
  "currentLivePath",
  "discoverySource",
  "intendedRepoTarget",
  "disposition",
  "migrationNotes",
];

export const MANIFEST_REQUIRED_COVERAGE = [
  {
    name: "OMP built-ins",
    match: (resource) => resource.sourceHarness === "omp" && /built-ins/u.test(resource.resourceCategory),
  },
  {
    name: "OMP user/project resources",
    match: (resource) => resource.sourceHarness === "omp" && /user\/project resources/u.test(resource.resourceCategory),
  },
  {
    name: "Codex config",
    match: (resource) => resource.sourceHarness === "codex" && /config/u.test(resource.resourceCategory),
  },
  {
    name: "Codex agents/skills",
    match: (resource) => resource.sourceHarness === "codex" && /agents and skills/u.test(resource.resourceCategory),
  },
  {
    name: "Claude agents/skills/settings",
    match: (resource) => resource.sourceHarness === "claude" && /agents, skills, and settings/u.test(resource.resourceCategory),
  },
  {
    name: "duplicate skill roots",
    match: (resource) => resource.sourceHarness === "cross-harness" && /duplicate skill roots/u.test(resource.resourceCategory),
  },
];

export const MANIFEST_REQUIRED_LOCAL_ONLY_TERMS = [
  "sessions",
  "database",
  "blobs",
  "terminal",
  "auth",
  "cache",
  "plugin cache",
  "private history",
];

export function textOf(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
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
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }
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

export function scanHarnessSafety(label, value, options = {}) {
  const findings = [];
  const secret = secretError(label, value);
  if (secret) findings.push(secret);
  const privatePath = options.privateHome === false ? null : containsPrivateHomePath(label, value);
  if (privatePath) findings.push(privatePath);

  const text = textOf(value);
  const dangerousCredentialPath = text.match(/~\/\.(?:codex|claude|omp)\/auth\.json\b/u);
  if (dangerousCredentialPath && (secret || /PRIVATE KEY/u.test(text))) {
    findings.push(`${label}: contains dangerous private credential path ${dangerousCredentialPath[0]} (auth/cache state)`);
  }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text)) {
    findings.push(`${label}: contains private key credential material`);
  }
  return [...new Set(findings)];
}

function hasLivePathOrDiscovery(resource) {
  return asArray(resource.currentLivePath).some(isNonEmptyString) || isNonEmptyString(resource.discoverySource);
}

function containsRuntimeMarker(resource) {
  const text = textOf(resource).toLowerCase();
  return /\b(sessions?|database|db|sqlite|blobs?|terminal|auth|cache|plugin cache|history|logs?|local settings|settings\.local)\b/u.test(text);
}

function resolveDisplayPath(value) {
  if (!isNonEmptyString(value)) return null;
  if (value.startsWith("repo:")) return path.resolve(value.slice("repo:".length));
  if (value.startsWith("~/")) return path.join(homedir(), value.slice(2));
  if (path.isAbsolute(value)) return value;
  return path.resolve(value);
}

export function validateHarnessManifest(manifest) {
  const errors = [];
  const warnings = [];
  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
  const byId = new Map();
  const localOnlyPatterns = [];
  const livePathOwners = new Map();

  if (manifest.schemaVersion !== 1) errors.push("manifest: schemaVersion must be 1");
  if (!Array.isArray(manifest.allowedDispositions)) {
    errors.push("manifest: allowedDispositions must be an array");
  } else {
    for (const disposition of manifest.allowedDispositions) {
      if (!MANIFEST_DISPOSITIONS.has(disposition)) errors.push(`manifest: unknown allowed disposition ${disposition}`);
    }
    for (const disposition of MANIFEST_DISPOSITIONS) {
      if (!manifest.allowedDispositions.includes(disposition)) {
        errors.push(`manifest: allowedDispositions missing ${disposition}`);
      }
    }
  }
  if (!Array.isArray(manifest.resources)) errors.push("manifest: resources must be an array");

  errors.push(...scanHarnessSafety("manifest", manifest));

  for (const [index, resource] of resources.entries()) {
    const label = resource?.id || `resources[${index}]`;
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    for (const field of MANIFEST_REQUIRED_FIELDS) {
      if (!(field in resource)) errors.push(`${label}: missing required field ${field}`);
    }
    if (!isNonEmptyString(resource.id)) {
      errors.push(`${label}: id must be a non-empty string`);
    } else if (byId.has(resource.id)) {
      errors.push(`${label}: duplicate resource id`);
    } else {
      byId.set(resource.id, resource);
    }
    if (!MANIFEST_SOURCE_HARNESSES.has(resource.sourceHarness)) {
      errors.push(`${label}: sourceHarness must be one of ${[...MANIFEST_SOURCE_HARNESSES].join(", ")}`);
    }
    if (!MANIFEST_DISPOSITIONS.has(resource.disposition)) {
      errors.push(`${label}: disposition must be one of ${[...MANIFEST_DISPOSITIONS].join(", ")}`);
    }
    if (!isNonEmptyString(resource.resourceCategory)) {
      errors.push(`${label}: resourceCategory must be a non-empty string`);
    }
    if (!hasLivePathOrDiscovery(resource)) {
      errors.push(`${label}: must provide currentLivePath or discoverySource`);
    }
    if (!isNonEmptyString(resource.intendedRepoTarget)) {
      errors.push(`${label}: intendedRepoTarget must be a non-empty string`);
    }
    if (!isNonEmptyString(resource.migrationNotes)) {
      errors.push(`${label}: migrationNotes must be a non-empty string`);
    }
    if (resource.disposition === "local-only" && resource.intendedRepoTarget !== "none") {
      errors.push(`${label}: local-only resources must use intendedRepoTarget \"none\"`);
    }
    if (containsRuntimeMarker(resource) && resource.disposition !== "local-only") {
      const runtimeText = `${resource.resourceCategory} ${asArray(resource.currentLivePath).join(" ")}`.toLowerCase();
      if (/\b(sessions?|database|db|sqlite|blobs?|terminal|auth|cache|plugin cache|history|logs?|settings\.local)\b/u.test(runtimeText)) {
        errors.push(`${label}: runtime-only paths must be local-only`);
      }
    }
    for (const livePath of asArray(resource.currentLivePath)) {
      if (!isNonEmptyString(livePath)) {
        errors.push(`${label}: currentLivePath entries must be non-empty strings`);
        continue;
      }
      const dangerous = dangerousPathReason(livePath);
      if (dangerous && resource.disposition !== "local-only") {
        errors.push(`${label}: dangerous runtime path ${livePath} must be local-only (${dangerous})`);
      }
      if (resource.disposition === "local-only") localOnlyPatterns.push(livePath);
      const owner = livePathOwners.get(livePath);
      if (owner && owner !== label) {
        warnings.push(`duplicate live path ${livePath} appears in ${owner} and ${label}`);
      } else {
        livePathOwners.set(livePath, label);
      }
      if (livePath.startsWith("repo:") && !isPatternPath(livePath) && !existsSync(resolveDisplayPath(livePath))) {
        errors.push(`${label}: repo currentLivePath does not exist: ${livePath}`);
      }
    }
  }

  for (const coverage of MANIFEST_REQUIRED_COVERAGE) {
    if (!resources.some(coverage.match)) errors.push(`missing required coverage: ${coverage.name}`);
  }

  const localOnlyText = resources
    .filter((resource) => resource.disposition === "local-only")
    .map((resource) => textOf(resource).toLowerCase())
    .join("\n");
  for (const term of MANIFEST_REQUIRED_LOCAL_ONLY_TERMS) {
    if (!localOnlyText.includes(term)) errors.push(`missing local-only runtime coverage for ${term}`);
  }

  return { errors: [...new Set(errors)], warnings, resources, byId, localOnlyPatterns };
}
