import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAdapterGhost } from "../scripts/factory-nucleus/schema.mjs";
import {
  GHOST_STATES,
  TRACKER_CONTRACT,
  assessReadiness,
  bodyClosesGhost,
  branchCarriesGhostId,
  branchForGhost,
  closingKeywordForGhost,
  createInMemoryTracker,
  planBridge,
  planComment,
  planStatusUpdate,
  validateTrackerAdapter,
  verifyCloseout,
} from "../scripts/factory-nucleus/tracker.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

function world() {
  return createInMemoryTracker({
    generatedAt,
    projects: [{ id: "PRJ-1", name: "Factory Nucleus" }],
    ghosts: [
      { id: "G-1", title: "Foundation", state: "done", projectId: "PRJ-1", labels: ["feature"] },
      { id: "G-2", title: "Add tracker bind", state: "ready", projectId: "PRJ-1", dependsOn: ["G-1"], labels: ["feature"] },
      { id: "G-3", title: "Science level", state: "backlog", projectId: "PRJ-1", parentId: "G-2", dependsOn: ["G-2"] },
      { id: "G-4", title: "Blocked work", state: "ready", projectId: "PRJ-1", dependsOn: ["G-2", "G-99"] },
    ],
  });
}

test("in-memory tracker satisfies the shared tracker contract", () => {
  const tracker = world();
  assert.deepEqual(validateTrackerAdapter(tracker), { ok: true, errors: [] });

  const partial = validateTrackerAdapter({ getGhost() {} });
  assert.equal(partial.ok, false);
  assert.ok(partial.errors.includes("missing tracker primitive: getProject"), partial.errors.join("\n"));
  assert.ok(partial.errors.includes("missing tracker primitive: verifyCloseout"), partial.errors.join("\n"));

  assert.equal(validateTrackerAdapter(null).ok, false);
  for (const method of TRACKER_CONTRACT) {
    assert.equal(typeof tracker[method], "function", `expected primitive ${method}`);
  }
});

test("tracker exposes neutral ghost/project/state lookup as schema-valid artifacts", () => {
  const tracker = world();

  assert.deepEqual(tracker.getProject("PRJ-1"), { id: "PRJ-1", name: "Factory Nucleus" });
  assert.equal(tracker.getProject("missing"), null);

  const ghost = tracker.getGhost("G-3");
  assert.equal(validateAdapterGhost(ghost).ok, true);
  assert.equal(ghost.schemaVersion, 1);
  assert.equal(ghost.kind, "adapter-ghost");
  assert.equal(ghost.generatedAt, generatedAt);
  assert.equal(ghost.state, "backlog");
  assert.ok(GHOST_STATES.includes(ghost.state));
  assert.equal(ghost.projectId, "PRJ-1");
  assert.equal(ghost.parentId, "G-2");
  assert.equal(tracker.getGhost("missing"), null);

  assert.deepEqual(tracker.listGhosts({ state: "ready" }).map((g) => g.id), ["G-2", "G-4"]);
  assert.deepEqual(tracker.listGhosts({ projectId: "PRJ-1" }).map((g) => g.id), ["G-1", "G-2", "G-3", "G-4"]);
  assert.deepEqual(tracker.listGhosts({ projectId: "other" }), []);
});

test("dependency relations expose both directions without re-deriving by hand", () => {
  const tracker = world();
  assert.deepEqual(tracker.getDependencies("G-1"), { dependsOn: [], blocks: ["G-2"] });
  assert.deepEqual(tracker.getDependencies("G-2"), { dependsOn: ["G-1"], blocks: ["G-3", "G-4"] });
  assert.equal(tracker.getDependencies("missing"), null);
});

test("readiness maps neutral state plus dependency completion", () => {
  const tracker = world();
  assert.deepEqual(tracker.assessReadiness("G-2"), { ready: true, reasons: [] });

  const blocked = tracker.assessReadiness("G-4");
  assert.equal(blocked.ready, false);
  assert.ok(blocked.reasons.includes("blocked by G-2 (ready)"), blocked.reasons.join("\n"));
  assert.ok(blocked.reasons.includes("depends on unknown ghost G-99"), blocked.reasons.join("\n"));

  const notReadyState = tracker.assessReadiness("G-3");
  assert.equal(notReadyState.ready, false);
  assert.ok(notReadyState.reasons.includes("state is backlog, not ready"), notReadyState.reasons.join("\n"));

  assert.deepEqual(tracker.assessReadiness("missing"), { ready: false, reasons: ["ghost not found"] });

  // Pure helper resolves dependencies through an injected lookup.
  const ready = assessReadiness(
    { state: "ready", dependsOn: ["G-1"] },
    (id) => (id === "G-1" ? { state: "done" } : null),
  );
  assert.deepEqual(ready, { ready: true, reasons: [] });
});

test("branch/PR bridge and closeout verification carry the id with no tracker leakage", () => {
  const tracker = world();
  const bridge = tracker.planBridge({ ghostId: "G-2", branchPrefix: "factory" });
  assert.deepEqual(bridge, {
    kind: "bridge-plan",
    ghostId: "G-2",
    branch: "factory/g-2-add-tracker-bind",
    closingKeyword: "Closes G-2",
  });
  assert.ok(branchCarriesGhostId(bridge.branch, "G-2"));
  assert.equal(branchCarriesGhostId("factory/g-20-other", "G-2"), false);
  assert.equal(branchForGhost({ ghostId: "G-9", branchPrefix: "factory" }), "factory/g-9");
  assert.equal(closingKeywordForGhost("G-2"), "Closes G-2");
  assert.equal(bodyClosesGhost("Closes G-2", "G-2"), true);
  assert.equal(bodyClosesGhost("Relates to G-2", "G-2"), false);

  assert.deepEqual(
    verifyCloseout({ ghostId: "G-2", branch: bridge.branch, prBody: bridge.closingKeyword, merged: true }),
    { closed: true, reasons: [] },
  );
  assert.equal(verifyCloseout({ ghostId: "G-2", branch: "factory/other", prBody: bridge.closingKeyword, merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "G-2", branch: bridge.branch, prBody: "no keyword", merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "G-2", branch: bridge.branch, prBody: bridge.closingKeyword, merged: false }).closed, false);

  const serialized = JSON.stringify([bridge, tracker.getGhost("G-2"), tracker.listGhosts()]);
  assert.doesNotMatch(serialized, /linear|github/iu);
});

test("comment and status-update plans are inert data and never mutate seeded ghosts", () => {
  const tracker = world();
  const before = tracker.getGhost("G-2");
  const dependenciesBefore = tracker.getDependencies("G-2");

  assert.deepEqual(planComment({ ghostId: "G-2", body: "ready for review" }), {
    kind: "comment-plan",
    target: "G-2",
    body: "ready for review",
  });
  assert.deepEqual(planStatusUpdate({ projectId: "PRJ-1", body: "shipped", health: "onTrack" }), {
    kind: "status-update-plan",
    target: "PRJ-1",
    body: "shipped",
    health: "onTrack",
  });
  assert.throws(() => planStatusUpdate({ projectId: "PRJ-1", body: "x", health: "explode" }), /unknown status health/u);
  assert.throws(() => planComment({ ghostId: "G-2" }), /comment body is required/u);

  tracker.planBridge({ ghostId: "G-2", branchPrefix: "factory" });
  verifyCloseout({ ghostId: "G-2", branch: "factory/g-2", prBody: "Closes G-2", merged: true });

  assert.deepEqual(tracker.getGhost("G-2"), before);
  assert.deepEqual(tracker.getDependencies("G-2"), dependenciesBefore);
});

test("in-memory tracker rejects malformed fixture data", () => {
  assert.throws(() => createInMemoryTracker({ ghosts: [{ id: "G-1", state: "ready" }] }), /requires a projectId/u);
  assert.throws(() => createInMemoryTracker({ ghosts: [{ id: "G-1", projectId: "P", state: "nope" }] }), /unknown state/u);
  assert.throws(
    () => createInMemoryTracker({ ghosts: [{ id: "G-1", projectId: "P", state: "ready" }, { id: "G-1", projectId: "P", state: "done" }] }),
    /duplicate ghost id/u,
  );
  assert.throws(() => planBridge({ branchPrefix: "factory" }), /a ghost with an id is required/u);
});
