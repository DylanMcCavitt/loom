import { liveInspect, requiredApproval } from "./harness-apply-engine.mjs";

export const HARNESS_APPROVAL_POLICY =
  "strict-manual (separate issue/PR, dry-run rendered diff, dangerous-key validation, live-file backup, explicit human approval before any write)";

// --- reporting -------------------------------------------------------------------------------

function ownershipBucket(entry) {
  if (entry.ownership === "marker-owned") return "marker-owned";
  if (entry.ownership === "repo-mirror") return "repo-mirror-symlink";
  if (entry.ownership === "user-file") return "existing-user-file";
  if (entry.liveStatus === "absent") return "missing";
  return entry.liveStatus;
}

function nextOwner(entry) {
  if (entry.ownership === "marker-owned") return "marker-manifest";
  if (entry.ownership === "repo-mirror" || entry.ownership === "user-file") return "explicit-omp-apply-gate";
  if (entry.liveStatus === "absent" && entry.appliable) return "render-harness-nucleus";
  return "none";
}

function ompOwnershipMatrix(reported, localOnly) {
  const rows = reported
    .filter((entry) => entry.harness === "omp")
    .map((entry) => ({
      destination: entry.destination,
      observedLiveState: entry.liveStatus,
      bucket: ownershipBucket(entry),
      nextOwner: nextOwner(entry),
    }));
  for (const destination of localOnly.filter((pattern) => pattern.startsWith("~/.omp/agent/"))) {
    rows.push({
      destination,
      observedLiveState: "skipped-local-only",
      bucket: destination.includes("config.local") || destination.includes("*.local") ? "local-only-config" : "local-only-runtime",
      nextOwner: "operator-local",
    });
  }
  return rows;
}

export function buildHarnessManifest(candidates, localOnly, homeRoot, marker, mode) {
  const reported = [];
  for (const candidate of candidates) {
    const live = liveInspect(candidate, homeRoot, marker);
    reported.push({
      id: candidate.id,
      harness: candidate.harness,
      source: candidate.source,
      destination: candidate.destination,
      disposition: candidate.disposition,
      operation: candidate.operation,
      appliable: candidate.appliable,
      liveStatus: live.status,
      ownership: live.ownership,
      overwriteRisk: live.overwriteRisk,
      requiredApproval: requiredApproval(candidate, live),
    });
  }
  const ownershipMatrix = ompOwnershipMatrix(reported, localOnly);
  return {
    mode,
    approvalPolicy: "strict-manual",
    renderedFiles: candidates.length,
    candidates: reported,
    ownershipMatrix,
    skippedLocalOnly: localOnly,
    counts: {
      rendered: candidates.length,
      appliable: reported.filter((entry) => entry.appliable).length,
      reported: reported.filter((entry) => !entry.appliable).length,
    },
  };
}

export function printHarnessTextManifest(manifest, findings) {
  const lines = [];
  lines.push("Harness nucleus renderer");
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Approval policy: ${HARNESS_APPROVAL_POLICY}`);
  lines.push(`Rendered files: ${manifest.renderedFiles} (temp only; no live path written in dry-run)`);
  lines.push("");
  lines.push("[appliable candidates] (disposition track/adapt; eligible for --write create-missing-only)");
  for (const entry of manifest.candidates.filter((candidate) => candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  harness: ${entry.harness}`);
    lines.push(`  source: ${entry.source}`);
    lines.push(`  disposition: ${entry.disposition}`);
    lines.push(`  operation: ${entry.operation}`);
    lines.push(`  applied: ${manifest.mode === "dry-run" ? "not-applied (dry-run)" : entry.liveStatus}`);
    lines.push(`  liveStatus: ${entry.liveStatus}`);
    lines.push(`  ownership: ${entry.ownership}`);
    lines.push(`  overwriteRisk: ${entry.overwriteRisk}`);
    lines.push(`  requiredApproval: ${entry.requiredApproval}`);
  }
  lines.push("");
  lines.push("[reported candidates] (reference-only/local-only; rendered + validated, never written)");
  for (const entry of manifest.candidates.filter((candidate) => !candidate.appliable)) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  harness: ${entry.harness}`);
    lines.push(`  disposition: ${entry.disposition}`);
    lines.push(`  operation: ${entry.operation}`);
    lines.push(`  liveStatus: ${entry.liveStatus}`);
    lines.push(`  ownership: ${entry.ownership}`);
  }
  lines.push("");
  lines.push("[OMP ownership matrix] (destination -> observed live state / bucket / next owner)");
  for (const entry of manifest.ownershipMatrix) {
    lines.push(`- ${entry.destination}`);
    lines.push(`  observedLiveState: ${entry.observedLiveState}`);
    lines.push(`  bucket: ${entry.bucket}`);
    lines.push(`  nextOwner: ${entry.nextOwner}`);
  }
  lines.push("");
  lines.push("[skipped local-only surfaces] (never rendered as write targets)");
  for (const pattern of manifest.skippedLocalOnly) lines.push(`- ${pattern}`);
  lines.push("");
  if (findings.length > 0) {
    lines.push("[safety findings]");
    for (const finding of findings) lines.push(`- ${finding}`);
    lines.push("");
    lines.push("Result: failed");
  } else {
    lines.push("Result: passed");
  }
  return lines.join("\n");
}

export function reportFailure(options, mode, findings, extra = {}) {
  if (options.json) {
    console.log(JSON.stringify({ mode, result: "fail", findings, ...extra }, null, 2));
  } else {
    console.error(`${mode === "write" ? "Refusing to write: dry-run safety gate failed" : "Render failed"}:`);
    for (const finding of findings) console.error(`- ${finding}`);
  }
}

