import { formatRouteResult, routeIntent } from "./workflow-routing.js";
import { formatRecipe } from "./workflow-recipes.js";
import { renderDiffCommand } from "./split-diff.js";
import { closeActivePanel, presentPanel, presentPositionedPanel } from "./panel-shell.js";

const COCKPIT_KEY_HINTS = "↑↓/jk scroll · PgUp/PgDn page · g/G top/end · Esc close";
const EXEC_TIMEOUT_MS = 5000;
const MAX_OPEN_ISSUES = 5;
const CONTEXT_RISK_PERCENT = 70;
const ISSUE_PATTERN = /issue[-_/ ]?(\d+)/iu;
// Read-only verification commands worth surfacing as "last verification".
const VERIFICATION_PATTERN =
  /\b(?:node\s+--test|npm\s+(?:run\s+)?(?:test|lint|build|typecheck|check)|pnpm\s+(?:run\s+)?(?:test|lint|build|typecheck|check)|yarn\s+(?:test|lint|build|typecheck|check)|bun\s+(?:test|run\s+\S*test\S*)|pytest|jest|vitest|mocha|tsc|eslint|prettier|cargo\s+(?:test|check|clippy)|go\s+test|make\s+(?:test|check|lint)|scripts\/validate-skills|scripts\/automation-workflow-benchmark)\b/iu;

const GO_PROMPT = "Proceed with the current plan. Do not ask unless blocked by missing external information. Preserve unrelated changes. Use subagents for parallelizable work. Verify before yielding.";
const SHIP_PROMPT = "Finish the active issue end-to-end. Check acceptance criteria, implement missing work, verify behavior, and prepare closeout evidence. Ask only if the active issue or target repository is unknown.";

function basename(path) {
  if (typeof path !== "string" || !path) return "";
  const parts = path.split(/[\\/]/u).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function parseRepoSlug(remote) {
  if (typeof remote !== "string") return undefined;
  const match = remote.trim().match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/u);
  return match ? match[1] : undefined;
}

function inferIssueNumber(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const match = value.match(ISSUE_PATTERN);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function isVerificationCommand(command) {
  return typeof command === "string" && VERIFICATION_PATTERN.test(command);
}

function formatAge(at, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Tracks the most recent successful verification command run through the bash
// tool. ExtensionCommandContext does not expose verification state, so we
// observe it via the documented tool_result event instead of inventing a field.
function createVerificationTracker(pi) {
  let last;
  pi?.on?.("tool_result", (event) => {
    if (!event || event.toolName !== "bash" || event.isError) return;
    const command = event.input?.command;
    if (!isVerificationCommand(command)) return;
    last = { command: command.trim().replace(/\s+/gu, " "), at: Date.now() };
  });
  return () => last;
}

// Builds provider-backed data sources from documented APIs: pi.exec for git/gh
// and the tool_result event stream for verification. No speculative ctx fields.
function createCockpitProviders(pi) {
  const run = async (command, args, cwd) => {
    try {
      const result = await pi?.exec?.(command, args, { cwd, timeout: EXEC_TIMEOUT_MS });
      if (!result || result.code !== 0) return undefined;
      return typeof result.stdout === "string" ? result.stdout.trim() : "";
    } catch {
      return undefined;
    }
  };

  const parseJson = (text) => {
    if (typeof text !== "string" || !text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };

  return {
    async repo(cwd) {
      const parsed = parseJson(await run("gh", ["repo", "view", "--json", "nameWithOwner"], cwd));
      if (parsed?.nameWithOwner) return parsed.nameWithOwner;
      return parseRepoSlug(await run("git", ["remote", "get-url", "origin"], cwd));
    },
    async branch(cwd) {
      const current = await run("git", ["branch", "--show-current"], cwd);
      if (current) return current;
      const head = await run("git", ["rev-parse", "--short", "HEAD"], cwd);
      return head ? `detached@${head}` : undefined;
    },
    async worktree(cwd) {
      return run("git", ["rev-parse", "--show-toplevel"], cwd);
    },
    async touchedCount(cwd) {
      const status = await run("git", ["status", "--porcelain", "--untracked-files=normal"], cwd);
      if (status === undefined) return undefined;
      return status ? status.split("\n").filter((line) => line.trim()).length : 0;
    },
    async openIssues(cwd) {
      const parsed = parseJson(await run("gh", ["issue", "list", "--state", "open", "--limit", String(MAX_OPEN_ISSUES), "--json", "number,title,state,url"], cwd));
      return Array.isArray(parsed) ? parsed : undefined;
    },
    async validateIssue(cwd, number) {
      return parseJson(await run("gh", ["issue", "view", String(number), "--json", "number,title,state"], cwd));
    },
    lastVerification: createVerificationTracker(pi),
  };
}

async function inferActiveIssueNumber(ctx, providers) {
  const cwd = ctx?.cwd;
  const [branch, worktree] = await Promise.all([providers.branch(cwd), providers.worktree(cwd)]);
  return inferIssueNumber(branch, basename(worktree));
}

function activeIssueLabel(issueNumber, validatedIssue) {
  if (issueNumber === undefined) return "none detected from branch/worktree";
  if (validatedIssue?.number !== undefined && validatedIssue?.number !== null) {
    const state = validatedIssue.state ? ` · ${String(validatedIssue.state).toLowerCase()}` : "";
    return `#${validatedIssue.number} ${validatedIssue.title ?? ""}${state}`.trim();
  }
  return `#${issueNumber} (unverified; gh unavailable)`;
}

function formatOpenIssues(issues) {
  if (issues === undefined) return ["unavailable (gh not available)"];
  if (!Array.isArray(issues) || !issues.length) return ["none"];
  return issues.slice(0, MAX_OPEN_ISSUES).map((issue) => {
    if (typeof issue === "string") return issue;
    const number = issue?.number;
    const title = issue?.title ?? "";
    const state = issue?.state ? ` · ${String(issue.state).toLowerCase()}` : "";
    const prefix = number === undefined || number === null ? "issue" : `#${number}`;
    return `${prefix} ${title}${state}`.trim();
  });
}

function computeRiskFlags(data, usage) {
  const flags = [];
  if (usage && Number.isFinite(usage.percent) && usage.percent >= CONTEXT_RISK_PERCENT) {
    flags.push(`context usage ${Math.round(usage.percent)}%`);
  }
  if (typeof data.touchedCount === "number" && data.touchedCount > 0) {
    flags.push(`uncommitted changes (${data.touchedCount})`);
  }
  if (!data.verification) {
    flags.push("no verification recorded");
  }
  if (typeof data.branch === "string" && data.branch.startsWith("detached@")) {
    flags.push("detached HEAD");
  }
  if (data.issueNumber !== undefined && !data.validatedIssue) {
    flags.push("active issue unverified");
  }
  return flags;
}

// Gathers every cockpit row from provider-backed sources. Read failures degrade
// to source-specific unavailable states rather than throwing or showing unknown.
async function gatherCockpitData(ctx, providers) {
  const cwd = ctx?.cwd;
  const [repo, branch, worktree, touchedCount, openIssues] = await Promise.all([
    providers.repo(cwd),
    providers.branch(cwd),
    providers.worktree(cwd),
    providers.touchedCount(cwd),
    providers.openIssues(cwd),
  ]);
  const issueNumber = inferIssueNumber(branch, basename(worktree));
  const validatedIssue = issueNumber === undefined ? undefined : await providers.validateIssue(cwd, issueNumber);
  const verification = providers.lastVerification?.();
  const usage = typeof ctx?.getContextUsage === "function" ? ctx.getContextUsage() : undefined;
  const base = { repo, branch, worktree, touchedCount, openIssues, issueNumber, validatedIssue, verification, cwd };

  return {
    repo: repo ?? basename(cwd) ?? "unavailable",
    branch: branch ?? "unavailable (not a git repo)",
    worktree: worktree ?? cwd ?? "unavailable",
    touched: typeof touchedCount === "number" ? String(touchedCount) : "unavailable (not a git repo)",
    activeIssue: activeIssueLabel(issueNumber, validatedIssue),
    openIssues: formatOpenIssues(openIssues),
    lastVerification: verification ? `${verification.command} · ${formatAge(verification.at)}` : "none recorded this session",
    activeAgents: "not exposed by OMP API",
    riskFlags: computeRiskFlags(base, usage),
  };
}

function contextLines(data) {
  return [
    "Workflow cockpit context",
    `repo: ${data.repo}`,
    `active issue: ${data.activeIssue}`,
    `branch: ${data.branch}`,
    `worktree: ${data.worktree}`,
    `touched-file count: ${data.touched}`,
    `last verification: ${data.lastVerification}`,
    `active agents: ${data.activeAgents}`,
    `context-risk flags: ${data.riskFlags.length ? data.riskFlags.join(", ") : "none"}`,
  ];
}

function cockpitSections(data) {
  return [
    {
      title: "Repository",
      rows: [
        `repo: ${data.repo}`,
        `branch: ${data.branch}`,
        `worktree: ${data.worktree}`,
      ],
    },
    {
      title: "Issue state",
      rows: [`active issue: ${data.activeIssue}`],
    },
    {
      title: "Open issues",
      rows: data.openIssues,
    },
    {
      title: "Working context",
      rows: [
        `touched-file count: ${data.touched}`,
        `last verification: ${data.lastVerification}`,
        `active agents: ${data.activeAgents}`,
        `context-risk flags: ${data.riskFlags.length ? data.riskFlags.join(", ") : "none"}`,
      ],
    },
  ];
}

async function render(ctx, lines, message, level = "info") {
  await ctx?.ui?.setWidget?.("workflow-cockpit", lines, { placement: "belowEditor" });
  ctx?.ui?.notify?.(message, level);
  return lines;
}

// Opt-in (issue #29): `OMP_CTX_SIDE_PANEL=1` routes /ctx through the gated
// positioned side panel (right-anchored on wide terminals, framed full-width on
// narrow ones). Unset/anything else keeps the authoritative framed full-width
// panel that #27 shipped. The positioned path itself degrades to framed when no
// live TUI is available, so this flag is always safe.
function sidePanelEnabled() {
  const flag = process.env.OMP_CTX_SIDE_PANEL;
  return flag === "1" || flag === "true";
}

async function renderCockpit(ctx, providers) {
  const data = await gatherCockpitData(ctx, providers);
  const lines = contextLines(data);
  await ctx?.ui?.setWidget?.("workflow-cockpit");

  if (ctx?.hasUI !== false && typeof ctx?.ui?.custom === "function") {
    closeActivePanel(ctx);
    const sections = cockpitSections(data).map((section) => ({ label: section.title, lines: section.rows }));
    const present = sidePanelEnabled() ? presentPositionedPanel : presentPanel;
    await present(ctx, { title: "Workflow Cockpit", sections, keyHints: COCKPIT_KEY_HINTS });
    return lines;
  }

  return render(ctx, lines, "Workflow context shown", "info");
}

function threadStarter(focus) {
  return [
    "Start a new visible thread",
    "Use the existing handoff skill to create the handoff before switching. Workflow cockpit does not write handoffs.",
    "Next-thread starter:",
    `Use the handoff skill to resume ${focus}. Start from the handoff artifact, verify the current repo, issue, branch/worktree, and latest validation evidence, then re-read touched files before editing.`,
  ];
}

export default function workflowCockpit(pi) {
  pi.setLabel?.("Workflow Cockpit");

  const providers = createCockpitProviders(pi);

  pi.registerCommand("ctx", {
    description: "Show visible workflow context and context-risk flags",
    handler: async (_args, ctx) => {
      try {
        return await renderCockpit(ctx, providers);
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
        const number = await inferActiveIssueNumber(ctx, providers);
        const focus = number === undefined ? "current focus" : `#${number}`;
        return await render(ctx, threadStarter(focus), "Next-thread starter shown", "info");
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
    description: "Render a read-only split diff overlay for a git revision range",
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
      try {
        const number = await inferActiveIssueNumber(ctx, providers);
        if (number === undefined) {
          ctx?.ui?.notify?.("Active issue is unknown; set or provide one before /ship.", "error");
          return [];
        }
        return await render(ctx, [SHIP_PROMPT], "Ship prompt shown", "info");
      } catch (error) {
        ctx?.ui?.notify?.(`Ship prompt failed: ${error.message}`, "error");
        return [];
      }
    },
  });
}

export {
  contextLines,
  cockpitSections,
  createCockpitProviders,
  gatherCockpitData,
  inferActiveIssueNumber,
  inferIssueNumber,
  isVerificationCommand,
  parseRepoSlug,
  threadStarter,
};
