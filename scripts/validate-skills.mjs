#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { compatSkillsRoot, nucleusSkillsRoot, nucleusUtilitiesRoot } from "./lib/layout.mjs";
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
    extraSkillsDirs: [nucleusUtilitiesRoot],
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
      options.extraSkillsDirs = [];
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
  return /\bUse (?:when|for)\b\s+\S+/u.test(description);
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function validateSkillMetadata(relSkillPath, metadata, errors) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push(`${relSkillPath}: missing frontmatter metadata string map`);
    return;
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== "string") {
      errors.push(`${relSkillPath}: metadata.${key} must be a string`);
    }
  }

  const version = typeof metadata.version === "string" ? metadata.version.trim() : "";
  const changelog = typeof metadata.changelog === "string" ? metadata.changelog.trim() : "";
  if (!version) {
    errors.push(`${relSkillPath}: missing metadata.version`);
  } else if (!SEMVER_PATTERN.test(version)) {
    errors.push(`${relSkillPath}: metadata.version must be valid semver`);
  }
  if (!changelog) {
    errors.push(`${relSkillPath}: missing metadata.changelog`);
  } else if (version && !changelog.startsWith(`${version} - `)) {
    errors.push(`${relSkillPath}: metadata.changelog must start with '${version} - '`);
  }
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

function isInsidePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
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
  const localSkillRoots = [
    skillsRoot,
    path.resolve(DEFAULT_COMPAT_SKILLS_DIR),
  ].map(safeRealpath).filter(Boolean);
  for (const dir of globalSkillsDirs) {
    const resolved = path.resolve(dir);
    if (!existsSync(resolved)) continue;
    // Skip global roots/entries that resolve back into this repo's canonical or
    // compatibility skill surfaces; they are not external collision sources.
    const resolvedReal = safeRealpath(resolved);
    const sameLocalRoot = resolvedReal && localSkillRoots.some((root) => isInsidePath(root, resolvedReal));
    // The default ~/.agents/skills root may point at another worktree of this same package; that is
    // this repo's canonical skills, not an external collision source. Explicit test/global dirs still count.
    const defaultGlobalRoot = path.join(homedir(), ".agents", "skills");
    const sameDefaultPackage = resolved === defaultGlobalRoot && isSamePackageSkillsRoot(resolved, skillsRoot);
    if (sameLocalRoot || sameDefaultPackage) continue;
    for (const entry of listEntries(resolved)) {
      if (!entry.isDirectory()) continue;
      const entryReal = safeRealpath(path.join(resolved, entry.name));
      if (entryReal && localSkillRoots.some((root) => isInsidePath(root, entryReal))) continue;
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


const BUS_FIRST_HISTORY_FILE = "biters/references/lens-minimal-diff.md";

function scanSkillContentPolicy(skillsRoots, errors) {
  for (const skillsRoot of skillsRoots) {
    const resolved = path.resolve(skillsRoot);
    if (!existsSync(resolved)) continue;
    for (const relativeFile of collectRelativeFiles(resolved)) {
      const content = readFileSync(path.join(resolved, relativeFile), "utf8");
      const displayPath = path.join(path.relative(process.cwd(), resolved), relativeFile);
      if (content.includes("docs/harness/shared-nucleus-agents")) errors.push(`${displayPath}: must not reference docs/harness/shared-nucleus-agents; use nucleus/agents/shared-nucleus-agents`);
      if (content.includes("bus-first") && relativeFile !== BUS_FIRST_HISTORY_FILE) errors.push(`${displayPath}: must not reference bus-first outside ${BUS_FIRST_HISTORY_FILE}`);
      if (/LOO-\d+/u.test(content)) errors.push(`${displayPath}: must not reference Linear issue ids (LOO-*); keep tracker ids out of canonical skill source`);
    }
  }
}

function validateCompatSurface(skillsRoots, compatRoot, errors) {
  if (!existsSync(compatRoot) || !statSync(compatRoot).isDirectory()) {
    errors.push(`${path.relative(process.cwd(), compatRoot)}: expected rendered compatibility surface`);
    return;
  }
  const canonicalSources = new Map();
  for (const root of skillsRoots) {
    if (!existsSync(root)) continue;
    for (const relativeFile of collectRelativeFiles(root)) {
      canonicalSources.set(relativeFile, root);
    }
  }
  const canonicalFiles = [...canonicalSources.keys()].sort();
  const compatFiles = collectRelativeFiles(compatRoot);
  const rootLabels = skillsRoots.map((root) => path.relative(process.cwd(), root)).join(" and ");
  if (JSON.stringify(canonicalFiles) !== JSON.stringify(compatFiles)) {
    errors.push(`${path.relative(process.cwd(), compatRoot)}: rendered compatibility surface must contain exactly the files in ${rootLabels}`);
    return;
  }
  for (const relativeFile of canonicalFiles) {
    const sourceRoot = canonicalSources.get(relativeFile);
    const canonical = readFileSync(path.join(sourceRoot, relativeFile));
    const compat = readFileSync(path.join(compatRoot, relativeFile));
    if (!canonical.equals(compat)) {
      errors.push(`${path.join(path.relative(process.cwd(), compatRoot), relativeFile)}: rendered compatibility file differs from ${path.join(path.relative(process.cwd(), sourceRoot), relativeFile)}`);
    }
  }
}

function validateSkillsRoot(skillsDir, { errors, seenNames, globalNames }) {
  const skillsRoot = path.resolve(skillsDir);
  if (!existsSync(skillsRoot)) {
    return 0;
  }
  if (!statSync(skillsRoot).isDirectory()) {
    errors.push(`${skillsDir}: expected a directory`);
    return 0;
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
    const metadata = frontmatter.get("metadata");
    if (!name) errors.push(`${relSkillPath}: missing frontmatter name`);
    if (!description) errors.push(`${relSkillPath}: missing frontmatter description`);
    if (name && name !== entry.name) {
      errors.push(`${relSkillPath}: frontmatter name '${name}' must match directory '${entry.name}'`);
    }
    if (description && !containsConcreteUseWhen(description)) {
      errors.push(`${relSkillPath}: description must contain concrete 'Use when ...' trigger language`);
    }
    validateSkillMetadata(relSkillPath, metadata, errors);
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

  return checked;
}

export function validateSkills(options) {
  const errors = [];
  const seenNames = new Map();
  const skillsRoots = [options.skillsDir, ...(options.extraSkillsDirs ?? [])];
  const globalNames = collectGlobalSkillNames(options.globalSkillsDirs, path.resolve(options.skillsDir));
  for (const reserved of options.reservedNames) globalNames.add(reserved);

  let checked = 0;
  for (const skillsDir of skillsRoots) {
    checked += validateSkillsRoot(skillsDir, { errors, seenNames, globalNames });
  }

  scanSkillContentPolicy([path.resolve(options.skillsDir)], errors);

  if (options.checkCompat) {
    validateCompatSurface(skillsRoots.map((dir) => path.resolve(dir)), path.resolve(options.compatSkillsDir), errors);
  }

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
