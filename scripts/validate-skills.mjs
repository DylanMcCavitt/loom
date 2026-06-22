#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const USAGE = `Usage: node scripts/validate-skills.mjs [--skills-dir <dir>] [--global-skills-dir <dir>] [--reserved-name <name>]`;

function readArgs(argv) {
  const options = {
    skillsDir: ".agents/skills",
    globalSkillsDirs: [],
    reservedNames: new Set(),
  };

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
    if (arg === "--skills-dir") {
      options.skillsDir = next;
    } else if (arg === "--global-skills-dir") {
      options.globalSkillsDirs.push(next);
    } else if (arg === "--reserved-name") {
      options.reservedNames.add(next);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
    index += 1;
  }

  if (!options.globalSkillsDirs.length) {
    options.globalSkillsDirs.push(path.join(homedir(), ".agents", "skills"));
  }

  return options;
}

function listEntries(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseFrontmatter(filePath, content, errors) {
  if (!content.startsWith("---\n")) {
    errors.push(`${filePath}: missing frontmatter block`);
    return null;
  }

  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    errors.push(`${filePath}: frontmatter block is not closed`);
    return null;
  }

  const frontmatter = content.slice(4, end).split("\n");
  const data = new Map();
  for (const [lineIndex, line] of frontmatter.entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) {
      errors.push(`${filePath}:${lineIndex + 2}: frontmatter line must be key: value`);
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data.set(key, value);
  }

  return data;
}

function containsConcreteUseWhen(description) {
  return /\bUse when\b\s+\S+/u.test(description);
}

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}["']?/iu,
];

function scanSecrets(filePath, content, errors) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`${filePath}: contains API-key/token-looking text`);
      return;
    }
  }
}

function collectFiles(dir) {
  const files = [];
  for (const entry of listEntries(dir)) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function safeRealpath(target) {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

function collectGlobalSkillNames(globalSkillsDirs, skillsRoot) {
  const names = new Set();
  const skillsReal = safeRealpath(skillsRoot);
  for (const dir of globalSkillsDirs) {
    const resolved = path.resolve(dir);
    if (!existsSync(resolved)) continue;
    // Skip a global root that resolves to the skills dir itself (symlinked single source of truth).
    if (skillsReal && safeRealpath(resolved) === skillsReal) continue;
    for (const entry of listEntries(resolved)) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(resolved, entry.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, "utf8");
      const parseErrors = [];
      const frontmatter = parseFrontmatter(skillPath, content, parseErrors);
      const name = frontmatter?.get("name")?.trim();
      names.add(name || entry.name);
    }
  }
  return names;
}

function validateSkills(options) {
  const skillsRoot = path.resolve(options.skillsDir);
  const errors = [];
  const seenNames = new Map();
  const globalNames = collectGlobalSkillNames(options.globalSkillsDirs, skillsRoot);
  for (const reserved of options.reservedNames) globalNames.add(reserved);

  if (!existsSync(skillsRoot)) {
    return { checked: 0, errors };
  }
  if (!statSync(skillsRoot).isDirectory()) {
    errors.push(`${options.skillsDir}: expected a directory`);
    return { checked: 0, errors };
  }

  const entries = listEntries(skillsRoot);
  let checked = 0;
  for (const entry of entries) {
    const skillDir = path.join(skillsRoot, entry.name);
    if (!entry.isDirectory()) {
      errors.push(`${path.relative(process.cwd(), skillDir)}: only skill directories are allowed directly under .agents/skills`);
      continue;
    }

    const skillPath = path.join(skillDir, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`${path.relative(process.cwd(), skillDir)}: missing SKILL.md`);
      continue;
    }
    checked += 1;

    for (const filePath of collectFiles(skillDir)) {
      scanSecrets(path.relative(process.cwd(), filePath), readFileSync(filePath, "utf8"), errors);
      if (filePath.endsWith(`${path.sep}SKILL.md`) && path.dirname(filePath) !== skillDir) {
        errors.push(`${path.relative(process.cwd(), filePath)}: SKILL.md must be exactly one level under .agents/skills/<name>/`);
      }
    }

    const relSkillPath = path.relative(process.cwd(), skillPath);
    const content = readFileSync(skillPath, "utf8");
    const frontmatter = parseFrontmatter(relSkillPath, content, errors);
    if (!frontmatter) continue;

    const name = frontmatter.get("name")?.trim();
    const description = frontmatter.get("description")?.trim();
    if (!name) errors.push(`${relSkillPath}: missing frontmatter name`);
    if (!description) errors.push(`${relSkillPath}: missing frontmatter description`);
    if (name && name !== entry.name) {
      errors.push(`${relSkillPath}: frontmatter name '${name}' must match directory '${entry.name}'`);
    }
    if (description && !containsConcreteUseWhen(description)) {
      errors.push(`${relSkillPath}: description must contain concrete 'Use when ...' trigger language`);
    }
    if (name) {
      const previous = seenNames.get(name);
      if (previous) {
        errors.push(`${relSkillPath}: duplicate skill name '${name}' also used by ${previous}`);
      } else {
        seenNames.set(name, relSkillPath);
      }
      if (globalNames.has(name)) {
        errors.push(`${relSkillPath}: skill name '${name}' collides with an existing global skill`);
      }
    }
  }

  return { checked, errors };
}

try {
  const options = readArgs(process.argv.slice(2));
  const result = validateSkills(options);
  if (result.errors.length) {
    console.error("Skill validation failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Skill validation passed: ${result.checked} skill${result.checked === 1 ? "" : "s"} checked in ${options.skillsDir}`);
} catch (error) {
  console.error(error.message);
  console.error(USAGE);
  process.exit(2);
}
