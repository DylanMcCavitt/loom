#!/usr/bin/env node
// Deterministic skill-quality gate for the canonical skills/ tree.
//
// Rules:
// - word-budget: SKILL.md body (frontmatter excluded) stays within the word budget.
// - description-budget: frontmatter description stays within the character budget.
// - filler-phrase: banned filler phrases (including polite padding like please/thanks) are absent
// - tracker-coupling: vendor tracker names (Linear, GitHub) are absent from SKILL.md and
//   references/*.md; neutral vocabulary (tracker, issue, change request, PR host, envelope)
//   is the standard.
// - missing-evals / eval-schema: every skill ships evals/evals.json matching the eval schema.
//
// Existing violations are grandfathered in scripts/skill-quality-allowlist.json. The
// allowlist is a ratchet: a violation not listed (or grown beyond its listed count) fails,
// and a listed violation that shrank or disappeared fails as a stale allowlist entry until
// the list shrinks to match. Regenerate a shrunken list with --print-allowlist.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.mjs";
import { skillsRoot } from "./lib/layout.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export const WORD_BUDGET = 650;
export const DESCRIPTION_BUDGET = 1024;
export const BANNED_PHRASES = Object.freeze([
  "make sure to",
  "be sure to",
  "be careful",
  "remember to",
  "never forget",
  "don't forget to",
  "as needed",
  "it is important to",
  "feel free to",
  "please note",
  "please",
  "thanks",
  "thank you",
  "kindly",
  "sorry",
]);
export const VENDOR_WORDS = Object.freeze(["Linear", "GitHub"]);
export const DEFAULT_ALLOWLIST_PATH = "scripts/skill-quality-allowlist.json";

const KNOWN_RULES = Object.freeze(new Set([
  "word-budget",
  "description-budget",
  "filler-phrase",
  "tracker-coupling",
  "missing-evals",
  "eval-schema",
]));

const USAGE = "Usage: node scripts/validate-skill-quality.mjs [--skills-dir <dir>] [--allowlist <file>] [--print-allowlist]";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function listSkillDirs(skillsDir) {
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function markdownBody(content) {
  const parsed = parseFrontmatter(content);
  if (!parsed) return { body: content, bodyLineOffset: 0, frontmatter: null };
  const bodyLineOffset = content.slice(0, parsed.bodyOffset).split("\n").length - 1;
  return { body: parsed.body, bodyLineOffset, frontmatter: parsed };
}

function countWords(text) {
  return text.split(/\s+/u).filter(Boolean).length;
}

// One violation = { skill, rule, key, count, details: ["path[:line]: message", ...] }.
// key is stable across runs so the allowlist can pin it; count is the ratchet measure.

function checkBudgets(skill, relSkillMd, content, violations) {
  const { body, frontmatter } = markdownBody(content);
  const words = countWords(body);
  if (words > WORD_BUDGET) {
    violations.push({
      skill,
      rule: "word-budget",
      key: "SKILL.md",
      count: words,
      details: [`${relSkillMd}: body is ${words} words; budget is ${WORD_BUDGET}`],
    });
  }
  const description = typeof frontmatter?.values?.description === "string"
    ? frontmatter.values.description.trim()
    : "";
  if (description.length > DESCRIPTION_BUDGET) {
    violations.push({
      skill,
      rule: "description-budget",
      key: "SKILL.md#description",
      count: description.length,
      details: [`${relSkillMd}: frontmatter description is ${description.length} characters; budget is ${DESCRIPTION_BUDGET}`],
    });
  }
}

// keyFile is skill-relative (stable allowlist key); displayFile is repo-relative (readable message).
function scanPhrases(skill, keyFile, displayFile, text, lineOffset, violations) {
  const lines = text.split("\n");
  for (const phrase of BANNED_PHRASES) {
    const pattern = new RegExp(escapeRegExp(phrase), "giu");
    const details = [];
    let count = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const matches = lines[index].match(pattern);
      if (!matches) continue;
      count += matches.length;
      details.push(`${displayFile}:${lineOffset + index + 1}: banned filler phrase "${phrase}"`);
    }
    if (count) {
      violations.push({ skill, rule: "filler-phrase", key: `${keyFile}::${phrase}`, count, details });
    }
  }
}

function scanVendorWords(skill, keyFile, displayFile, content, violations) {
  const lines = content.split("\n");
  for (const word of VENDOR_WORDS) {
    const pattern = new RegExp(`\\b${word}\\b`, "gu");
    const details = [];
    let count = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const matches = lines[index].match(pattern);
      if (!matches) continue;
      count += matches.length;
      details.push(`${displayFile}:${index + 1}: vendor word "${word}"; use neutral vocabulary (tracker, issue, change request, PR host, envelope)`);
    }
    if (count) {
      violations.push({ skill, rule: "tracker-coupling", key: `${keyFile}::${word}`, count, details });
    }
  }
}

function referenceMarkdownFiles(skillDir) {
  const referencesDir = path.join(skillDir, "references");
  if (!existsSync(referencesDir) || !statSync(referencesDir).isDirectory()) return [];
  return readdirSync(referencesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join("references", entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function isNegativeEval(expectedOutput) {
  return expectedOutput.includes("Does NOT activate") || expectedOutput.includes("does not activate");
}

function checkEvals(skill, skillDir, relSkillDir, violations) {
  const relEvalsPath = `${relSkillDir}/evals/evals.json`;
  const evalsPath = path.join(skillDir, "evals", "evals.json");
  if (!existsSync(evalsPath)) {
    violations.push({
      skill,
      rule: "missing-evals",
      key: "evals/evals.json",
      count: 1,
      details: [`${relEvalsPath}: missing; every skill must ship evals/evals.json`],
    });
    return;
  }

  const push = (code, count, details) => violations.push({
    skill,
    rule: "eval-schema",
    key: `evals/evals.json::${code}`,
    count,
    details,
  });

  let data;
  try {
    data = JSON.parse(readFileSync(evalsPath, "utf8"));
  } catch (error) {
    push("parse", 1, [`${relEvalsPath}: invalid JSON (${error.message})`]);
    return;
  }

  if (data?.skill_name !== skill) {
    push("skill-name", 1, [`${relEvalsPath}: skill_name '${data?.skill_name ?? "missing"}' must match folder '${skill}'`]);
  }
  if (!Array.isArray(data?.evals) || !data.evals.length) {
    push("evals-array", 1, [`${relEvalsPath}: evals must be a non-empty array`]);
    return;
  }

  const idDetails = [];
  const promptDetails = [];
  const expectedDetails = [];
  const seenIds = new Set();
  let positives = 0;
  let negatives = 0;
  for (let index = 0; index < data.evals.length; index += 1) {
    const entry = data.evals[index];
    const label = `${relEvalsPath}: evals[${index}]`;
    if (typeof entry?.id !== "number" || Number.isNaN(entry.id)) {
      idDetails.push(`${label}: id must be numeric`);
    } else if (seenIds.has(entry.id)) {
      idDetails.push(`${label}: duplicate id ${entry.id}`);
    } else {
      seenIds.add(entry.id);
    }
    if (typeof entry?.prompt !== "string" || !entry.prompt.trim()) {
      promptDetails.push(`${label}: prompt must be a non-empty string`);
    }
    if (typeof entry?.expected_output !== "string" || !entry.expected_output.trim()) {
      expectedDetails.push(`${label}: expected_output must be a non-empty string`);
    } else if (isNegativeEval(entry.expected_output)) {
      negatives += 1;
    } else {
      positives += 1;
    }
  }
  if (idDetails.length) push("id", idDetails.length, idDetails);
  if (promptDetails.length) push("prompt", promptDetails.length, promptDetails);
  if (expectedDetails.length) push("expected-output", expectedDetails.length, expectedDetails);
  if (!positives) {
    push("positive-case", 1, [`${relEvalsPath}: needs at least one positive case (expected_output describing activation)`]);
  }
  if (!negatives) {
    push("negative-case", 1, [`${relEvalsPath}: needs at least one negative case (expected_output containing "Does NOT activate" / "does not activate")`]);
  }
}

export function collectSkillQualityViolations({ root = repoRoot, skillsDir = skillsRoot } = {}) {
  const resolvedSkillsDir = path.resolve(root, skillsDir);
  const violations = [];
  const skills = listSkillDirs(resolvedSkillsDir);
  for (const skill of skills) {
    const skillDir = path.join(resolvedSkillsDir, skill);
    const relSkillDir = `${skillsDir}/${skill}`;
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (existsSync(skillMdPath)) {
      const relSkillMd = `${relSkillDir}/SKILL.md`;
      const content = readFileSync(skillMdPath, "utf8");
      checkBudgets(skill, relSkillMd, content, violations);
      const { body, bodyLineOffset } = markdownBody(content);
      scanPhrases(skill, "SKILL.md", relSkillMd, body, bodyLineOffset, violations);
      scanVendorWords(skill, "SKILL.md", relSkillMd, content, violations);
    }
    for (const relFile of referenceMarkdownFiles(skillDir)) {
      const keyFile = relFile.split(path.sep).join("/");
      const displayFile = `${relSkillDir}/${keyFile}`;
      const content = readFileSync(path.join(skillDir, relFile), "utf8");
      const { body, bodyLineOffset } = markdownBody(content);
      scanPhrases(skill, keyFile, displayFile, body, bodyLineOffset, violations);
      scanVendorWords(skill, keyFile, displayFile, content, violations);
    }
    checkEvals(skill, skillDir, relSkillDir, violations);
  }
  return { skills, violations };
}

export function buildAllowlist(violations) {
  const skills = {};
  for (const violation of violations) {
    skills[violation.skill] ??= {};
    skills[violation.skill][violation.rule] ??= {};
    skills[violation.skill][violation.rule][violation.key] = violation.count;
  }
  return { skills };
}

function validateAllowlistShape(allowlist, failures) {
  if (!allowlist || typeof allowlist !== "object" || Array.isArray(allowlist)) {
    failures.push("allowlist: must be a JSON object with a 'skills' map");
    return false;
  }
  const skills = allowlist.skills ?? {};
  if (typeof skills !== "object" || Array.isArray(skills)) {
    failures.push("allowlist: 'skills' must be an object map");
    return false;
  }
  let valid = true;
  for (const [skill, rules] of Object.entries(skills)) {
    for (const [rule, keys] of Object.entries(rules ?? {})) {
      if (!KNOWN_RULES.has(rule)) {
        failures.push(`allowlist: unknown rule '${rule}' under skill '${skill}'`);
        valid = false;
        continue;
      }
      for (const [key, count] of Object.entries(keys ?? {})) {
        if (!Number.isInteger(count) || count < 1) {
          failures.push(`allowlist: ${skill}/${rule}/${key} count must be a positive integer`);
          valid = false;
        }
      }
    }
  }
  return valid;
}

export function compareAgainstAllowlist(violations, allowlist) {
  const failures = [];
  if (!validateAllowlistShape(allowlist, failures)) return failures;
  const allowed = allowlist.skills ?? {};

  const seenEntries = new Set();
  for (const violation of violations) {
    const entryPath = `${violation.skill}/${violation.rule}/${violation.key}`;
    const allowedCount = allowed[violation.skill]?.[violation.rule]?.[violation.key];
    if (allowedCount === undefined) {
      failures.push(...violation.details.map((detail) => `${violation.rule}: ${detail}`));
      continue;
    }
    seenEntries.add(entryPath);
    if (violation.count > allowedCount) {
      failures.push(`${violation.rule}: ${entryPath} grew to ${violation.count} (allowlisted at ${allowedCount}); the allowlist is a ratchet and may only shrink`);
      failures.push(...violation.details.map((detail) => `${violation.rule}: ${detail}`));
    } else if (violation.count < allowedCount) {
      failures.push(`stale allowlist entry: ${entryPath} shrank to ${violation.count} (allowlisted at ${allowedCount}); ratchet the allowlist down to ${violation.count}`);
    }
  }

  for (const [skill, rules] of Object.entries(allowed)) {
    for (const [rule, keys] of Object.entries(rules ?? {})) {
      for (const key of Object.keys(keys ?? {})) {
        const entryPath = `${skill}/${rule}/${key}`;
        if (!seenEntries.has(entryPath)) {
          failures.push(`stale allowlist entry: ${entryPath} no longer fails; remove it from the allowlist`);
        }
      }
    }
  }
  return failures;
}

export function evaluateSkillQuality({ root = repoRoot, skillsDir = skillsRoot, allowlist } = {}) {
  const { skills, violations } = collectSkillQualityViolations({ root, skillsDir });
  const failures = compareAgainstAllowlist(violations, allowlist ?? { skills: {} });
  return { checked: skills.length, violations, failures };
}

function readAllowlistFile(allowlistPath) {
  if (!existsSync(allowlistPath)) return { skills: {} };
  return JSON.parse(readFileSync(allowlistPath, "utf8"));
}

function readArgs(argv) {
  const options = { skillsDir: skillsRoot, allowlistPath: path.join(repoRoot, DEFAULT_ALLOWLIST_PATH), printAllowlist: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--print-allowlist") {
      options.printAllowlist = true;
      continue;
    }
    if (!next || next.startsWith("--")) throw new Error(`${arg} requires a value`);
    if (arg === "--skills-dir") {
      options.skillsDir = next;
    } else if (arg === "--allowlist") {
      options.allowlistPath = next;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    index += 1;
  }
  return options;
}

function main() {
  const options = readArgs(process.argv.slice(2));
  if (options.printAllowlist) {
    const { violations } = collectSkillQualityViolations({ root: process.cwd(), skillsDir: options.skillsDir });
    console.log(JSON.stringify(buildAllowlist(violations), null, 2));
    return;
  }
  const allowlist = readAllowlistFile(options.allowlistPath);
  const { checked, failures } = evaluateSkillQuality({ root: process.cwd(), skillsDir: options.skillsDir, allowlist });
  if (failures.length) {
    console.error("Skill quality validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Skill quality validation passed: ${checked} skill${checked === 1 ? "" : "s"} checked in ${options.skillsDir}`);
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
