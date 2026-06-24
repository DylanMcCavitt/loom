// Check-only radar drift model for Factory Nucleus.
//
// Radar classifies drift between intent (blueprints/ghosts) and reality and
// emits a radar-check artifact: a drift class plus affected ghosts, suggested
// sync actions, a suggested route, and evidence references. V1 is strictly
// check-only: this module is pure (no filesystem, no tracker, no blueprint
// access), so it can neither write the tracker nor rewrite blueprints.
import { validateRadarCheck, withArtifactMetadata } from "./schema.mjs";

// Drift class by severity precedence: unknown > material > low-risk > none.
export function classifyDrift({ material = [], lowRisk = [], unknown = [] } = {}) {
  if (unknown.length > 0) return "unknown";
  if (material.length > 0) return "material";
  if (lowRisk.length > 0) return "low-risk";
  return "none";
}

// Default core-spine route per drift class.
function defaultRoute(driftClass) {
  switch (driftClass) {
    case "none":
      return "rocket-launch";
    case "low-risk":
      return "proof-pass";
    case "material":
      return "roboports";
    default:
      return "inserter";
  }
}

// Build a schema-valid radar-check artifact. Pure: no fs, no tracker, no
// blueprint rewrite. Throws if the result is invalid.
export function buildRadarCheck({ material = [], lowRisk = [], unknown = [], affectedGhosts = [], suggestedSyncActions = [], suggestedRoute, evidence = [], generatedAt } = {}) {
  const driftClass = classifyDrift({ material, lowRisk, unknown });
  const payload = {
    driftClass,
    affectedGhosts: [...affectedGhosts],
    suggestedSyncActions: [...suggestedSyncActions],
    suggestedRoute: suggestedRoute ?? defaultRoute(driftClass),
    evidence: [...evidence],
  };
  const check = withArtifactMetadata("radar-check", payload, generatedAt);
  const result = validateRadarCheck(check);
  if (!result.ok) throw new Error(`invalid radar check: ${result.errors.join("; ")}`);
  return check;
}

const RADAR_USAGE = "Usage: node scripts/factory-nucleus/factory.mjs radar [--material <ids>] [--low-risk <ids>] [--unknown <ids>] [--affected-ghost <id>] [--sync-action <text>] [--route <route>] [--evidence <ref>] [--json]";

// List flags accept a comma-separated value and may repeat; tokens accumulate.
function pushTokens(target, raw) {
  for (const token of String(raw).split(",")) {
    const value = token.trim();
    if (value) target.push(value);
  }
}

// Parse radar CLI args into drift signals. Pure: argv in, plain object out -- no
// fs, no tracker, no blueprint access, preserving radar's check-only purity.
function radarArgs(argv) {
  const options = { material: [], lowRisk: [], unknown: [], affectedGhosts: [], suggestedSyncActions: [], evidence: [] };
  const listFlags = {
    "--material": "material",
    "--low-risk": "lowRisk",
    "--unknown": "unknown",
    "--affected-ghost": "affectedGhosts",
    "--sync-action": "suggestedSyncActions",
    "--evidence": "evidence",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const next = argv[index + 1];
    if (arg === "--route") {
      if (next === undefined || next.startsWith("--")) throw new Error("--route requires a value");
      options.suggestedRoute = next;
      index += 1;
      continue;
    }
    const listKey = listFlags[arg];
    if (!listKey) throw new Error(`Unknown option: ${arg}`);
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    pushTokens(options[listKey], next);
    index += 1;
  }
  return options;
}

// Readable check-only summary of a radar-check artifact. Pure string builder.
// Radar inputs are operator-supplied CLI args (not scanned/external content),
// so no secret redaction is applied here.
function renderRadarSummary(check) {
  const list = (values) => (values.length ? values.join(", ") : "none");
  return [
    "Factory radar check",
    "Mode: check-only (no tracker writes; no blueprint rewrites)",
    `Drift class: ${check.driftClass}`,
    `Affected ghosts: ${list(check.affectedGhosts)}`,
    `Suggested sync actions: ${list(check.suggestedSyncActions)}`,
    `Suggested route: ${check.suggestedRoute}`,
    `Evidence: ${list(check.evidence)}`,
    "Remote APIs: none",
    "",
  ].join("\n");
}

export function radarMain(argv = process.argv.slice(2)) {
  const options = radarArgs(argv);
  if (options.help) {
    process.stdout.write(`${RADAR_USAGE}\n`);
    return 0;
  }
  const check = buildRadarCheck({
    material: options.material,
    lowRisk: options.lowRisk,
    unknown: options.unknown,
    affectedGhosts: options.affectedGhosts,
    suggestedSyncActions: options.suggestedSyncActions,
    suggestedRoute: options.suggestedRoute,
    evidence: options.evidence,
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(check, null, 2)}\n`);
    return 0;
  }
  process.stdout.write(renderRadarSummary(check));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = radarMain();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
