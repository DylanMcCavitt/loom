import assert from "node:assert/strict";
import { test } from "node:test";

const frontmatterModule = await import("../scripts/lib/frontmatter.mjs").catch((error) => ({ importError: error }));

function parseFrontmatter(content) {
  assert.ifError(frontmatterModule.importError);
  assert.equal(
    typeof frontmatterModule.parseFrontmatter,
    "function",
    "../scripts/lib/frontmatter.mjs must export function parseFrontmatter",
  );
  return frontmatterModule.parseFrontmatter(content);
}

test("detects only a leading closed frontmatter delimiter", () => {
  const parsed = parseFrontmatter("---\nname: tester\n---\n# Body\n");
  assert.ok(parsed, "closed leading frontmatter should parse");
  assert.equal(parsed.frontmatter, "name: tester");
  assert.equal(parseFrontmatter("intro\n---\nname: tester\n---\n"), null);
});

test("extracts simple keys and values", () => {
  const parsed = parseFrontmatter("---\nname: tester\ndescription: Use when parsing frontmatter\n---\n# Body\n");
  assert.deepEqual(parsed.keys, ["name", "description"]);
  assert.deepEqual(parsed.values, {
    name: "tester",
    description: "Use when parsing frontmatter",
  });
  assert.deepEqual(parsed.data, parsed.values);
  assert.deepEqual(parsed.invalidLines, []);
});

test("parses inline array values", () => {
  const parsed = parseFrontmatter("---\ntools: [Read, Grep, Bash]\n---\n# Body\n");
  assert.deepEqual(parsed.values.tools, ["Read", "Grep", "Bash"]);
});

test("parses nested metadata string maps", () => {
  const parsed = parseFrontmatter([
    "---",
    "name: tester",
    "metadata:",
    "  version: \"0.1.0\"",
    "  changelog: \"0.1.0 - initial public release\"",
    "---",
    "# Body",
    "",
  ].join("\n"));

  assert.deepEqual(parsed.values.metadata, {
    version: "0.1.0",
    changelog: "0.1.0 - initial public release",
  });
  assert.deepEqual(parsed.invalidLines, []);
});

test("parses block scalar values without treating continuation lines as keys", () => {
  const parsed = parseFrontmatter([
    "---",
    "description: |",
    "  Use when the parser sees a YAML block scalar.",
    "  Preserve the semantic text.",
    "name: tester",
    "---",
    "# Body",
    "",
  ].join("\n"));

  assert.equal(
    parsed.values.description,
    "Use when the parser sees a YAML block scalar.\nPreserve the semantic text.",
  );
  assert.deepEqual(parsed.keys, ["description", "name"]);
  assert.deepEqual(parsed.invalidLines, []);
});

test("returns null for a missing closing fence", () => {
  assert.equal(parseFrontmatter("---\nname: tester\n# Body without a closing fence\n"), null);
});

test("returns null when the document has no frontmatter", () => {
  assert.equal(parseFrontmatter("# Body\n---\nnot: frontmatter\n"), null);
});

test("preserves body text and reports the body offset after the closing fence", () => {
  const content = "---\nname: tester\n---\n# Body\n\nKeep exact bytes.\n";
  const parsed = parseFrontmatter(content);
  const expectedOffset = content.indexOf("# Body");
  assert.equal(parsed.bodyOffset, expectedOffset);
  assert.equal(parsed.body, content.slice(expectedOffset));
});
