// Tracker-neutral primitives for Factory Nucleus.
//
// V1 ships one provider-agnostic contract for working with planning "ghosts"
// (issues/tickets) so the Linear adapter (FN-16) and the GitHub Issues adapter
// (FN-17) can satisfy a single interface. Nothing here knows the words "Linear"
// or "GitHub": ids, states, projects, and the branch/PR bridge are all neutral.
// Comment, status-update, and bridge primitives PLAN writes as inert data;
// concrete adapters perform them later.

import { GHOST_STATES, validateAdapterGhost, withArtifactMetadata } from "./schema.mjs";

export { GHOST_STATES };

// Methods every tracker adapter must implement to satisfy the shared contract.
export const TRACKER_CONTRACT = Object.freeze([
  "getProject",
  "getGhost",
  "listGhosts",
  "getDependencies",
  "assessReadiness",
  "planComment",
  "planStatusUpdate",
  "planBridge",
  "verifyCloseout",
]);

export const STATUS_HEALTH = Object.freeze(["onTrack", "atRisk", "offTrack"]);

const READY_STATE = "ready";
const DONE_STATE = "done";

export function validateTrackerAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return { ok: false, errors: ["tracker adapter must be an object"] };
  }
  const errors = TRACKER_CONTRACT
    .filter((method) => typeof adapter[method] !== "function")
    .map((method) => `missing tracker primitive: ${method}`);
  return { ok: errors.length === 0, errors };
}

function slugSegment(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "");
}

export function branchForGhost({ ghostId, title = "", branchPrefix } = {}) {
  if (!ghostId) throw new Error("ghostId is required to plan a branch");
  if (!branchPrefix) throw new Error("branchPrefix is required to plan a branch");
  const idSlug = slugSegment(ghostId);
  const titleSlug = slugSegment(title);
  const tail = titleSlug ? `${idSlug}-${titleSlug}` : idSlug;
  return `${slugSegment(branchPrefix)}/${tail}`;
}

export function closingKeywordForGhost(ghostId) {
  if (!ghostId) throw new Error("ghostId is required to plan a closing keyword");
  return `Closes ${ghostId}`;
}

export function branchCarriesGhostId(branch, ghostId) {
  if (!branch || !ghostId) return false;
  const idSlug = slugSegment(ghostId);
  if (!idSlug) return false;
  return new RegExp(`(^|-)${idSlug}(-|$)`, "u").test(slugSegment(branch));
}

export function bodyClosesGhost(body, ghostId) {
  if (!body || !ghostId) return false;
  const escaped = ghostId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#?${escaped}\\b`, "iu").test(body);
}

export function assessReadiness(ghost, lookup = () => null) {
  if (!ghost) return { ready: false, reasons: ["ghost not found"] };
  const reasons = [];
  if (ghost.state !== READY_STATE) reasons.push(`state is ${ghost.state}, not ${READY_STATE}`);
  for (const dependencyId of ghost.dependsOn ?? []) {
    const dependency = lookup(dependencyId);
    if (!dependency) reasons.push(`depends on unknown ghost ${dependencyId}`);
    else if (dependency.state !== DONE_STATE) reasons.push(`blocked by ${dependencyId} (${dependency.state})`);
  }
  return { ready: reasons.length === 0, reasons };
}

export function planComment({ ghostId, body } = {}) {
  if (!ghostId) throw new Error("ghostId is required to plan a comment");
  if (!body) throw new Error("comment body is required to plan a comment");
  return Object.freeze({ kind: "comment-plan", target: ghostId, body });
}

export function planStatusUpdate({ projectId, body, health = "onTrack" } = {}) {
  if (!projectId) throw new Error("projectId is required to plan a status update");
  if (!body) throw new Error("status update body is required to plan a status update");
  if (!STATUS_HEALTH.includes(health)) throw new Error(`unknown status health: ${health}`);
  return Object.freeze({ kind: "status-update-plan", target: projectId, body, health });
}

export function planBridge({ ghost, branchPrefix } = {}) {
  if (!ghost?.id) throw new Error("a ghost with an id is required to plan a bridge");
  return Object.freeze({
    kind: "bridge-plan",
    ghostId: ghost.id,
    branch: branchForGhost({ ghostId: ghost.id, title: ghost.title, branchPrefix }),
    closingKeyword: closingKeywordForGhost(ghost.id),
  });
}

export function verifyCloseout({ ghostId, branch, prBody = "", merged = false } = {}) {
  const reasons = [];
  if (!branchCarriesGhostId(branch, ghostId)) reasons.push("branch does not carry the ghost id");
  if (!bodyClosesGhost(prBody, ghostId)) reasons.push("pull request body is missing the closing keyword");
  if (!merged) reasons.push("pull request is not merged");
  return Object.freeze({ closed: reasons.length === 0, reasons: Object.freeze(reasons) });
}

function normalizeGhost(input) {
  if (!input?.id) throw new Error("ghost requires an id");
  if (!input.projectId) throw new Error(`ghost ${input.id} requires a projectId`);
  if (!GHOST_STATES.includes(input.state)) throw new Error(`ghost ${input.id} has unknown state: ${input.state}`);
  const record = {
    id: input.id,
    title: input.title ?? input.id,
    state: input.state,
    projectId: input.projectId,
    labels: [...(input.labels ?? [])],
    dependsOn: [...(input.dependsOn ?? [])],
    blocks: [],
  };
  if (input.parentId) record.parentId = input.parentId;
  return record;
}

function ghostArtifact(record, generatedAt) {
  const payload = {
    id: record.id,
    title: record.title,
    state: record.state,
    projectId: record.projectId,
    labels: [...record.labels],
    dependsOn: [...record.dependsOn],
    blocks: [...record.blocks],
  };
  if (record.parentId) payload.parentId = record.parentId;
  const ghost = withArtifactMetadata("adapter-ghost", payload, generatedAt);
  const result = validateAdapterGhost(ghost);
  if (!result.ok) throw new Error(`invalid adapter ghost ${record.id}: ${result.errors.join("; ")}`);
  return ghost;
}

// Reference adapter: a self-contained, in-memory tracker that satisfies the
// shared contract over fixture data. Read primitives return schema-valid
// `adapter-ghost` artifacts; planning/verification primitives are pure and
// never mutate the seeded data, so they "represent" writes without executing.
export function createInMemoryTracker({ projects = [], ghosts = [], generatedAt } = {}) {
  const projectMap = new Map();
  for (const project of projects) {
    if (!project?.id) throw new Error("project requires an id");
    if (projectMap.has(project.id)) throw new Error(`duplicate project id: ${project.id}`);
    projectMap.set(project.id, Object.freeze({ id: project.id, name: project.name ?? project.id }));
  }

  const records = new Map();
  for (const ghost of ghosts) {
    const record = normalizeGhost(ghost);
    if (records.has(record.id)) throw new Error(`duplicate ghost id: ${record.id}`);
    records.set(record.id, record);
  }
  // Derive the inverse `blocks` edge once so dependency relations have one source of truth.
  for (const record of records.values()) {
    for (const dependencyId of record.dependsOn) {
      const dependency = records.get(dependencyId);
      if (dependency) dependency.blocks.push(record.id);
    }
  }

  const lookup = (id) => records.get(id) ?? null;

  return {
    getProject(id) {
      return projectMap.get(id) ?? null;
    },
    listProjects() {
      return [...projectMap.values()];
    },
    getGhost(id) {
      const record = records.get(id);
      return record ? ghostArtifact(record, generatedAt) : null;
    },
    listGhosts({ projectId, state } = {}) {
      return [...records.values()]
        .filter((record) => (projectId ? record.projectId === projectId : true))
        .filter((record) => (state ? record.state === state : true))
        .map((record) => ghostArtifact(record, generatedAt));
    },
    getDependencies(id) {
      const record = records.get(id);
      if (!record) return null;
      return { dependsOn: [...record.dependsOn], blocks: [...record.blocks] };
    },
    assessReadiness(id) {
      return assessReadiness(lookup(id), lookup);
    },
    planComment,
    planStatusUpdate,
    planBridge({ ghostId, branchPrefix } = {}) {
      const record = records.get(ghostId);
      if (!record) throw new Error(`unknown ghost: ${ghostId}`);
      return planBridge({ ghost: record, branchPrefix });
    },
    verifyCloseout,
  };
}
