#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { routeIntent } from "../adapters/omp/source/extensions/workflow-routing.js";
import { recipeCount } from "../adapters/omp/source/extensions/workflow-recipes.js";
import { parseFrontmatter } from "./lib/frontmatter.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const ROUTING_FIXTURES = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/automation-routing.json"), "utf8"));
// Single source of truth: the repo nucleus/skills directory is the canonical skill home for all
// harnesses. The former "do not vendor these global skills into the repo" penalty is
// obsolete under consolidation; duplicate overlap now means a name that appears twice.

function localSkillNames() {
  const skillsDir = path.join(ROOT, "nucleus/skills");
  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        return parseFrontmatter(readFileSync(skillPath, "utf8"))?.values.name || entry.name;
      })
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function duplicateSkillOverlapCount() {
  const names = localSkillNames();
  const seen = new Set();
  let overlaps = 0;
  for (const name of names) {
    if (seen.has(name)) overlaps += 1;
    seen.add(name);
  }
  return overlaps;
}

function routeAccuracyScore() {
  let checks = 0;
  let passed = 0;
  for (const fixture of ROUTING_FIXTURES) {
    const routes = routeIntent(fixture.input).routes;
    for (const expected of fixture.expectedRoutes) {
      checks += 1;
      if (routes.includes(expected)) passed += 1;
    }
    for (const forbidden of fixture.forbiddenRoutes) {
      checks += 1;
      if (!routes.includes(forbidden)) passed += 1;
    }
  }
  return checks ? passed / checks : 0;
}

function unsafeAutonomyViolations() {
  const sources = [
    "adapters/omp/source/extensions/workflow-routing.js",
    "adapters/omp/source/extensions/workflow-recipes.js",
  ].map((relativePath) => readFileSync(path.join(ROOT, relativePath), "utf8"));
  const rawSpawn = /\bBun\.spawn\b|\bspawnSync\b|\bexecFile(?:Sync)?\b|\bexecSync\b|\bchild_process\b/u;
  const mutatingGit = /"(?:push|commit|checkout|switch|reset|rebase|merge|stash|clean|tag)"|"branch",\s*"-[dD]"/u;
  const mutatingGh = /"issue",\s*"(?:create|edit|close|comment|reopen|delete)"|"pr",\s*"(?:create|merge|close|edit)"/u;
  return sources.filter((source) => rawSpawn.test(source) || mutatingGit.test(source) || mutatingGh.test(source)).length;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

async function main() {
  const route_accuracy_score = routeAccuracyScore();
  const duplicate_skill_overlap_count = duplicateSkillOverlapCount();
  const unsafe_autonomy_violations = unsafeAutonomyViolations();
  const spawn_recipe_count = recipeCount();

  const automation_workflow_friction = Math.round(
    (1 - route_accuracy_score) * 100
      + duplicate_skill_overlap_count * 1000
      + unsafe_autonomy_violations * 1000
      + Math.max(0, 5 - spawn_recipe_count) * 10,
  );

  const metrics = {
    automation_workflow_friction,
    route_accuracy_score,
    duplicate_skill_overlap_count,
    unsafe_autonomy_violations,
    spawn_recipe_count,
  };

  for (const [name, value] of Object.entries(metrics)) {
    metrics[name] = finite(value);
  }

  const hardChecks = [
    ["duplicate_skill_overlap_count=0", metrics.duplicate_skill_overlap_count === 0],
    ["unsafe_autonomy_violations=0", metrics.unsafe_autonomy_violations === 0],
  ];

  for (const [name, ok] of hardChecks) {
    console.log(`CHECK ${name} ${ok ? "ok" : "fail"}`);
  }
  for (const [name, value] of Object.entries(metrics)) {
    console.log(`METRIC ${name}=${value}`);
  }

  if (hardChecks.some(([, ok]) => !ok)) process.exit(1);
}

await main();
