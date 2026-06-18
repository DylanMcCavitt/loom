import { formatRouteResult, routeIntent } from "./workflow-routing.js";
import { formatRecipe } from "./workflow-recipes.js";
import { renderDiffCommand } from "./split-diff.js";

const UNKNOWN = "unknown";

const GO_PROMPT = "Proceed with the current plan. Do not ask unless blocked by missing external information. Preserve unrelated changes. Use subagents for parallelizable work. Verify before yielding.";
const SHIP_PROMPT = "Finish the active issue end-to-end. Check acceptance criteria, implement missing work, verify behavior, and prepare closeout evidence. Ask only if the active issue or target repository is unknown.";

function present(value) {
  if (value === undefined || value === null || value === "") return UNKNOWN;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return String(value);
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return UNKNOWN;
}

function countValue(value) {
  if (Array.isArray(value)) return String(value.length);
  if (Number.isFinite(value)) return String(value);
  return UNKNOWN;
}

function activeAgents(ctx) {
  const agents = firstPresent(ctx?.agents?.active, ctx?.activeAgents, ctx?.agentRoster);
  if (agents === UNKNOWN) return UNKNOWN;
  if (Array.isArray(agents)) return agents.length ? agents.map((agent) => agent.id || agent.name || agent).join(", ") : "none";
  return String(agents);
}

function contextLines(ctx = {}) {
  const activeIssue = firstPresent(ctx.activeIssue, ctx.issue?.number, ctx.issue, ctx.state?.activeIssue, ctx.workflow?.activeIssue);
  const branch = firstPresent(ctx.branch, ctx.git?.branch, ctx.workflow?.branch);
  const worktree = firstPresent(ctx.worktree, ctx.git?.worktree, ctx.cwd);
  const repo = firstPresent(ctx.repo?.nameWithOwner, ctx.repo, ctx.repository, ctx.workflow?.repo, ctx.cwd);
  const touchedCount = countValue(firstPresent(ctx.touchedFiles, ctx.git?.touchedFiles, ctx.workflow?.touchedFiles));
  const lastVerification = firstPresent(ctx.lastVerification, ctx.verification?.last, ctx.workflow?.lastVerification);
  const riskFlags = firstPresent(ctx.contextRiskFlags, ctx.riskFlags, ctx.workflow?.contextRiskFlags);

  return [
    "Workflow cockpit context",
    `repo: ${present(repo)}`,
    `active issue: ${present(activeIssue)}`,
    `branch: ${present(branch)}`,
    `worktree: ${present(worktree)}`,
    `touched-file count: ${touchedCount}`,
    `last verification: ${present(lastVerification)}`,
    `active agents: ${activeAgents(ctx)}`,
    `context-risk flags: ${present(riskFlags)}`,
  ];
}

async function render(ctx, lines, message, level = "info") {
  await ctx?.ui?.setWidget?.("workflow-cockpit", lines, { placement: "belowEditor" });
  ctx?.ui?.notify?.(message, level);
  return lines;
}

function threadStarter(ctx = {}) {
  const focus = firstPresent(ctx.activeIssue, ctx.issue?.number, ctx.workflow?.activeIssue, "current focus");
  return [
    "Start a new visible thread",
    "Use the existing handoff skill to create the handoff before switching. Workflow cockpit does not write handoffs.",
    "Next-thread starter:",
    `Use the handoff skill to resume ${present(focus)}. Start from the handoff artifact, verify the current repo, issue, branch/worktree, and latest validation evidence, then re-read touched files before editing.`,
  ];
}

function hasActiveIssue(ctx = {}) {
  return firstPresent(ctx.activeIssue, ctx.issue?.number, ctx.issue, ctx.state?.activeIssue, ctx.workflow?.activeIssue) !== UNKNOWN;
}

export default function workflowCockpit(pi) {
  pi.setLabel?.("Workflow Cockpit");

  pi.registerCommand("ctx", {
    description: "Show visible workflow context and context-risk flags",
    handler: async (_args, ctx) => {
      try {
        return await render(ctx, contextLines(ctx), "Workflow context shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`Workflow context failed: ${error.message}`, "error");
        return [];
      }
    },
  });

  pi.registerCommand("route", {
    description: "Show the recommended existing skill/tool route for an intent",
    handler: async (args, ctx) => {
      const intent = String(args || "").trim();
      if (!intent) {
        ctx?.ui?.notify?.("Usage: /route <intent>", "error");
        return [];
      }
      try {
        const lines = formatRouteResult(intent);
        const result = routeIntent(intent);
        const label = result.routes.length ? `Route: ${result.routes.join(" + ")}` : "No confident route";
        return await render(ctx, lines, label, result.routes.length ? "info" : "warn");
      } catch (error) {
        ctx?.ui?.notify?.(`Route failed: ${error.message}`, "error");
        return [];
      }
    },
  });

  pi.registerCommand("new-thread", {
    description: "Display a next-thread starter that uses the existing handoff skill",
    handler: async (_args, ctx) => {
      try {
        return await render(ctx, threadStarter(ctx), "Next-thread starter shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`New-thread starter failed: ${error.message}`, "error");
        return [];
      }
    },
  });

  pi.registerCommand("spawn-recipe", {
    description: "Display a task-subagent assignment recipe from agent-recipes patterns",
    handler: async (args, ctx) => {
      const intent = String(args || "").trim();
      if (!intent) {
        ctx?.ui?.notify?.("Usage: /spawn-recipe <intent>", "error");
        return [];
      }
      try {
        const lines = formatRecipe(intent);
        if (!lines) {
          ctx?.ui?.notify?.(`No spawn recipe for intent: ${intent}`, "error");
          return [];
        }
        return await render(ctx, lines, "Spawn recipe shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`Spawn recipe failed: ${error.message}`, "error");
        return [];
      }
    },
  });

  pi.registerCommand("diff", {
    description: "Render a read-only split diff widget for a git revision range",
    handler: renderDiffCommand,
  });

  pi.registerCommand("go", {
    description: "Display the exact execute-plan prompt for proceeding with the current plan",
    handler: async (_args, ctx) => {
      try {
        return await render(ctx, [GO_PROMPT], "Go prompt shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`Go prompt failed: ${error.message}`, "error");
        return [];
      }
    },
  });

  pi.registerCommand("ship", {
    description: "Display the exact issue-autopilot prompt for finishing the active issue",
    handler: async (_args, ctx) => {
      if (!hasActiveIssue(ctx)) {
        ctx?.ui?.notify?.("Active issue is unknown; set or provide one before /ship.", "error");
        return [];
      }
      try {
        return await render(ctx, [SHIP_PROMPT], "Ship prompt shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`Ship prompt failed: ${error.message}`, "error");
        return [];
      }
    },
  });
}

export { contextLines, threadStarter };
