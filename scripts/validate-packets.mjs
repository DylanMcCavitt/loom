#!/usr/bin/env node
// Scans retro/**/*.md and retro/**/*.json for tagged JSON agent packets and
// validates them against scripts/lib/packet-schema.mjs.
//
// Convention: every machine-checkable packet is a JSON object with a top-level
// `"packet"` field naming the kind (`repair-finding` | `agent-input` |
// `agent-output`). In markdown, emit the object inside a fenced ```json block.
// Standalone .json files under retro/ are validated when they carry the same
// `"packet"` kind tag; untagged JSON (legacy retro evidence) is skipped.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTaggedPacket } from "./lib/packet-schema.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_RETRO_DIR = "retro";
const USAGE = `Usage: node scripts/validate-packets.mjs [--root <dir>] [--retro-dir <dir>]`;

const FENCED_JSON_RE = /```json\s*\n([\s\S]*?)```/giu;

/**
 * @param {string[]} argv
 * @returns {{ root: string, retroDir: string }}
 */
function readArgs(argv) {
  const options = { root: repoRoot, retroDir: DEFAULT_RETRO_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (!next || next.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    if (arg === "--root") {
      options.root = path.resolve(next);
    } else if (arg === "--retro-dir") {
      options.retroDir = next;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    index += 1;
  }
  return options;
}

/**
 * @param {string} dir
 * @param {(name: string) => boolean} [filter]
 * @returns {string[]}
 */
function collectFiles(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, filter));
    } else if (entry.isFile() && filter(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract fenced ```json blocks from markdown text.
 *
 * @param {string} text
 * @returns {{ body: string, index: number }[]}
 */
export function extractFencedJsonBlocks(text) {
  const blocks = [];
  for (const match of text.matchAll(FENCED_JSON_RE)) {
    blocks.push({ body: match[1], index: match.index ?? 0 });
  }
  return blocks;
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineNumberForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeTaggedPacket(value) {
  return isPlainObject(value) && typeof value.packet === "string";
}

/**
 * Validate one parsed JSON value if it is a tagged packet.
 *
 * @param {unknown} value
 * @param {string} location
 * @returns {string[]}
 */
function validateMaybePacket(value, location) {
  if (!looksLikeTaggedPacket(value)) return [];
  const result = validateTaggedPacket(value);
  if (result.ok) return [];
  return result.errors.map((error) => `${location}: ${error}`);
}

/**
 * Scan a markdown file for fenced JSON packet blocks.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {{ checked: number, errors: string[] }}
 */
export function scanMarkdownPackets(filePath, content) {
  const errors = [];
  let checked = 0;
  for (const block of extractFencedJsonBlocks(content)) {
    const line = lineNumberForIndex(content, block.index);
    const location = `${filePath}:${line}`;
    let parsed;
    try {
      parsed = JSON.parse(block.body);
    } catch (error) {
      // Only fail hard when the fence looks like a tagged packet attempt.
      if (/"packet"\s*:/u.test(block.body)) {
        errors.push(`${location}: invalid JSON in packet fence (${error.message})`);
      }
      continue;
    }
    if (!looksLikeTaggedPacket(parsed)) continue;
    checked += 1;
    errors.push(...validateMaybePacket(parsed, location));
  }
  return { checked, errors };
}

/**
 * Scan a standalone JSON file for a tagged packet.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {{ checked: number, errors: string[] }}
 */
export function scanJsonPackets(filePath, content) {
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (/"packet"\s*:/u.test(content)) {
      return { checked: 0, errors: [`${filePath}: invalid JSON (${error.message})`] };
    }
    return { checked: 0, errors: [] };
  }

  if (Array.isArray(parsed)) {
    let checked = 0;
    for (let index = 0; index < parsed.length; index += 1) {
      const item = parsed[index];
      if (!looksLikeTaggedPacket(item)) continue;
      checked += 1;
      errors.push(...validateMaybePacket(item, `${filePath}[${index}]`));
    }
    return { checked, errors };
  }

  if (!looksLikeTaggedPacket(parsed)) {
    return { checked: 0, errors: [] };
  }
  return { checked: 1, errors: validateMaybePacket(parsed, filePath) };
}

/**
 * @param {{ root?: string, retroDir?: string }} [options]
 * @returns {{ checked: number, files: number, errors: string[] }}
 */
export function validateRetroPackets(options = {}) {
  const root = options.root ?? repoRoot;
  const retroDir = path.resolve(root, options.retroDir ?? DEFAULT_RETRO_DIR);
  const errors = [];
  let checked = 0;
  let files = 0;

  if (!existsSync(retroDir)) {
    return { checked: 0, files: 0, errors: [] };
  }
  if (!statSync(retroDir).isDirectory()) {
    return { checked: 0, files: 0, errors: [`${options.retroDir ?? DEFAULT_RETRO_DIR}: expected a directory`] };
  }

  const mdFiles = collectFiles(retroDir, (name) => name.endsWith(".md"));
  const jsonFiles = collectFiles(retroDir, (name) => name.endsWith(".json"));

  for (const filePath of mdFiles) {
    files += 1;
    const relative = path.relative(root, filePath).split(path.sep).join("/");
    const result = scanMarkdownPackets(relative, readFileSync(filePath, "utf8"));
    checked += result.checked;
    errors.push(...result.errors);
  }
  for (const filePath of jsonFiles) {
    files += 1;
    const relative = path.relative(root, filePath).split(path.sep).join("/");
    const result = scanJsonPackets(relative, readFileSync(filePath, "utf8"));
    checked += result.checked;
    errors.push(...result.errors);
  }

  return { checked, files, errors };
}

function main(argv = process.argv.slice(2)) {
  const options = readArgs(argv);
  const result = validateRetroPackets(options);
  if (result.errors.length) {
    console.error("Packet validation failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(
    `Packet validation passed: ${result.checked} packet${result.checked === 1 ? "" : "s"} checked across ${result.files} retro file${result.files === 1 ? "" : "s"}`,
  );
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exit(2);
  }
}
