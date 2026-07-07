#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const RETRO_PACKET_SCHEMA_VERSION = 1;
export const RETRO_PACKET_KINDS = Object.freeze([
  "decision-log",
  "exemplar-candidate",
  "rule-candidate",
  "coverage-gap-candidate",
]);

const DEFAULT_REQUIRED = Object.freeze([
  "schemaVersion",
  "kind",
  "status",
  "sourcePr",
  "scope",
  "rationale",
  "evidence",
  "targetFile",
  "checks",
  "humanReview",
]);

const KIND_REQUIRED = Object.freeze({
  "decision-log": Object.freeze(["approver", "exceptions"]),
  "exemplar-candidate": Object.freeze(["candidate"]),
  "rule-candidate": Object.freeze(["candidate"]),
  "coverage-gap-candidate": Object.freeze(["candidate"]),
});

const GH_PR_FIELDS = [
  "number",
  "title",
  "body",
  "labels",
  "files",
  "mergedAt",
  "author",
  "url",
  "baseRefName",
  "headRefName",
].join(",");

function repoRootFromModule() {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

function maybeRun(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug || "retro";
}

function normalizeLabels(labels = []) {
  return labels.map((label) => label.name ?? label).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function normalizeFiles(files = []) {
  return files.map((file) => ({
    path: file.path,
    additions: Number(file.additions ?? 0),
    deletions: Number(file.deletions ?? 0),
    changeType: file.changeType ?? "MODIFIED",
  })).sort((left, right) => left.path.localeCompare(right.path));
}

export function summarizeDiff(files = []) {
  const normalized = normalizeFiles(files);
  const totals = normalized.reduce((acc, file) => {
    acc.additions += file.additions;
    acc.deletions += file.deletions;
    acc.changeTypes[file.changeType] = (acc.changeTypes[file.changeType] ?? 0) + 1;
    const top = file.path.split("/")[0] ?? file.path;
    acc.topLevel[top] = (acc.topLevel[top] ?? 0) + 1;
    return acc;
  }, { additions: 0, deletions: 0, changeTypes: {}, topLevel: {} });
  return {
    filesChanged: normalized.length,
    additions: totals.additions,
    deletions: totals.deletions,
    changeTypes: Object.fromEntries(Object.entries(totals.changeTypes).sort(([a], [b]) => a.localeCompare(b))),
    topLevel: Object.fromEntries(Object.entries(totals.topLevel).sort(([a], [b]) => a.localeCompare(b))),
    notablePaths: normalized.slice(0, 12).map((file) => file.path),
  };
}

function inferScope(pr, diffSummary) {
  const paths = diffSummary.notablePaths.join(" ");
  if (/skills\/rocket-launch/u.test(paths)) return "rocket-launch";
  if (/skills\/roboports/u.test(paths)) return "roboports";
  if (/skills\/blueprint/u.test(paths) || /docs\/decisions/u.test(paths)) return "blueprint";
  if (/docs\/archive|handoff|resume/u.test(paths) || /archive|history/u.test(pr.title)) return "belt";
  if (/test|proof|validate/u.test(paths)) return "lab";
  return "shared-nucleus";
}

function evidenceFor(pr, diffSummary) {
  const lines = [
    `PR #${pr.number}: ${pr.title}`,
    pr.url,
    `mergedAt: ${pr.mergedAt}`,
    `labels: ${normalizeLabels(pr.labels).join(", ") || "none"}`,
    `diff: ${diffSummary.filesChanged} files, +${diffSummary.additions}/-${diffSummary.deletions}`,
  ];
  for (const file of diffSummary.notablePaths.slice(0, 6)) lines.push(`file: ${file}`);
  return lines;
}

function sourcePr(pr, diffSummary) {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    mergedAt: pr.mergedAt,
    author: pr.author?.login ?? "unknown",
    labels: normalizeLabels(pr.labels),
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    diffSummary,
  };
}

function commonEntry({ kind, pr, scope, targetFile, diffSummary, rationale, candidate }) {
  const entry = {
    schemaVersion: RETRO_PACKET_SCHEMA_VERSION,
    kind,
    status: "pending-human-review",
    sourcePr: sourcePr(pr, diffSummary),
    scope,
    rationale,
    evidence: evidenceFor(pr, diffSummary),
    targetFile,
    checks: [`node scripts/retro-packet.mjs --pr ${pr.number}`],
    humanReview: "review the generated retro PR; accept, redirect, defer, or reject this packet before changing accepted guidance",
  };
  if (candidate) entry.candidate = candidate;
  if (kind === "decision-log") {
    entry.approver = "pending-human-review";
    entry.exceptions = "none identified by deterministic extraction";
  }
  return entry;
}

export function buildRetroPacket(pr, options = {}) {
  if (!pr || !Number.isInteger(Number(pr.number))) throw new Error("PR metadata must include a number");
  if (!pr.mergedAt) throw new Error(`PR #${pr.number} is not merged; retro write-back only accepts merged PRs`);
  const diffSummary = summarizeDiff(pr.files ?? []);
  const scope = options.scope ?? inferScope(pr, diffSummary);
  const home = `retro/pr-${pr.number}`;
  const title = String(pr.title ?? `PR #${pr.number}`);
  const labels = normalizeLabels(pr.labels);
  const bodySummary = String(pr.body ?? "").split("\n").filter((line) => /^[-*] |^## /u.test(line.trim())).slice(0, 8);

  const entries = [
    commonEntry({
      kind: "decision-log",
      pr,
      scope,
      targetFile: `${home}/decision-log.json`,
      diffSummary,
      rationale: `Record the launch-retro evidence packet for ${title}; human review decides whether any candidate becomes accepted guidance.`,
    }),
    commonEntry({
      kind: "exemplar-candidate",
      pr,
      scope,
      targetFile: `${home}/candidate-exemplar.json`,
      diffSummary,
      rationale: "Preserve a concrete merged-PR pattern as a pending exemplar candidate without editing accepted exemplars directly.",
      candidate: {
        title: `Merged PR exemplar: ${title}`,
        summary: bodySummary.length > 0 ? bodySummary : [`Changed ${diffSummary.filesChanged} files with +${diffSummary.additions}/-${diffSummary.deletions}.`],
        suggestedDestination: `skills/${scope}/exemplars/pr-${pr.number}.md`,
      },
    }),
    commonEntry({
      kind: "rule-candidate",
      pr,
      scope,
      targetFile: `${home}/candidate-rule.json`,
      diffSummary,
      rationale: "Extract a deterministic rule-shaped candidate from labels, title, and changed surfaces for human review.",
      candidate: {
        id: `rule/pr-${pr.number}-${slugify(title)}`,
        title: `Rule candidate from PR #${pr.number}`,
        rule: `When work matches ${labels.join(", ") || "the changed surfaces"}, consider the PR #${pr.number} pattern before inventing a new workflow.`,
        suggestedDestination: `skills/${scope}/references/rules.md`,
      },
    }),
    commonEntry({
      kind: "coverage-gap-candidate",
      pr,
      scope,
      targetFile: `${home}/candidate-coverage-gap.json`,
      diffSummary,
      rationale: "Flag any changed surface without an obvious accepted rule destination as a pending coverage-gap candidate.",
      candidate: {
        title: `Coverage gap candidate from PR #${pr.number}`,
        gap: `Review whether ${diffSummary.notablePaths.slice(0, 4).join(", ") || "the changed files"} revealed missing guidance for ${scope}.`,
        suggestedDestination: `skills/${scope}/references/coverage-gaps.md`,
      },
    }),
  ];

  return {
    schemaVersion: RETRO_PACKET_SCHEMA_VERSION,
    generatedBy: "scripts/retro-packet.mjs",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    home,
    branch: options.branch ?? `retro/pr-${pr.number}-${slugify(title)}`,
    entries,
  };
}

function missingFields(entry) {
  const required = [...DEFAULT_REQUIRED, ...(KIND_REQUIRED[entry.kind] ?? [])];
  return required.filter((field) => !Object.hasOwn(entry, field));
}

export function validateEvidenceIntakeEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, errors: ["entry must be an object"] };
  }
  if (!RETRO_PACKET_KINDS.includes(entry.kind)) errors.push(`unknown kind: ${entry.kind ?? "missing"}`);
  if (entry.schemaVersion !== RETRO_PACKET_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  for (const field of missingFields(entry)) errors.push(`missing ${field}`);
  if (entry.status !== "pending-human-review") errors.push("status must be pending-human-review");
  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) errors.push("evidence must be a non-empty array");
  if (!Array.isArray(entry.checks) || entry.checks.length === 0) errors.push("checks must be a non-empty array");
  if (!entry.targetFile?.startsWith(`retro/pr-${entry.sourcePr?.number}/`)) {
    errors.push("targetFile must stay under retro/pr-{number}/");
  }
  if (entry.sourcePr && !entry.sourcePr.mergedAt) errors.push("sourcePr.mergedAt is required");
  if (entry.kind !== "decision-log" && typeof entry.candidate !== "object") errors.push("candidate must be an object");
  return { ok: errors.length === 0, errors };
}

export function validateRetroPacket(packet) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return { ok: false, errors: ["packet must be an object"] };
  if (packet.schemaVersion !== RETRO_PACKET_SCHEMA_VERSION) errors.push("packet schemaVersion must be 1");
  if (!Array.isArray(packet.entries) || packet.entries.length === 0) errors.push("packet entries must be a non-empty array");
  const kinds = new Set();
  for (const [index, entry] of (packet.entries ?? []).entries()) {
    const result = validateEvidenceIntakeEntry(entry);
    if (!result.ok) errors.push(...result.errors.map((error) => `entries[${index}]: ${error}`));
    kinds.add(entry.kind);
  }
  for (const kind of RETRO_PACKET_KINDS) {
    if (!kinds.has(kind)) errors.push(`missing packet kind: ${kind}`);
  }
  return { ok: errors.length === 0, errors };
}

export function writeRetroPacketFiles(packet, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const homeDir = path.join(root, packet.home);
  const validation = validateRetroPacket(packet);
  if (!validation.ok) throw new Error(`retro packet failed validation: ${validation.errors.join("; ")}`);
  mkdirSync(homeDir, { recursive: true });

  const fileNames = {
    "decision-log": "decision-log.json",
    "exemplar-candidate": "candidate-exemplar.json",
    "rule-candidate": "candidate-rule.json",
    "coverage-gap-candidate": "candidate-coverage-gap.json",
  };
  const written = [];
  for (const entry of packet.entries) {
    const file = path.join(homeDir, fileNames[entry.kind]);
    writeFileSync(file, json(entry));
    written.push(path.relative(root, file).split(path.sep).join("/"));
  }
  const bodyFile = path.join(homeDir, "pr-body.md");
  writeFileSync(bodyFile, buildRetroPrBody(packet));
  written.push(path.relative(root, bodyFile).split(path.sep).join("/"));
  return { homeDir, written };
}

export function commitRetroPacketFiles({ root, written, prNumber }) {
  if (!Number.isInteger(Number(prNumber)) || Number(prNumber) <= 0) throw new Error("prNumber must be a positive integer");
  if (!Array.isArray(written) || written.length === 0) throw new Error("written files are required");
  const message = `retro: packet for PR #${prNumber}`;
  run("git", ["add", "--", ...written], { cwd: root });
  const staged = maybeRun("git", ["diff", "--cached", "--quiet"], { cwd: root });
  if (staged.status === 0) return { committed: false, message, sha: null };
  if (staged.status !== 1) {
    const detail = [staged.stdout, staged.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`git diff --cached --quiet failed${detail ? `: ${detail}` : ""}`);
  }
  run("git", ["commit", "-m", message], { cwd: root });
  return { committed: true, message, sha: run("git", ["rev-parse", "--short", "HEAD"], { cwd: root }) };
}

export function formatPrCreateCommand({ base, branch, title, bodyPath }) {
  return `gh pr create --base ${shellQuote(base)} --head ${shellQuote(branch)} --title ${shellQuote(title)} --body-file ${shellQuote(bodyPath)}`;
}

export function buildRetroPrBody(packet) {
  const source = packet.entries[0].sourcePr;
  return [
    `## Retro packet`,
    ``,
    `Source PR: #${source.number} ${source.url}`,
    ``,
    `## Pending entries`,
    ...packet.entries.map((entry) => `- ${entry.kind}: ${entry.targetFile}`),
    ``,
    `## Human review gate`,
    `Reviewers must accept, redirect, defer, or reject each packet before any guidance change lands. This PR does not merge retro content into accepted skill guidance by itself.`,
    ``,
  ].join("\n");
}

function ensureRetroWorktree({ repoRoot, worktreeRoot, branch }) {
  if (existsSync(path.join(worktreeRoot, ".git"))) return { created: false, root: worktreeRoot };
  if (existsSync(worktreeRoot)) rmSync(worktreeRoot, { recursive: true, force: true });
  const first = maybeRun("git", ["-C", repoRoot, "worktree", "add", worktreeRoot, "-b", branch, "HEAD"], { encoding: "utf8" });
  if (first.status === 0) return { created: true, root: worktreeRoot };
  const second = maybeRun("git", ["-C", repoRoot, "worktree", "add", worktreeRoot, branch], { encoding: "utf8" });
  if (second.status === 0) return { created: true, root: worktreeRoot };
  const detail = [first.stdout, first.stderr, second.stdout, second.stderr].filter(Boolean).join("\n").trim();
  throw new Error(`failed to create retro worktree for ${branch}: ${detail}`);
}

export function fetchPr(prNumber) {
  return JSON.parse(run("gh", ["pr", "view", String(prNumber), "--json", GH_PR_FIELDS]));
}

function parseArgs(argv) {
  const args = { prCreate: false, repoRoot: repoRootFromModule(), worktreeRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--pr") args.pr = Number(argv[++index]);
    else if (arg === "--pr-create") args.prCreate = true;
    else if (arg === "--repo-root") args.repoRoot = path.resolve(argv[++index]);
    else if (arg === "--worktree-root") args.worktreeRoot = path.resolve(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return "Usage: node scripts/retro-packet.mjs --pr <number> [--pr-create] [--worktree-root <path>]";
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!Number.isInteger(args.pr) || args.pr <= 0) throw new Error("--pr <number> is required");

  const pr = fetchPr(args.pr);
  const packet = buildRetroPacket(pr);
  const validation = validateRetroPacket(packet);
  if (!validation.ok) throw new Error(`generated packet failed validation: ${validation.errors.join("; ")}`);

  const worktreeRoot = args.worktreeRoot ?? path.join(os.tmpdir(), `loom-retro-pr-${pr.number}`);
  const worktree = ensureRetroWorktree({ repoRoot: args.repoRoot, worktreeRoot, branch: packet.branch });
  const { written } = writeRetroPacketFiles(packet, { root: worktree.root });
  const commit = commitRetroPacketFiles({ root: worktree.root, written, prNumber: pr.number });
  const tempRoot = path.resolve(os.tmpdir());
  const displayWorktree = path.resolve(worktree.root).startsWith(`${tempRoot}${path.sep}`)
    ? path.join("<tmp>", path.basename(worktree.root)).split(path.sep).join("/")
    : worktree.root;
  const bodyPath = path.join(worktree.root, packet.home, "pr-body.md");
  const prTitle = `Retro evidence packet for PR #${pr.number}: ${pr.title}`;
  const prCreateCommand = formatPrCreateCommand({ base: pr.baseRefName ?? "main", branch: packet.branch, title: prTitle, bodyPath });

  console.log(`Retro branch: ${packet.branch}`);
  console.log(`Retro worktree: ${displayWorktree}${worktree.created ? " (created)" : " (reused)"}`);
  console.log(`Retro packet home: ${packet.home}`);
  console.log(`Schema validation: ok (${packet.entries.length} entries)`);
  for (const file of written) console.log(`Wrote: ${file}`);
  console.log(`Retro commit: ${commit.committed ? commit.sha : "unchanged"} (${commit.message})`);
  console.log(`PR create command: ${prCreateCommand}`);

  if (args.prCreate) {
    run("git", ["push", "-u", "origin", packet.branch], { cwd: worktree.root });
    console.log(run("gh", ["pr", "create", "--base", pr.baseRefName ?? "main", "--head", packet.branch, "--title", prTitle, "--body-file", bodyPath], { cwd: worktree.root }));
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
