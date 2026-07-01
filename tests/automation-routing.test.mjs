import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ompSourceRoot } from "../scripts/lib/layout.mjs";
const { routeIntent } = await import(new URL(`../${ompSourceRoot}/extensions/workflow-routing.js`, import.meta.url));

const fixtures = JSON.parse(readFileSync(new URL("fixtures/automation-routing.json", import.meta.url), "utf8"));

test("automation routing fixtures select expected skills", () => {
  for (const fixture of fixtures) {
    const result = routeIntent(fixture.input);
    for (const expected of fixture.expectedRoutes) {
      assert.ok(
        result.routes.includes(expected),
        `${fixture.input}: expected ${expected}, got ${result.routes.join(", ")}`,
      );
    }
  }
});

test("automation routing fixtures protect existing specialized skills", () => {
  for (const fixture of fixtures) {
    const result = routeIntent(fixture.input);
    for (const forbidden of fixture.forbiddenRoutes) {
      assert.ok(
        !result.routes.includes(forbidden),
        `${fixture.input}: forbidden ${forbidden} was selected by ${result.routes.join(", ")}`,
      );
    }
  }
});
