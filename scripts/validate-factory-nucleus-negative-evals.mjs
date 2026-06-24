#!/usr/bin/env node
// Drift guard for the Factory Nucleus negative-eval coverage map (FN-33).
//
// The map (docs/factory-nucleus/negative-evals.md) indexes each unsafe behavior
// to the guardrail-removal-sensitive eval that pins it. The eight unsafe
// behaviors are already covered by guardrail-removal-sensitive tests across the
// suite; this check keeps the map honest by parsing its eval references and
// failing if any cited eval no longer exists in its test file, so the safety
// map cannot silently rot. Wired into `npm run validate` / `npm run check` via
// the scripts/validate-*.mjs glob.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docPath = path.join(repoRoot, "docs/factory-nucleus/negative-evals.md");

// Eval reference format in the map: `<test file>` — "<test title>"
const EVAL_REF = /`(tests\/[A-Za-z0-9._/-]+\.test\.mjs)`\s+—\s+"([^"]+)"/gu;
// Each unsafe behavior is a numbered "### N." section heading.
const BEHAVIOR_HEADING = /^### \d+\.[^\n]*$/mu;
const EXPECTED_BEHAVIORS = 8;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function evaluate(doc, readFile) {
  const failures = [];

  // Require every unsafe-behavior section to cite at least one eval, so a
  // behavior cannot silently lose its coverage (heading kept, citation dropped,
  // or the `—` reference format broken).
  const sections = doc.split(BEHAVIOR_HEADING).slice(1);
  if (sections.length !== EXPECTED_BEHAVIORS) {
    failures.push(`expected ${EXPECTED_BEHAVIORS} unsafe-behavior sections, found ${sections.length}`);
  }
  sections.forEach((section, index) => {
    if ([...section.matchAll(EVAL_REF)].length === 0) {
      failures.push(`unsafe-behavior section ${index + 1} cites no eval`);
    }
  });

  const refs = [...doc.matchAll(EVAL_REF)].map((match) => ({ file: match[1], title: match[2] }));
  if (refs.length === 0) failures.push("no eval references found in the coverage map");

  const cache = new Map();
  for (const { file, title } of refs) {
    if (!cache.has(file)) {
      try {
        cache.set(file, readFile(file));
      } catch {
        cache.set(file, null);
      }
    }
    const source = cache.get(file);
    if (source === null) {
      failures.push(`missing test file: ${file}`);
      continue;
    }
    // Match an uncommented declaration: line start + optional indent + test("<title>".
    const declared = new RegExp(`^\\s*test\\("${escapeRegExp(title)}"`, "mu");
    if (!declared.test(source)) {
      failures.push(`stale reference — ${file} no longer defines: "${title}"`);
    }
  }

  return { behaviors: sections.length, checks: refs.length, failures };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    const doc = readFileSync(docPath, "utf8");
    const { behaviors, checks, failures } = evaluate(doc, (file) => readFileSync(path.join(repoRoot, file), "utf8"));
    if (failures.length) {
      console.error("Factory Nucleus negative-eval coverage map is stale:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log(
      `Factory Nucleus negative-eval coverage map verified: ${behaviors} unsafe behaviors, ${checks} guardrail evals all present`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
