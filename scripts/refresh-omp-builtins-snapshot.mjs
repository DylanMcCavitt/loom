#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { ompBuiltinsSnapshotRoot } from "./lib/layout.mjs";

const USAGE = "Usage: node scripts/refresh-omp-builtins-snapshot.mjs [--write] [--snapshot-dir <path>]";
const DEFAULT_SNAPSHOT_DIR = ompBuiltinsSnapshotRoot;
const PACKAGE_NAME = "@oh-my-pi/pi-coding-agent";
const EXPECTED_AGENTS = ["designer", "explore", "librarian", "oracle", "plan", "quick_task", "reviewer", "task"];
const PORTABILITY_CLASSES = {
  textAndTui: "omp-acp-text-and-tui-runtime",
  textOnly: "omp-acp-text-runtime",
  tuiOnly: "omp-tui-runtime-only",
};

function readArgs(argv) {
  const options = { write: false, snapshotDir: DEFAULT_SNAPSHOT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg !== "--snapshot-dir") {
      throw new Error(`Unknown option: ${arg}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error("--snapshot-dir requires a value");
    }
    options.snapshotDir = next;
    index += 1;
  }
  return options;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function homeRelative(filePath) {
  const home = homedir();
  const resolved = path.resolve(filePath);
  if (resolved === home) return "~";
  if (resolved.startsWith(`${home}${path.sep}`)) return `~/${path.relative(home, resolved).split(path.sep).join("/")}`;
  return resolved.split(path.sep).join("/");
}

function assertSafeSnapshotDir(snapshotDir) {
  const resolved = path.resolve(snapshotDir);
  const defaultResolved = path.resolve(DEFAULT_SNAPSHOT_DIR);
  if (resolved !== defaultResolved) {
    throw new Error(`--snapshot-dir only supports the checked-in snapshot directory: ${DEFAULT_SNAPSHOT_DIR}`);
  }
  const normalized = resolved.split(path.sep).join("/");
  if (normalized.endsWith("/.omp") || normalized.endsWith("/.omp/agents") || normalized.endsWith("/.omp/agent")) {
    throw new Error("snapshot refresh refuses to target live OMP config directories");
  }
}

function findPackageRoot() {
  const ompPath = realpathSync(run("which", ["omp"]));
  let current = path.dirname(ompPath);
  while (current !== path.dirname(current)) {
    const packageJson = path.join(current, "package.json");
    if (existsSync(packageJson)) {
      const pkg = JSON.parse(readText(packageJson));
      if (pkg.name === PACKAGE_NAME) return current;
    }
    current = path.dirname(current);
  }
  throw new Error(`Could not find ${PACKAGE_NAME} package root from ${ompPath}`);
}

function readPackageSource(packageRoot) {
  const packageJsonPath = path.join(packageRoot, "package.json");
  const pkg = JSON.parse(readText(packageJsonPath));
  const cliVersionText = run("omp", ["--version"]);
  return {
    packageName: pkg.name,
    packageVersion: pkg.version,
    cliVersion: cliVersionText,
    packageRoot: homeRelative(packageRoot),
    packageJsonPath: homeRelative(packageJsonPath),
  };
}

function agentFrontmatter(content) {
  const parsed = parseFrontmatter(content);
  if (!parsed) return { keys: [] };
  return {
    keys: parsed.keys,
    values: {
      name: parsed.values.name,
      description: parsed.values.description,
    },
  };
}


function exportBundledAgents() {
  const targetDir = mkdtempSync(path.join(tmpdir(), "omp-agents-snapshot-"));
  const raw = run("omp", ["agents", "unpack", "--dir", targetDir, "--json"]);
  const result = JSON.parse(raw);
  return { targetDir, result };
}

function agentSnapshotFromDir(targetDir) {
  return readdirSync(targetDir)
    .filter(file => file.endsWith(".md"))
    .sort()
    .map(file => {
      const filePath = path.join(targetDir, file);
      const content = readText(filePath);
      const frontmatter = agentFrontmatter(content);
      return {
        name: path.basename(file, ".md"),
        file: `agents/${file}`,
        bytes: Buffer.byteLength(content),
        sha256: sha256(content),
        frontmatterKeys: frontmatter.keys,
        description: frontmatter.values?.description,
      };
    });
}

function copyAgents(targetDir, snapshotDir) {
  const agentsDir = path.join(snapshotDir, "agents");
  rmSync(agentsDir, { recursive: true, force: true });
  mkdirSync(agentsDir, { recursive: true });
  for (const file of readdirSync(targetDir).filter(item => item.endsWith(".md")).sort()) {
    copyFileSync(path.join(targetDir, file), path.join(agentsDir, file));
  }
}

function scanWithStates(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let start = -1;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    const prev = text[index - 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed ${openChar}${closeChar} block`);
}

function extractArrayAfter(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) throw new Error(`Missing marker: ${marker}`);
  const arrayStart = text.indexOf("[", markerIndex);
  if (arrayStart === -1) throw new Error(`Missing array after marker: ${marker}`);
  return scanWithStates(text, arrayStart, "[", "]");
}

function splitTopLevelObjects(arrayText) {
  const objects = [];
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  let start = -1;
  for (let index = 0; index < arrayText.length; index += 1) {
    const char = arrayText[index];
    const next = arrayText[index + 1];
    const prev = arrayText[index - 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === quote && prev !== "\\") quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(arrayText.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function stringProperty(objectText, property) {
  const match = objectText.match(new RegExp(`${property}:\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)`, "s"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function stringArrayProperty(objectText, property) {
  const propertyIndex = objectText.indexOf(`${property}:`);
  if (propertyIndex === -1) return [];
  const arrayStart = objectText.indexOf("[", propertyIndex);
  if (arrayStart === -1) return [];
  const arrayText = scanWithStates(objectText, arrayStart, "[", "]");
  return Array.from(arrayText.matchAll(/"([^"]+)"|'([^']+)'/g), match => match[1] ?? match[2]);
}

function subcommandsOf(objectText) {
  const propertyIndex = objectText.indexOf("subcommands:");
  if (propertyIndex === -1) return [];
  const arrayStart = objectText.indexOf("[", propertyIndex);
  if (arrayStart === -1) return [];
  const arrayText = scanWithStates(objectText, arrayStart, "[", "]");
  return Array.from(arrayText.matchAll(/name:\s*"([^"]+)"/g), match => match[1]);
}

function commandPortability(hasHandle, hasHandleTui) {
  if (hasHandle && hasHandleTui) return PORTABILITY_CLASSES.textAndTui;
  if (hasHandle) return PORTABILITY_CLASSES.textOnly;
  return PORTABILITY_CLASSES.tuiOnly;
}

function buildCommandIndex(packageRoot, source) {
  const registryPath = path.join(packageRoot, "src/slash-commands/builtin-registry.ts");
  const availablePath = path.join(packageRoot, "src/slash-commands/available-commands.ts");
  const acpPath = path.join(packageRoot, "src/slash-commands/acp-builtins.ts");
  const registrySource = readText(registryPath);
  const arrayText = extractArrayAfter(registrySource, "const BUILTIN_SLASH_COMMAND_REGISTRY");
  const commands = splitTopLevelObjects(arrayText)
    .map(objectText => {
      const name = stringProperty(objectText, "name");
      if (!name) return null;
      const hasHandle = /\bhandle\s*:/.test(objectText);
      const hasHandleTui = /\bhandleTui\s*:/.test(objectText);
      const inlineHint = stringProperty(objectText, "acpInputHint") ?? stringProperty(objectText, "inlineHint");
      return {
        name,
        aliases: stringArrayProperty(objectText, "aliases"),
        sourceType: "builtin-slash-command",
        portabilityClass: commandPortability(hasHandle, hasHandleTui),
        advertisedInAcp: hasHandle,
        tuiRuntimeOnly: !hasHandle && hasHandleTui,
        allowsArgs: /\ballowArgs:\s*true\b/.test(objectText),
        inputHint: inlineHint,
        description: stringProperty(objectText, "acpDescription") ?? stringProperty(objectText, "description"),
        subcommands: subcommandsOf(objectText),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: 1,
    generatedForIssue: 39,
    source,
    commandSourceTypes: [
      { sourceType: "builtin-slash-command", portabilityClass: "see per command" },
      { sourceType: "skill", portabilityClass: "portable-if-skill-is-ported" },
      { sourceType: "extension", portabilityClass: "omp-runtime-extension" },
      { sourceType: "custom", portabilityClass: "file-backed-runtime-command" },
      { sourceType: "mcp_prompt", portabilityClass: "mcp-runtime-only" },
      { sourceType: "file", portabilityClass: "portable-file-command" },
    ],
    sourceFiles: [
      homeRelative(registryPath),
      homeRelative(availablePath),
      homeRelative(acpPath),
    ],
    counts: {
      total: commands.length,
      acpAdvertised: commands.filter(command => command.advertisedInAcp).length,
      tuiRuntimeOnly: commands.filter(command => command.tuiRuntimeOnly).length,
    },
    commands,
  };
}

function walkFiles(root, predicate = () => true) {
  if (!existsSync(root)) return [];
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(full, predicate));
    } else if (entry.isFile() && predicate(full)) {
      result.push(full);
    }
  }
  return result.sort();
}

function buildResourceIndex(packageRoot, source, agents) {
  const promptsRoot = path.join(packageRoot, "src/prompts");
  const rulesRoot = path.join(packageRoot, "src/discovery/builtin-rules");
  const promptFiles = walkFiles(promptsRoot, file => file.endsWith(".md"));
  const promptCategories = new Map();
  for (const file of promptFiles) {
    const rel = path.relative(promptsRoot, file).split(path.sep).join("/");
    const slash = rel.indexOf("/");
    const category = slash === -1 ? "root" : rel.slice(0, slash);
    const content = readText(file);
    if (!promptCategories.has(category)) {
      promptCategories.set(category, { category, files: [], bytes: 0 });
    }
    const item = promptCategories.get(category);
    item.files.push({
      path: `src/prompts/${rel}`,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    });
    item.bytes += Buffer.byteLength(content);
  }
  const promptCategoryIndex = [...promptCategories.values()]
    .map(category => ({
      ...category,
      files: category.files.sort((left, right) => left.path.localeCompare(right.path)),
      combinedSha256: sha256(category.files.map(file => `${file.path}:${file.sha256}`).join("\n")),
    }))
    .sort((left, right) => left.category.localeCompare(right.category));

  const builtInRules = walkFiles(rulesRoot, file => file.endsWith(".md"))
    .map(file => {
      const content = readText(file);
      return {
        name: path.basename(file, ".md"),
        path: `src/discovery/builtin-rules/${path.basename(file)}`,
        sourceType: "builtin-default-rule",
        portabilityClass: "portable-rule-reference",
        bytes: Buffer.byteLength(content),
        sha256: sha256(content),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    schemaVersion: 1,
    generatedForIssue: 39,
    source,
    portableResources: {
      bundledAgents: agents,
      promptCategories: promptCategoryIndex,
      builtInRules,
    },
    runtimeOnlySurfaces: [
      {
        sourceType: "builtin-slash-command",
        portabilityClass: "omp-tui-runtime-only",
        note: "Commands without a text/ACP handle require the OMP TUI runtime and are indexed but not treated as portable resources.",
      },
      {
        sourceType: "mcp_prompt",
        portabilityClass: "mcp-runtime-only",
        note: "MCP prompt commands depend on connected runtime servers and are not snapshotted.",
      },
      {
        sourceType: "extension",
        portabilityClass: "omp-runtime-extension",
        note: "Extension command registration is runtime state and plugin-owned.",
      },
    ],
    excludedRuntimeState: [
      "~/.omp/agent/sessions/",
      "~/.omp/agent/terminal-sessions/",
      "~/.omp/agent/blobs/",
      "~/.omp/agent/cache/",
      "~/.omp/agent/logs/",
      "~/.omp/agent/*.db",
      "~/.omp/agent/*.sqlite",
    ],
  };
}

function writeSnapshot(snapshotDir, source, agents, commands, resources) {
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(path.join(snapshotDir, "source.json"), stableJson({
    schemaVersion: 1,
    generatedForIssue: 39,
    source,
    expectedBundledAgents: EXPECTED_AGENTS,
    agents,
    refreshCommand: "node scripts/refresh-omp-builtins-snapshot.mjs --write",
    dryRunCommand: "node scripts/refresh-omp-builtins-snapshot.mjs",
  }));
  writeFileSync(path.join(snapshotDir, "commands.json"), stableJson(commands));
  writeFileSync(path.join(snapshotDir, "resource-index.json"), stableJson(resources));
}

function compareSnapshot(snapshotDir, generated) {
  const checks = [
    ["source.json", generated.sourceJson],
    ["commands.json", generated.commandsJson],
    ["resource-index.json", generated.resourceIndexJson],
  ];
  const changed = [];
  for (const [file, content] of checks) {
    const existingPath = path.join(snapshotDir, file);
    if (!existsSync(existingPath) || readText(existingPath) !== content) changed.push(file);
  }
  const agentsDir = path.join(snapshotDir, "agents");
  for (const agent of generated.agents) {
    const existingPath = path.join(agentsDir, path.basename(agent.file));
    if (!existsSync(existingPath)) {
      changed.push(agent.file);
      continue;
    }
    const existing = readText(existingPath);
    if (sha256(existing) !== agent.sha256) changed.push(agent.file);
  }
  return changed;
}

function main() {
  const options = readArgs(process.argv.slice(2));
  const snapshotDir = path.resolve(options.snapshotDir);
  assertSafeSnapshotDir(snapshotDir);
  const packageRoot = findPackageRoot();
  const source = readPackageSource(packageRoot);
  const { targetDir, result } = exportBundledAgents();
  try {
    const agents = agentSnapshotFromDir(targetDir);
    const agentNames = agents.map(agent => agent.name);
    const missingAgents = EXPECTED_AGENTS.filter(name => !agentNames.includes(name));
    if (missingAgents.length > 0) {
      throw new Error(`OMP bundled agent export missing expected agents: ${missingAgents.join(", ")}`);
    }
    const commands = buildCommandIndex(packageRoot, source);
    const resources = buildResourceIndex(packageRoot, source, agents);
    const sourceJson = stableJson({
      schemaVersion: 1,
      generatedForIssue: 39,
      source,
      expectedBundledAgents: EXPECTED_AGENTS,
      agents,
      refreshCommand: "node scripts/refresh-omp-builtins-snapshot.mjs --write",
      dryRunCommand: "node scripts/refresh-omp-builtins-snapshot.mjs",
    });
    const commandsJson = stableJson(commands);
    const resourceIndexJson = stableJson(resources);

    if (options.write) {
      copyAgents(targetDir, snapshotDir);
      writeSnapshot(snapshotDir, source, agents, commands, resources);
      console.log(`OMP built-ins snapshot refreshed in ${path.relative(process.cwd(), snapshotDir) || "."}`);
    } else {
      const changed = compareSnapshot(snapshotDir, {
        agents,
        sourceJson,
        commandsJson,
        resourceIndexJson,
      });
      console.log("OMP built-ins snapshot dry run");
      console.log(`Source: ${source.packageName}@${source.packageVersion} (${source.cliVersion})`);
      console.log(`Agent export target: ${result.targetDir}`);
      console.log(`Bundled agents: ${agents.length}`);
      console.log(`Builtin slash commands: ${commands.commands.length}`);
      console.log(`Prompt categories: ${resources.portableResources.promptCategories.length}`);
      console.log(`Builtin rules: ${resources.portableResources.builtInRules.length}`);
      console.log(`Mutation: disabled`);
      console.log(`Drift: ${changed.length ? changed.join(", ") : "none"}`);
      if (changed.length > 0) process.exitCode = 1;
    }
  } finally {
    rmSync(targetDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
