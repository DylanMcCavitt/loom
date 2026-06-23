// Tiny synthetic Node "golden" factory fixture for Factory Nucleus.
//
// A minimal but complete Node repo shape — package scripts (build/test/lint),
// a source module, a test, and a CI workflow — suitable for scan and plan
// assertions. It is deliberately synthetic (not a real repo snapshot) and holds
// no secrets. The fixture is data (path -> content); `materializeGoldenFactory`
// writes it into a directory so a test can scan/plan against a real tree.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const packageJson = `${JSON.stringify({
  name: "golden-factory",
  version: "0.0.0",
  private: true,
  type: "module",
  scripts: {
    build: "node --check src/index.mjs",
    test: "node --test test/",
    lint: "node --check src/index.mjs",
  },
}, null, 2)}\n`;

export const GOLDEN_FACTORY_FILES = Object.freeze({
  "package.json": packageJson,
  "src/index.mjs": "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n",
  "test/index.test.mjs": [
    'import assert from "node:assert/strict";',
    'import { test } from "node:test";',
    "",
    'import { greet } from "../src/index.mjs";',
    "",
    'test("greet builds a friendly message", () => {',
    '  assert.equal(greet("factory"), "Hello, factory!");',
    "});",
    "",
  ].join("\n"),
  ".github/workflows/ci.yml": [
    "name: ci",
    "on:",
    "  push:",
    "  pull_request:",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: actions/setup-node@v4",
    "      - run: node --test test/",
    "",
  ].join("\n"),
  "README.md": "# golden-factory\n\nTiny synthetic Node factory fixture for Factory Nucleus scan and plan assertions.\n",
});

export const GOLDEN_FACTORY_PATHS = Object.freeze(Object.keys(GOLDEN_FACTORY_FILES).sort());

export function materializeGoldenFactory(root) {
  if (!root) throw new Error("a destination root is required to materialize the golden factory");
  const written = [];
  for (const [relativePath, content] of Object.entries(GOLDEN_FACTORY_FILES)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    written.push(relativePath);
  }
  return written.sort();
}
