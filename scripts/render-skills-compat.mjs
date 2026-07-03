#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { compatSkillsRoot, nucleusSkillsRoot, nucleusUtilitiesRoot } from "./lib/layout.mjs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = path.join(repoRoot, nucleusSkillsRoot);
const utilitiesRoot = path.join(repoRoot, nucleusUtilitiesRoot);
const compatRoot = path.join(repoRoot, compatSkillsRoot);

function assertRepoPath(target) {
  const resolved = path.resolve(target);
  if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`refusing to touch path outside repo: ${target}`);
  }
  return resolved;
}

function entries(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store" && entry.name !== ".system")
    .sort((left, right) => left.name.localeCompare(right.name));
}

function copyTree(source, destination) {
  assertRepoPath(source);
  assertRepoPath(destination);
  const stat = statSync(source);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of entries(source)) {
      copyTree(path.join(source, entry.name), path.join(destination, entry.name));
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`unsupported skill package entry: ${path.relative(repoRoot, source)}`);
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

function clearCompatSurface() {
  mkdirSync(compatRoot, { recursive: true });
  for (const entry of entries(compatRoot)) {
    rmSync(assertRepoPath(path.join(compatRoot, entry.name)), { recursive: true, force: true });
  }
}

if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
  throw new Error(`${nucleusSkillsRoot} must exist before rendering the compatibility surface`);
}

assertRepoPath(sourceRoot);
assertRepoPath(compatRoot);
clearCompatSurface();
copyTree(sourceRoot, compatRoot);
if (existsSync(utilitiesRoot) && statSync(utilitiesRoot).isDirectory()) {
  assertRepoPath(utilitiesRoot);
  copyTree(utilitiesRoot, compatRoot);
}
console.log(`Rendered ${compatSkillsRoot} compatibility surface from ${nucleusSkillsRoot} and ${nucleusUtilitiesRoot}`);
