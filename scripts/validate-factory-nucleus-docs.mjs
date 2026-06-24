#!/usr/bin/env node
// Docs/reference check for the Factory Nucleus tracker-modes doc (FN-42).
//
// Confirms the public tracker-modes reference stays in sync with the CLI and
// the V1 framing: it names every current `factory.mjs` command and states the
// GitHub-Issues-baseline / Linear-control-plane split, the public-CLI deferral,
// and the V1 non-goals. Requiring both the "public baseline" and "control
// plane" framing is what keeps the doc from regressing into a stale
// single-tracker planning claim. The command list is sourced from factory.mjs
// (not hardcoded), so a rename the doc misses fails this check. Wired into
// `npm run validate` / `npm run check` via the scripts/validate-*.mjs glob.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docPath = fileURLToPath(new URL("../docs/factory-nucleus/tracker-modes.md", import.meta.url));
const factoryPath = fileURLToPath(new URL("./factory-nucleus/factory.mjs", import.meta.url));

// Pull the canonical command list from factory.mjs's USAGE `<a|b|c>` group so
// this check tracks the real router instead of a duplicated literal.
export function parseCommands(factorySource) {
  const match = factorySource.match(/<([a-z][a-z|-]*)>/);
  if (!match) return [];
  return match[1].split("|").map((name) => name.trim()).filter(Boolean);
}

// Framing the public doc MUST state (lowercased substring match).
const REQUIRED_PHRASES = Object.freeze([
  ["tracker-neutral contract", "tracker-neutral"],
  ["GitHub Issues public baseline", "public baseline"],
  ["GitHub baseline semantics section", "baseline semantics"],
  ["Linear preferred/private control plane", "control plane"],
  ["public CLI deferral", "public cli deferral"],
  ["V1 non-goals", "v1 non-goals"],
  ["GitHub Projects non-goal", "github projects"],
  ["live smoke not the default path", "live smoke"],
]);

export function evaluate({ doc, factorySource }) {
  const failures = [];
  const lower = doc.toLowerCase();

  const commands = parseCommands(factorySource);
  if (commands.length === 0) {
    failures.push("commands: could not parse the command list from factory.mjs USAGE");
  }
  for (const command of commands) {
    if (!doc.includes(`\`${command}\``)) {
      failures.push(`command: doc does not name current command \`${command}\``);
    }
  }

  for (const [label, phrase] of REQUIRED_PHRASES) {
    if (!lower.includes(phrase)) failures.push(`missing: ${label} ("${phrase}")`);
  }
  const checks = 1 + commands.length + REQUIRED_PHRASES.length;
  return { checks, commands, failures };
}

const invokedDirectly = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  try {
    const doc = readFileSync(docPath, "utf8");
    const factorySource = readFileSync(factoryPath, "utf8");
    const { checks, commands, failures } = evaluate({ doc, factorySource });
    if (failures.length) {
      console.error("Factory Nucleus docs/reference check failed:");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exit(1);
    }
    console.log(
      `Factory Nucleus docs/reference check passed: ${checks} checks; doc names all ${commands.length} commands (${commands.join(", ")})`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
