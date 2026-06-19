#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const USAGE = "Usage: node scripts/validate-harness-manifest.mjs [--manifest <path>]";
const DEFAULT_MANIFEST = "docs/harness/resource-manifest.json";
const DISPOSITIONS = new Set(["track", "adapt", "reference-only", "local-only"]);
const SOURCE_HARNESSES = new Set(["omp", "codex", "claude", "cross-harness"]);
const REQUIRED_FIELDS = [
  "id",
  "sourceHarness",
  "resourceCategory",
  "currentLivePath",
  "discoverySource",
  "intendedRepoTarget",
  "disposition",
  "migrationNotes"
];

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu
];

const REQUIRED_COVERAGE = [
  {
    name: "OMP built-ins",
    match: (resource) => resource.sourceHarness === "omp" && /built-ins/u.test(resource.resourceCategory)
  },
  {
    name: "OMP user/project resources",
    match: (resource) => resource.sourceHarness === "omp" && /user\/project resources/u.test(resource.resourceCategory)
  },
  {
    name: "Codex config",
    match: (resource) => resource.sourceHarness === "codex" && /config/u.test(resource.resourceCategory)
  },
  {
    name: "Codex agents/skills",
    match: (resource) => resource.sourceHarness === "codex" && /agents and skills/u.test(resource.resourceCategory)
  },
  {
    name: "Claude agents/skills/settings",
    match: (resource) => resource.sourceHarness === "claude" && /agents, skills, and settings/u.test(resource.resourceCategory)
  },
  {
    name: "duplicate skill roots",
    match: (resource) => resource.sourceHarness === "cross-harness" && /duplicate skill roots/u.test(resource.resourceCategory)
  }
];

const REQUIRED_LOCAL_ONLY_TERMS = [
  "sessions",
  "database",
  "blobs",
  "terminal",
  "auth",
  "cache",
  "plugin cache",
  "private history"
];

function readArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg !== "--manifest") {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error("--manifest requires a value");
    }
    options.manifest = next;
    index += 1;
  }
  return options;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.length) return [value];
  return [];
}

function textOf(value) {
  return JSON.stringify(value, null, 2);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasLivePathOrDiscovery(resource) {
  return asArray(resource.currentLivePath).some(isNonEmptyString) || isNonEmptyString(resource.discoverySource);
}

function containsRuntimeMarker(resource) {
  const text = textOf(resource).toLowerCase();
  return /\b(sessions?|database|db|sqlite|blobs?|terminal|auth|cache|plugin cache|history|logs?|local settings|settings\.local)\b/u.test(text);
}

function validateManifest(manifest) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(manifest.allowedDispositions)) errors.push("allowedDispositions must be an array");
  if (!Array.isArray(manifest.resources)) errors.push("resources must be an array");

  const manifestText = textOf(manifest);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(manifestText)) {
      errors.push("manifest contains API-key/token-looking text");
      break;
    }
  }
  if (/\/Users\/[^/\s"]+/u.test(manifestText)) {
    errors.push("manifest must use home-relative paths instead of absolute private home paths");
  }

  const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
  const seenIds = new Set();
  for (const [index, resource] of resources.entries()) {
    const label = resource?.id || `resources[${index}]`;
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
      errors.push(`${label}: must be an object`);
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!(field in resource)) errors.push(`${label}: missing required field ${field}`);
    }
    if (!isNonEmptyString(resource.id)) {
      errors.push(`${label}: id must be a non-empty string`);
    } else if (seenIds.has(resource.id)) {
      errors.push(`${label}: duplicate resource id`);
    } else {
      seenIds.add(resource.id);
    }
    if (!SOURCE_HARNESSES.has(resource.sourceHarness)) {
      errors.push(`${label}: sourceHarness must be one of ${[...SOURCE_HARNESSES].join(", ")}`);
    }
    if (!isNonEmptyString(resource.resourceCategory)) {
      errors.push(`${label}: resourceCategory must be a non-empty string`);
    }
    if (!hasLivePathOrDiscovery(resource)) {
      errors.push(`${label}: must provide currentLivePath or discoverySource`);
    }
    for (const livePath of asArray(resource.currentLivePath)) {
      if (!isNonEmptyString(livePath)) errors.push(`${label}: currentLivePath entries must be non-empty strings`);
      if (livePath.startsWith("repo:") && !existsSync(path.resolve(livePath.slice("repo:".length)))) {
        errors.push(`${label}: repo currentLivePath does not exist: ${livePath}`);
      }
    }
    if (!isNonEmptyString(resource.intendedRepoTarget)) {
      errors.push(`${label}: intendedRepoTarget must be a non-empty string`);
    }
    if (!DISPOSITIONS.has(resource.disposition)) {
      errors.push(`${label}: disposition must be one of ${[...DISPOSITIONS].join(", ")}`);
    }
    if (!isNonEmptyString(resource.migrationNotes)) {
      errors.push(`${label}: migrationNotes must be a non-empty string`);
    }
    if (containsRuntimeMarker(resource) && resource.disposition !== "local-only") {
      const runtimeText = `${resource.resourceCategory} ${asArray(resource.currentLivePath).join(" ")}`.toLowerCase();
      if (/\b(sessions?|database|db|sqlite|blobs?|terminal|auth|cache|plugin cache|history|logs?|settings\.local)\b/u.test(runtimeText)) {
        errors.push(`${label}: runtime-only paths must be local-only`);
      }
    }
    if (/panel|side-panel|prototype/u.test(textOf(resource).toLowerCase())) {
      errors.push(`${label}: panel/prototype surfaces belong in excludedSurfaces, not resources`);
    }
  }

  for (const coverage of REQUIRED_COVERAGE) {
    if (!resources.some(coverage.match)) errors.push(`missing required coverage: ${coverage.name}`);
  }

  const localOnlyText = resources
    .filter((resource) => resource.disposition === "local-only")
    .map((resource) => textOf(resource).toLowerCase())
    .join("\n");
  for (const term of REQUIRED_LOCAL_ONLY_TERMS) {
    if (!localOnlyText.includes(term)) errors.push(`missing local-only runtime coverage for ${term}`);
  }

  const exclusions = Array.isArray(manifest.excludedSurfaces) ? manifest.excludedSurfaces : [];
  const panelExclusion = exclusions.find((surface) => /panel|side-panel|prototype/u.test(textOf(surface).toLowerCase()));
  if (!panelExclusion) {
    errors.push("missing explicit panel/prototype exclusion");
  }

  return errors;
}

try {
  const options = readArgs(process.argv.slice(2));
  const manifestPath = path.resolve(options.manifest);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const errors = validateManifest(manifest);
  if (errors.length) {
    console.error("Harness manifest validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Harness manifest validation passed: ${manifest.resources.length} resources checked in ${options.manifest}`);
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
