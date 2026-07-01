#!/usr/bin/env node
// Transitional command-compatibility wrapper for the nucleus renderer. The
// implementation lives in scripts/render-nucleus.mjs and scripts/lib/* seams;
// this file is not a second renderer implementation.

export { main, readArgs } from "./render-nucleus.mjs";
export {
  buildCandidates,
  DEFAULT_RENDER_NUCLEUS_OPTIONS,
  localOnlyPatterns,
  readJson,
  repoPath,
  resolveDisposition,
} from "./lib/harness-candidate-model.mjs";
export {
  applyCandidates,
  backupTimestamp,
  loadMarker,
  markerPath,
  pathExists,
  resolveHomeRoot,
  resolveLivePath,
  safeJoin,
  saveMarkerIfChanged,
  sha256,
} from "./lib/harness-apply-engine.mjs";
export {
  configKeys,
  configKindFor,
  FORBIDDEN_GLOBAL_KEYS,
  gateRenderedOutput,
  keyMatchesForbidden,
  markdownFrontmatter,
  preflightFindings,
  renderAndGate,
  renderToTemp,
} from "./lib/harness-render-gate.mjs";
export {
  buildHarnessManifest,
  HARNESS_APPROVAL_POLICY,
  printHarnessTextManifest,
  reportFailure,
} from "./lib/harness-reporting.mjs";

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { main } = await import("./render-nucleus.mjs");
    process.exitCode = main(process.argv.slice(2), "render-harness-nucleus");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
