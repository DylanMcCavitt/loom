import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAdapterGhost } from "../scripts/factory-nucleus/schema.mjs";
import { validateTrackerAdapter, verifyCloseout } from "../scripts/factory-nucleus/tracker.mjs";
import { createGithubTracker, mapGithubState } from "../scripts/factory-nucleus/tracker-github.mjs";

const generatedAt = "2026-06-23T00:00:00.000Z";

// A local GitHub Issues fixture; mirrors the Linear adapter contract assertions.
function github() {
  return createGithubTracker({
    repo: "acme/widgets",
    issues: [
      { number: 1, title: "Foundation", state: "closed", labels: ["feature"] },
      { number: 2, title: "Tracker bind", state: "open", labels: ["ready-for-agent", "feature"], blockedBy: [1] },
      { number: 3, title: "Science level", state: "open", labels: ["ready-for-human"], blockedBy: [2] },
      { number: 4, title: "Adapters", state: "open", labels: [] },
      { number: 5, title: "Dropped", state: "closed", stateReason: "not_planned", labels: [] },
      { number: 6, title: "Incoming", state: "open", labels: ["triage"] },
    ],
  }, { generatedAt });
}

test("github adapter satisfies the shared tracker contract", () => {
  assert.deepEqual(validateTrackerAdapter(github()), { ok: true, errors: [] });
});

test("github issue identity and labels map to neutral primitives without GitHub Projects", () => {
  const tracker = github();

  // The repo is the project identity; no GitHub Projects entity is involved.
  assert.deepEqual(tracker.getProject("acme/widgets"), { id: "acme/widgets", name: "acme/widgets" });

  const ghost = tracker.getGhost("#2");
  assert.equal(validateAdapterGhost(ghost).ok, true, validateAdapterGhost(ghost).errors.join("\n"));
  assert.equal(ghost.id, "#2", "GitHub issue number is preserved as the ghost id");
  assert.equal(ghost.projectId, "acme/widgets");
  assert.equal(ghost.state, "ready");
  assert.deepEqual(ghost.labels, ["ready-for-agent", "feature"], "GitHub labels are preserved");

  // open/closed + readiness labels -> neutral state.
  assert.equal(tracker.getGhost("#1").state, "done");
  assert.equal(tracker.getGhost("#3").state, "in-review");
  assert.equal(tracker.getGhost("#4").state, "backlog");
  assert.equal(tracker.getGhost("#5").state, "canceled");
  assert.equal(tracker.getGhost("#6").state, "triage");

  // Dependency representation: blockedBy -> dependsOn with the inverse blocks edge derived.
  assert.deepEqual(tracker.getDependencies("#1"), { dependsOn: [], blocks: ["#2"] });
  assert.deepEqual(tracker.getDependencies("#2"), { dependsOn: ["#1"], blocks: ["#3"] });

  assert.equal(mapGithubState({ state: "open", labels: ["in-progress"] }), "in-progress");
  assert.equal(mapGithubState({ state: "closed" }), "done");
});

test("github readiness honors neutral state plus dependency completion", () => {
  const tracker = github();
  assert.deepEqual(tracker.assessReadiness("#2"), { ready: true, reasons: [] });

  const inReview = tracker.assessReadiness("#3");
  assert.equal(inReview.ready, false);
  assert.ok(inReview.reasons.includes("state is in-review, not ready"), inReview.reasons.join("\n"));
});

test("github comment/status plans are inert and never mutate the fixture", () => {
  const tracker = github();
  const before = tracker.getGhost("#2");

  assert.deepEqual(tracker.planComment({ ghostId: "#2", body: "ready for agent" }), {
    kind: "comment-plan",
    target: "#2",
    body: "ready for agent",
  });
  assert.deepEqual(tracker.planStatusUpdate({ projectId: "acme/widgets", body: "baseline" }), {
    kind: "status-update-plan",
    target: "acme/widgets",
    body: "baseline",
    health: "onTrack",
  });

  assert.deepEqual(tracker.getGhost("#2"), before);
});

test("github plans the close-keyword branch bridge and verifies closeout", () => {
  const tracker = github();
  const bridge = tracker.planBridge({ ghostId: "#2", branchPrefix: "acme" });
  assert.deepEqual(bridge, {
    kind: "bridge-plan",
    ghostId: "#2",
    branch: "acme/2-tracker-bind",
    closingKeyword: "Closes #2",
  });

  assert.equal(verifyCloseout({ ghostId: "#2", branch: bridge.branch, prBody: `${bridge.closingKeyword}\n`, merged: true }).closed, true);
  // Number boundary: #2 must not match issue #20.
  assert.equal(verifyCloseout({ ghostId: "#2", branch: "acme/20-other", prBody: "Closes #20", merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "#2", branch: bridge.branch, prBody: "no keyword", merged: true }).closed, false);
  assert.equal(verifyCloseout({ ghostId: "#2", branch: bridge.branch, prBody: bridge.closingKeyword, merged: false }).closed, false);
});
