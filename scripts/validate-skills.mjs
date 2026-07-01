#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { compatSkillsRoot, nucleusSkillsRoot } from "./lib/layout.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter as parseMarkdownFrontmatter } from "./lib/frontmatter.mjs";
import { scanHarnessSafety } from "./lib/harness-safety.mjs";

const DEFAULT_SKILLS_DIR = nucleusSkillsRoot;
const DEFAULT_COMPAT_SKILLS_DIR = compatSkillsRoot;
const USAGE = `Usage: node scripts/validate-skills.mjs [--skills-dir <dir>] [--global-skills-dir <dir>] [--reserved-name <name>]`;

function readArgs(argv) {
  const options = {
    skillsDir: DEFAULT_SKILLS_DIR,
    compatSkillsDir: DEFAULT_COMPAT_SKILLS_DIR,
    checkCompat: true,
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
      options.checkCompat = false;
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

function readFrontmatterData(filePath, content, errors) {
  const parsed = parseMarkdownFrontmatter(content);
  if (!parsed) {
    errors.push(`${filePath}: ${content.startsWith("---") ? "frontmatter block is not closed" : "missing frontmatter block"}`);
    return null;
  }
  for (const invalid of parsed.invalidLines) {
    errors.push(`${filePath}:${invalid.line}: frontmatter line must be key: value`);
  }
  return new Map(Object.entries(parsed.values));
}


function containsConcreteUseWhen(description) {
  return /\bUse when\b\s+\S+/u.test(description);
}

function scanSecrets(filePath, content, errors) {
  const findings = scanHarnessSafety(filePath, content, { privateHome: false });
  for (const finding of findings) errors.push(finding.replace(/API-key\/token\/secret-looking text/u, "API-key/token-looking text"));
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

function nearestPackageName(start) {
  let dir = path.resolve(safeRealpath(start) ?? start);
  while (true) {
    const packagePath = path.join(dir, "package.json");
    if (existsSync(packagePath)) {
      try {
        return JSON.parse(readFileSync(packagePath, "utf8")).name ?? null;
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isSamePackageSkillsRoot(globalRoot, skillsRoot) {
  const globalName = nearestPackageName(globalRoot);
  const localName = nearestPackageName(skillsRoot);
  return !!globalName && globalName === localName;
}

function collectGlobalSkillNames(globalSkillsDirs, skillsRoot) {
  const names = new Set();
  const skillsReal = safeRealpath(skillsRoot);
  for (const dir of globalSkillsDirs) {
    const resolved = path.resolve(dir);
    if (!existsSync(resolved)) continue;
    // Skip a global root that resolves to the skills dir itself (symlinked single source of truth).
    // The default ~/.agents/skills root may point at another worktree of this same package; that is
    // this repo's canonical skills, not an external collision source. Explicit test/global dirs still count.
    const defaultGlobalRoot = path.join(homedir(), ".agents", "skills");
    const sameDefaultPackage = resolved === defaultGlobalRoot && isSamePackageSkillsRoot(resolved, skillsRoot);
    if (skillsReal && (safeRealpath(resolved) === skillsReal || sameDefaultPackage)) continue;
    for (const entry of listEntries(resolved)) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(resolved, entry.name, "SKILL.md");
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, "utf8");
      const parseErrors = [];
      const frontmatter = readFrontmatterData(skillPath, content, parseErrors);
      const name = frontmatter?.get("name")?.trim();
      names.add(name || entry.name);
    }
  }
  return names;
}

function collectRelativeFiles(root, current = root, files = []) {
  for (const entry of listEntries(current)) {
    if (entry.name === ".system") continue;
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      collectRelativeFiles(root, filePath, files);
    } else if (entry.isFile()) {
      files.push(path.relative(root, filePath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

function validateCompatSurface(skillsRoot, compatRoot, errors) {
  if (!existsSync(compatRoot) || !statSync(compatRoot).isDirectory()) {
    errors.push(`${path.relative(process.cwd(), compatRoot)}: expected rendered compatibility surface`);
    return;
  }
  const canonicalFiles = collectRelativeFiles(skillsRoot);
  const compatFiles = collectRelativeFiles(compatRoot);
  if (JSON.stringify(canonicalFiles) !== JSON.stringify(compatFiles)) {
    errors.push(`${path.relative(process.cwd(), compatRoot)}: rendered compatibility surface must contain exactly the files in ${path.relative(process.cwd(), skillsRoot)}`);
    return;
  }
  for (const relativeFile of canonicalFiles) {
    const canonical = readFileSync(path.join(skillsRoot, relativeFile));
    const compat = readFileSync(path.join(compatRoot, relativeFile));
    if (!canonical.equals(compat)) {
      errors.push(`${path.join(path.relative(process.cwd(), compatRoot), relativeFile)}: rendered compatibility file differs from ${path.join(path.relative(process.cwd(), skillsRoot), relativeFile)}`);
    }
  }
}

export function validateSkills(options) {
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
    if (entry.name.startsWith(".")) continue;
    const skillDir = path.join(skillsRoot, entry.name);
    if (!entry.isDirectory()) {
      errors.push(`${path.relative(process.cwd(), skillDir)}: only skill directories are allowed directly under nucleus/skills`);
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
        errors.push(`${path.relative(process.cwd(), filePath)}: SKILL.md must be exactly one level under nucleus/skills/<name>/`);
      }
    }

    const relSkillPath = path.relative(process.cwd(), skillPath);
    const content = readFileSync(skillPath, "utf8");
    const frontmatter = readFrontmatterData(relSkillPath, content, errors);
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

  if (options.checkCompat) validateCompatSurface(skillsRoot, path.resolve(options.compatSkillsDir), errors);

  return { checked, errors };
}

function main() {
  const options = readArgs(process.argv.slice(2));
  const result = validateSkills(options);
  if (result.errors.length) {
    console.error("Skill validation failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Skill validation passed: ${result.checked} skill${result.checked === 1 ? "" : "s"} checked in ${options.skillsDir}`);
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
