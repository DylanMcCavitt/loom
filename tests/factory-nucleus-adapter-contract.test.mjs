// Adapter contract evals for the Linear and GitHub Issues tracker adapters.
//
// The per-adapter suites prove each adapter in isolation. This eval proves the
// two are INTERCHANGEABLE behind the tracker-neutral contract: the same logical
// ghost world, expressed in each provider's native fixture JSON, must yield the
// same neutral resolution, readiness, branch/PR bridge, comment/status plans,
// and closeout semantics. A single parameterized suite runs the common
// assertions against both providers (keyed by neutral role, since native ids
// differ), then adapter-specific identity/state/label assertions cover what is
// unique to each provider. Fixtures are local JSON only — no live API calls.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { validateAdapterGhost } from "../scripts/factory-nucleus/schema.mjs";
import {
  bodyClosesGhost,
  branchCarriesGhostId,
  validateTrackerAdapter,
  verifyCloseout,
} from "../scripts/factory-nucleus/tracker.mjs";
import { createLinearTracker, mapLinearState } from "../scripts/factory-nucleus/tracker-linear.mjs";
import { createGithubTracker, mapGithubState } from "../scripts/factory-nucleus/tracker-github.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";
const branchPrefix = "dylanmccavitt2015";

// Local fixture JSON only — these are inert data, never live tracker reads.
const linearFixture = JSON.parse(readFileSync(new URL("fixtures/adapter-linear.json", import.meta.url), "utf8"));
const githubFixture = JSON.parse(readFileSync(new URL("fixtures/adapter-github.json", import.meta.url), "utf8"));

// Each provider expresses the SAME logical world. `roles` maps a neutral role to
// the provider's native ghost id so one assertion suite can prove parity.
const cases = [
  {
    name: "linear",
    tracker: createLinearTracker(linearFixture, { generatedAt }),
    project: "PRJ-FN",
    roles: { foundation: "LOO-1", ready: "LOO-2", inReview: "LOO-3", backlog: "LOO-4", canceled: "LOO-5", triage: "LOO-6" },
    labels: ["Feature", "AFK"],
  },
  {
    name: "github",
    tracker: createGithubTracker(githubFixture, { generatedAt }),
    project: "acme/widgets",
    roles: { foundation: "#1", ready: "#2", inReview: "#3", backlog: "#4", canceled: "#5", triage: "#6" },
    labels: ["ready-for-agent", "feature"],
  },
];

// === Common contract assertions, run against every adapter ===

for (const { name, tracker, project, roles, labels } of cases) {
  test(`${name} adapter satisfies the shared tracker contract`, () => {
    assert.deepEqual(validateTrackerAdapter(tracker), { ok: true, errors: [] });
  });

  test(`${name} resolves ghosts and project as schema-valid neutral artifacts`, () => {
    assert.equal(tracker.getProject(project).id, project);
    assert.equal(tracker.getGhost("does-not-exist"), null);

    const ready = tracker.getGhost(roles.ready);
    const check = validateAdapterGhost(ready);
    assert.equal(check.ok, true, check.errors.join("\n"));
    assert.equal(ready.kind, "adapter-ghost");
    assert.equal(ready.id, roles.ready);
    assert.equal(ready.projectId, project);

    // The native workflow maps onto the neutral state vocabulary identically.
    assert.equal(ready.state, "ready");
    assert.equal(tracker.getGhost(roles.foundation).state, "done");
    assert.equal(tracker.getGhost(roles.inReview).state, "in-review");
    assert.equal(tracker.getGhost(roles.backlog).state, "backlog");
    assert.equal(tracker.getGhost(roles.canceled).state, "canceled");
    assert.equal(tracker.getGhost(roles.triage).state, "triage");

    // Dependency relations expose both directions identically.
    assert.deepEqual(tracker.getDependencies(roles.foundation), { dependsOn: [], blocks: [roles.ready] });
    assert.deepEqual(tracker.getDependencies(roles.ready), { dependsOn: [roles.foundation], blocks: [roles.inReview] });
  });

  test(`${name} readiness honors neutral state plus dependency completion`, () => {
    // Ready state + a done dependency -> ready.
    assert.deepEqual(tracker.assessReadiness(roles.ready), { ready: true, reasons: [] });

    // Wrong state -> not ready, with a neutral reason that names the state.
    const inReview = tracker.assessReadiness(roles.inReview);
    assert.equal(inReview.ready, false);
    assert.ok(inReview.reasons.includes("state is in-review, not ready"), inReview.reasons.join("\n"));
  });

  test(`${name} plans an id-carrying branch/PR bridge`, () => {
    const bridge = tracker.planBridge({ ghostId: roles.ready, branchPrefix });
    assert.equal(bridge.kind, "bridge-plan");
    assert.equal(bridge.ghostId, roles.ready);
    assert.ok(branchCarriesGhostId(bridge.branch, roles.ready), bridge.branch);
    assert.equal(bridge.closingKeyword, `Closes ${roles.ready}`);
  });

  test(`${name} comment/status plans are inert and never mutate the fixture`, () => {
    const before = tracker.getGhost(roles.ready);

    assert.deepEqual(tracker.planComment({ ghostId: roles.ready, body: "ready for agent" }), {
      kind: "comment-plan",
      target: roles.ready,
      body: "ready for agent",
    });
    assert.deepEqual(tracker.planStatusUpdate({ projectId: project, body: "milestone underway" }), {
      kind: "status-update-plan",
      target: project,
      body: "milestone underway",
      health: "onTrack",
    });

    assert.deepEqual(tracker.getGhost(roles.ready), before);
  });

  test(`${name} verifies closeout only when branch, closing keyword, and merge all hold`, () => {
    const bridge = tracker.planBridge({ ghostId: roles.ready, branchPrefix });

    assert.equal(verifyCloseout({ ghostId: roles.ready, branch: bridge.branch, prBody: `${bridge.closingKeyword}\n`, merged: true }).closed, true);
    assert.equal(verifyCloseout({ ghostId: roles.ready, branch: "wrong/branch", prBody: bridge.closingKeyword, merged: true }).closed, false);
    assert.equal(verifyCloseout({ ghostId: roles.ready, branch: bridge.branch, prBody: "no keyword", merged: true }).closed, false);
    assert.equal(verifyCloseout({ ghostId: roles.ready, branch: bridge.branch, prBody: bridge.closingKeyword, merged: false }).closed, false);

    // Provider labels carry over to the neutral ghost verbatim.
    assert.deepEqual(tracker.getGhost(roles.ready).labels, labels);
  });
}

// === Adapter-specific identity / state / label assertions ===

test("linear-specific: issue identity, statusType mapping, and labels", () => {
  const tracker = cases[0].tracker;

  // Identity: the Linear issue id is the ghost id verbatim.
  assert.equal(tracker.getGhost("LOO-2").id, "LOO-2");

  // State: the "started" type splits in-progress vs in-review on the workflow name.
  assert.equal(mapLinearState({ statusType: "unstarted", status: "Todo" }), "ready");
  assert.equal(mapLinearState({ statusType: "started", status: "In Progress" }), "in-progress");
  assert.equal(mapLinearState({ statusType: "started", status: "In Review" }), "in-review");
  assert.throws(() => mapLinearState({ statusType: "weird" }), /unknown Linear status type/u);

  // Labels: Linear labels are preserved verbatim.
  assert.deepEqual(tracker.getGhost("LOO-2").labels, ["Feature", "AFK"]);
});

test("github-specific: #number identity, label/state mapping, and close keyword", () => {
  const tracker = cases[1].tracker;

  // Identity: the GitHub issue number becomes the #N ghost id.
  assert.equal(tracker.getGhost("#2").id, "#2");

  // State: open + readiness label, plain open, closed, and closed-as-not-planned.
  assert.equal(mapGithubState({ state: "open", labels: ["in-progress"] }), "in-progress");
  assert.equal(mapGithubState({ state: "open", labels: [] }), "backlog");
  assert.equal(mapGithubState({ state: "closed" }), "done");
  assert.equal(mapGithubState({ state: "closed", stateReason: "not_planned" }), "canceled");

  // Labels: GitHub labels are preserved verbatim.
  assert.deepEqual(tracker.getGhost("#2").labels, ["ready-for-agent", "feature"]);

  // Close keyword: the GitHub "#N" form satisfies the bridge and closes out.
  assert.ok(bodyClosesGhost("Closes #2", "#2"));
  const bridge = tracker.planBridge({ ghostId: "#2", branchPrefix });
  assert.equal(bridge.closingKeyword, "Closes #2");
  assert.equal(verifyCloseout({ ghostId: "#2", branch: bridge.branch, prBody: bridge.closingKeyword, merged: true }).closed, true);
});
