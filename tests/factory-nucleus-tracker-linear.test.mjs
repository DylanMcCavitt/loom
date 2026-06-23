import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAdapterGhost } from "../scripts/factory-nucleus/schema.mjs";
import { validateTrackerAdapter, verifyCloseout } from "../scripts/factory-nucleus/tracker.mjs";
import { createLinearTracker, mapLinearState } from "../scripts/factory-nucleus/tracker-linear.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

// A local Linear fixture shaped like the Linear MCP issue payload.
function linear() {
  return createLinearTracker({
    projects: [{ id: "PRJ-FN", name: "Factory Nucleus" }],
    issues: [
      { id: "LOO-1", title: "Foundation", projectId: "PRJ-FN", status: "Done", statusType: "completed", labels: ["Feature"] },
      { id: "LOO-2", title: "Tracker bind", projectId: "PRJ-FN", status: "Todo", statusType: "unstarted", labels: ["Feature", "AFK"], blockedBy: ["LOO-1"] },
      { id: "LOO-3", title: "Science level", projectId: "PRJ-FN", status: "In Review", statusType: "started", blockedBy: ["LOO-2"] },
      { id: "LOO-4", title: "Adapters", projectId: "PRJ-FN", status: "Backlog", statusType: "backlog" },
      { id: "LOO-5", title: "Dropped", projectId: "PRJ-FN", status: "Canceled", statusType: "canceled" },
      { id: "LOO-6", title: "Incoming", projectId: "PRJ-FN", status: "Triage", statusType: "triage" },
    ],
  }, { generatedAt });
}

test("linear adapter satisfies the shared tracker contract", () => {
  assert.deepEqual(validateTrackerAdapter(linear()), { ok: true, errors: [] });
});

test("linear identity, project, state, labels, and relations map to neutral primitives", () => {
  const tracker = linear();

  assert.deepEqual(tracker.getProject("PRJ-FN"), { id: "PRJ-FN", name: "Factory Nucleus" });

  const ghost = tracker.getGhost("LOO-2");
  assert.equal(validateAdapterGhost(ghost).ok, true, validateAdapterGhost(ghost).errors.join("\n"));
  assert.equal(ghost.id, "LOO-2", "Linear issue identity is preserved");
  assert.equal(ghost.projectId, "PRJ-FN");
  assert.equal(ghost.state, "ready");
  assert.deepEqual(ghost.labels, ["Feature", "AFK"], "Linear labels are preserved");

  // statusType -> neutral state mapping across the workflow.
  assert.equal(tracker.getGhost("LOO-1").state, "done");
  assert.equal(tracker.getGhost("LOO-3").state, "in-review");
  assert.equal(tracker.getGhost("LOO-4").state, "backlog");
  assert.equal(tracker.getGhost("LOO-5").state, "canceled");
  assert.equal(tracker.getGhost("LOO-6").state, "triage");

  // Relations: blockedBy -> dependsOn, with the inverse blocks edge derived.
  assert.deepEqual(tracker.getDependencies("LOO-1"), { dependsOn: [], blocks: ["LOO-2"] });
  assert.deepEqual(tracker.getDependencies("LOO-2"), { dependsOn: ["LOO-1"], blocks: ["LOO-3"] });

  assert.equal(mapLinearState({ statusType: "started", status: "In Progress" }), "in-progress");
  assert.throws(() => mapLinearState({ statusType: "weird" }), /unknown Linear status type/u);
});

test("linear readiness honors neutral state plus dependency completion", () => {
  const tracker = linear();
  assert.deepEqual(tracker.assessReadiness("LOO-2"), { ready: true, reasons: [] });

  const inReview = tracker.assessReadiness("LOO-3");
  assert.equal(inReview.ready, false);
  assert.ok(inReview.reasons.includes("state is in-review, not ready"), inReview.reasons.join("\n"));
});

test("linear comment/status plans are inert and never mutate the fixture", () => {
  const tracker = linear();
  const before = tracker.getGhost("LOO-2");

  assert.deepEqual(tracker.planComment({ ghostId: "LOO-2", body: "ready for agent" }), {
    kind: "comment-plan",
    target: "LOO-2",
    body: "ready for agent",
  });
  assert.deepEqual(tracker.planStatusUpdate({ projectId: "PRJ-FN", body: "milestone 04 underway" }), {
    kind: "status-update-plan",
    target: "PRJ-FN",
    body: "milestone 04 underway",
    health: "onTrack",
  });

  assert.deepEqual(tracker.getGhost("LOO-2"), before);
});

test("linear closeout uses the Linear/GitHub bridge semantics", () => {
  const tracker = linear();
  const bridge = tracker.planBridge({ ghostId: "LOO-2", branchPrefix: "dylanmccavitt2015" });
  assert.deepEqual(bridge, {
    kind: "bridge-plan",
    ghostId: "LOO-2",
    branch: "dylanmccavitt2015/loo-2-tracker-bind",
    closingKeyword: "Closes LOO-2",
  });

  assert.equal(verifyCloseout({ ghostId: "LOO-2", branch: bridge.branch, prBody: `${bridge.closingKeyword}\n`, merged: true }).closed, true);
  assert.equal(verifyCloseout({ ghostId: "LOO-2", branch: "dylanmccavitt2015/loo-20-other", prBody: bridge.closingKeyword, merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "LOO-2", branch: bridge.branch, prBody: "no keyword", merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "LOO-2", branch: bridge.branch, prBody: bridge.closingKeyword, merged: false }).closed, false);
});
