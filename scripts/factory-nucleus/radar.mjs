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
