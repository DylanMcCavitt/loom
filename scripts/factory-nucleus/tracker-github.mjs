// GitHub Issues tracker adapter for Factory Nucleus.
//
// Maps GitHub Issues onto the tracker-neutral contract: an issue is a ghost
// keyed by its `#<number>` reference (so the bridge's "Closes #N" keyword and
// branch id work directly), open/closed plus readiness labels become a neutral
// state, labels and blocked-by references carry over, and the repo is the
// ghost's project (GitHub Projects is deliberately unused). The adapter is a
// thin mapping over the in-memory reference tracker, so lookup, readiness,
// comment/status plans, the close-keyword branch bridge, and closeout
// verification come from the shared contract. Fixtures in, inert plans out —
// no live GitHub writes.

import { createInMemoryTracker } from "./tracker.mjs";

const READINESS_LABEL_STATES = Object.freeze([
  ["in-review", "in-review"],
  ["ready-for-human", "in-review"],
  ["in-progress", "in-progress"],
  ["ready-for-agent", "ready"],
  ["ready", "ready"],
  ["triage", "triage"],
  ["needs-triage", "triage"],
]);

// GitHub open/closed + readiness labels -> neutral ghost state. Closed issues
// map to done unless closed as "not planned" (canceled). Open issues take the
// first matching readiness label, else backlog.
export function mapGithubState(issue = {}) {
  if (issue.state === "closed") {
    return issue.stateReason === "not_planned" ? "canceled" : "done";
  }
  const labels = new Set((issue.labels ?? []).map((label) => String(label).toLowerCase()));
  for (const [label, state] of READINESS_LABEL_STATES) {
    if (labels.has(label)) return state;
  }
  return "backlog";
}

function ghostId(number) {
  return `#${number}`;
}

export function createGithubTracker(fixture = {}, { generatedAt } = {}) {
  if (!fixture.repo) throw new Error("github fixture requires a repo");
  const repo = fixture.repo;
  const ghosts = (fixture.issues ?? []).map((issue) => {
    if (issue?.number === undefined || issue.number === null) throw new Error("github issue requires a number");
    const record = {
      id: ghostId(issue.number),
      title: issue.title ?? ghostId(issue.number),
      state: mapGithubState(issue),
      projectId: repo,
      labels: [...(issue.labels ?? [])],
      dependsOn: (issue.blockedBy ?? []).map((ref) => (typeof ref === "number" ? ghostId(ref) : ref)),
    };
    if (issue.parentNumber !== undefined && issue.parentNumber !== null) record.parentId = ghostId(issue.parentNumber);
    return record;
  });
  return createInMemoryTracker({ projects: [{ id: repo, name: repo }], ghosts, generatedAt });
}
