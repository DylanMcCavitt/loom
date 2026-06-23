// Linear tracker adapter for Factory Nucleus.
//
// Maps Linear's workflow vocabulary onto the tracker-neutral contract: an issue
// is a ghost, the workflow status type becomes a neutral state, labels and
// blocked-by relations carry over, and the project is the ghost's project. The
// adapter is a thin mapping over the in-memory reference tracker, so lookup,
// readiness, comment/status plans, the branch/PR bridge, and closeout
// verification all come from the shared contract. Closeout follows Linear's
// GitHub bridge: a branch carrying the issue id plus a PR body that closes it.
// Nothing here performs live Linear writes — fixtures in, inert plans out.

import { createInMemoryTracker } from "./tracker.mjs";

// Linear statusType -> neutral ghost state. "started" splits on the workflow
// state name so an "In Review" column reads as in-review rather than in-progress.
export function mapLinearState(issue = {}) {
  const type = issue.statusType;
  const name = String(issue.status ?? "").toLowerCase();
  switch (type) {
    case "triage":
      return "triage";
    case "backlog":
      return "backlog";
    case "unstarted":
      return "ready";
    case "started":
      return name.includes("review") ? "in-review" : "in-progress";
    case "completed":
      return "done";
    case "canceled":
      return "canceled";
    default:
      throw new Error(`unknown Linear status type: ${type}`);
  }
}

export function createLinearTracker(fixture = {}, { generatedAt } = {}) {
  const projects = (fixture.projects ?? []).map((project) => {
    if (!project?.id) throw new Error("linear project requires an id");
    return { id: project.id, name: project.name ?? project.id };
  });
  const ghosts = (fixture.issues ?? []).map((issue) => {
    if (!issue?.id) throw new Error("linear issue requires an id");
    if (!issue.projectId) throw new Error(`linear issue ${issue.id} requires a projectId`);
    const record = {
      id: issue.id,
      title: issue.title ?? issue.id,
      state: mapLinearState(issue),
      projectId: issue.projectId,
      labels: [...(issue.labels ?? [])],
      dependsOn: [...(issue.blockedBy ?? [])],
    };
    if (issue.parentId) record.parentId = issue.parentId;
    return record;
  });
  return createInMemoryTracker({ projects, ghosts, generatedAt });
}
