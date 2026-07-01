#!/usr/bin/env node
// Top-level nucleus renderer orchestration. The explicit render path is:
// canonical nucleus source + Codex adapter plan -> adapter transforms -> rendered
// distribution candidates -> safety gate -> optional live apply.

import path from "node:path";
import {
  buildCandidates,
  DEFAULT_RENDER_NUCLEUS_OPTIONS,
  readJson,
  repoPath,
} from "./lib/harness-candidate-model.mjs";
import {
  applyCandidates,
  loadMarker,
  markerPath,
  resolveHomeRoot,
  saveMarkerIfChanged,
} from "./lib/harness-apply-engine.mjs";
import { renderAndGate } from "./lib/harness-render-gate.mjs";
import {
  buildHarnessManifest,
  HARNESS_APPROVAL_POLICY,
  printHarnessTextManifest,
  reportFailure,
} from "./lib/harness-reporting.mjs";

const USAGE = [
  "Usage: node scripts/render-nucleus.mjs [options]",
  "  --write                    apply appliable candidates (strict-manual, create-missing-only)",
  "  --approve-omp-repo-owned   with --write, explicitly claim repo-mirror OMP symlinks or replace existing OMP files",
  "  --json                     emit a machine-readable manifest instead of text",
  "  --home <dir>               resolve ~ live destinations under <dir> (default: $HOME)",
  "  --plan <path>              Codex adapter plan json",
  "  --claude-plan <path>       Claude adapter plan json",
  "  --manifest <path>          resource manifest json",
  "  --template-dir <path>      codex template directory",
  "  --omp-source <path>        decided OMP source directory",
  "  -h, --help                 show this help",
].join("\n");

export function readArgs(argv) {
  const options = {
    write: false,
    json: false,
    approveOmpRepoOwned: false,
    home: null,
    ...DEFAULT_RENDER_NUCLEUS_OPTIONS,
  };
  const valueFlags = new Map([
    ["--home", "home"],
    ["--plan", "plan"],
    ["--claude-plan", "claudePlan"],
    ["--manifest", "manifest"],
    ["--template-dir", "templateDir"],
    ["--omp-source", "ompSource"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--approve-omp-repo-owned") {
      options.approveOmpRepoOwned = true;
      continue;
    }
    const key = valueFlags.get(arg);
    if (!key) throw new Error(`Unknown option: ${arg}`);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    options[key] = next;
    index += 1;
  }
  return options;
}

function runDryRun(candidates, localOnly, options, homeRoot, marker) {
  const findings = renderAndGate(candidates, localOnly);
  const manifest = buildHarnessManifest(candidates, localOnly, homeRoot, marker, "dry-run");
  if (options.json) {
    console.log(JSON.stringify({ ...manifest, result: findings.length === 0 ? "pass" : "fail", findings }, null, 2));
  } else {
    console.log(printHarnessTextManifest(manifest, findings));
  }
  return findings.length === 0 ? 0 : 1;
}

function runWrite(candidates, localOnly, options, homeRoot, marker, generatedBy) {
  const findings = renderAndGate(candidates, localOnly);
  if (findings.length > 0) {
    reportFailure(options, "write", findings, { refused: true });
    return 1;
  }

  const { actions, backups } = applyCandidates(candidates, homeRoot, marker, options);
  const markerChanged = saveMarkerIfChanged(homeRoot, marker, generatedBy);

  if (options.json) {
    console.log(
      JSON.stringify(
        { mode: "write", result: "pass", approvalPolicy: "strict-manual", actions, backups, markerManifest: markerPath(homeRoot), markerChanged },
        null,
        2,
      ),
    );
  } else {
    const lines = ["Harness nucleus renderer", "Mode: write", `Approval policy: ${HARNESS_APPROVAL_POLICY}`, "", "[write actions]"];
    for (const action of actions) {
      const suffix = action.backup ? ` (backup ${path.basename(action.backup)})` : action.reason ? ` (${action.reason})` : "";
      lines.push(`- ${action.action}: ${action.destination}${suffix}`);
    }
    lines.push("");
    lines.push("[backups]");
    if (backups.length === 0) lines.push("- none");
    for (const backup of backups) lines.push(`- ${backup}`);
    lines.push("");
    lines.push(`Marker manifest: ${markerPath(homeRoot)}${markerChanged ? "" : " (unchanged)"}`);
    lines.push("Result: passed");
    console.log(lines.join("\n"));
  }
  return 0;
}

export function main(argv = process.argv.slice(2), generatedBy = "render-nucleus") {
  const options = readArgs(argv);
  const plan = readJson(repoPath(options.plan));
  const claudePlan = readJson(repoPath(options.claudePlan));
  const manifest = readJson(repoPath(options.manifest));
  const homeRoot = resolveHomeRoot(options);
  const marker = loadMarker(homeRoot, generatedBy);
  const { candidates, localOnly } = buildCandidates(plan, manifest, options, claudePlan);
  return options.write
    ? runWrite(candidates, localOnly, options, homeRoot, marker, generatedBy)
    : runDryRun(candidates, localOnly, options, homeRoot, marker);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 2;
  }
}
