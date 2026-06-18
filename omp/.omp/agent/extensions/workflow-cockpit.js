import { formatRouteResult, routeIntent } from "./workflow-routing.js";
import { formatRecipe } from "./workflow-recipes.js";
import { renderDiffCommand } from "./split-diff.js";

const UNKNOWN = "unknown";
const MAX_PANEL_BODY_LINES = 14;
const MIN_PANEL_WIDTH = 28;

const GO_PROMPT = "Proceed with the current plan. Do not ask unless blocked by missing external information. Preserve unrelated changes. Use subagents for parallelizable work. Verify before yielding.";
const SHIP_PROMPT = "Finish the active issue end-to-end. Check acceptance criteria, implement missing work, verify behavior, and prepare closeout evidence. Ask only if the active issue or target repository is unknown.";

let activeCockpitSession;

function isPresent(value) {
  return value !== undefined && value !== null && value !== "" && typeof value !== "function";
}

function present(value) {
  if (!isPresent(value)) return UNKNOWN;
  if (Array.isArray(value)) return value.length ? value.map(present).join(", ") : "none";
  if (typeof value === "object") {
    if (isPresent(value.nameWithOwner)) return String(value.nameWithOwner);
    if (isPresent(value.number)) return String(value.number);
    if (isPresent(value.id)) return String(value.id);
    if (isPresent(value.name)) return String(value.name);
    return UNKNOWN;
  }
  return String(value);
}

function firstPresent(...values) {
  for (const value of values) {
    if (isPresent(value)) return value;
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
  return present(agents);
}

function branchValue(ctx = {}) {
  return firstPresent(ctx.branchName, ctx.git?.currentBranch, ctx.workflow?.currentBranch, ctx.branch, ctx.git?.branch, ctx.workflow?.branch);
}

function cockpitData(ctx = {}) {
  const activeIssue = firstPresent(ctx.activeIssue, ctx.issue?.number, ctx.issue, ctx.state?.activeIssue, ctx.workflow?.activeIssue);
  const branch = branchValue(ctx);
  const worktree = firstPresent(ctx.worktree, ctx.git?.worktree, ctx.git?.root, ctx.cwd);
  const repo = firstPresent(ctx.repo?.nameWithOwner, ctx.repo, ctx.repository?.nameWithOwner, ctx.repository, ctx.workflow?.repo, ctx.cwd);
  const touchedCount = countValue(firstPresent(ctx.touchedFiles, ctx.git?.touchedFiles, ctx.workflow?.touchedFiles));
  const lastVerification = firstPresent(ctx.lastVerification, ctx.verification?.last, ctx.workflow?.lastVerification);
  const riskFlags = firstPresent(ctx.contextRiskFlags, ctx.riskFlags, ctx.workflow?.contextRiskFlags);

  return {
    repo: present(repo),
    activeIssue: present(activeIssue),
    branch: present(branch),
    worktree: present(worktree),
    touchedCount,
    lastVerification: present(lastVerification),
    activeAgents: activeAgents(ctx),
    riskFlags: present(riskFlags),
    openIssues: openIssueLines(ctx),
  };
}

function contextLines(ctx = {}) {
  const data = cockpitData(ctx);

  return [
    "Workflow cockpit context",
    `repo: ${data.repo}`,
    `active issue: ${data.activeIssue}`,
    `branch: ${data.branch}`,
    `worktree: ${data.worktree}`,
    `touched-file count: ${data.touchedCount}`,
    `last verification: ${data.lastVerification}`,
    `active agents: ${data.activeAgents}`,
    `context-risk flags: ${data.riskFlags}`,
  ];
}

function openIssueLines(ctx = {}) {
  const issues = firstPresent(ctx.openIssues, ctx.issues?.open, ctx.github?.openIssues, ctx.githubIssues, ctx.workflow?.openIssues);
  if (issues === UNKNOWN) return [UNKNOWN];
  if (!Array.isArray(issues)) return [present(issues)];
  if (!issues.length) return ["none"];
  return issues.slice(0, 5).map((issue) => {
    if (typeof issue === "string") return issue;
    const number = firstPresent(issue.number, issue.id);
    const title = firstPresent(issue.title, issue.name, issue.summary);
    const state = firstPresent(issue.state, issue.status);
    const prefix = number === UNKNOWN ? "issue" : `#${number}`;
    const suffix = state === UNKNOWN ? "" : ` · ${state}`;
    return `${prefix} ${present(title)}${suffix}`;
  });
}

function cockpitSections(ctx = {}) {
  const data = cockpitData(ctx);
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
      rows: [
        `active issue: ${data.activeIssue}`,
        `open issues: ${data.openIssues[0]}`,
        ...data.openIssues.slice(1).map((line) => `             ${line}`),
      ],
    },
    {
      title: "Working context",
      rows: [
        `touched-file count: ${data.touchedCount}`,
        `last verification: ${data.lastVerification}`,
        `active agents: ${data.activeAgents}`,
        `context-risk flags: ${data.riskFlags}`,
      ],
    },
  ];
}

function style(theme, token, text) {
  return typeof theme?.fg === "function" ? theme.fg(token, text) : text;
}

function truncateText(text, width) {
  if (width <= 0) return "";
  const value = String(text);
  if (value.length <= width) return value;
  if (width === 1) return "…";
  return `${value.slice(0, width - 1)}…`;
}

function padded(text, width) {
  const line = truncateText(text, width);
  return `${line}${" ".repeat(Math.max(0, width - line.length))}`;
}

function isKey(data, key) {
  if (data === key) return true;
  if (key === "escape") return data === "\u001b" || data === "esc";
  if (key === "ctrl+c") return data === "\u0003";
  if (key === "up") return data === "\u001b[A" || data === "k";
  if (key === "down") return data === "\u001b[B" || data === "j";
  if (key === "pageup") return data === "\u001b[5~";
  if (key === "pagedown") return data === "\u001b[6~" || data === " ";
  if (key === "home") return data === "\u001b[H" || data === "\u001b[1~";
  if (key === "end") return data === "\u001b[F" || data === "\u001b[4~";
  return false;
}

function cockpitOverlayOptions() {
  const columns = process.stdout?.columns ?? 120;
  if (columns < 100) {
    return {
      anchor: "center",
      width: "90%",
      minWidth: 24,
      maxHeight: "80%",
      margin: 1,
    };
  }

  return {
    anchor: "right-center",
    width: "38%",
    minWidth: 42,
    maxHeight: "85%",
    margin: { right: 1 },
  };
}

class WorkflowCockpitPanel {
  constructor(sections, theme, done, requestRender = () => {}) {
    this.sections = sections;
    this.theme = theme;
    this.done = done;
    this.requestRender = requestRender;
    this.scrollOffset = 0;
  }

  bodyLines() {
    const lines = [];
    for (const section of this.sections) {
      if (lines.length) lines.push("");
      lines.push(`▸ ${section.title}`);
      for (const row of section.rows) lines.push(`  ${row}`);
    }
    return lines;
  }

  maxScroll() {
    return Math.max(0, this.bodyLines().length - MAX_PANEL_BODY_LINES);
  }

  scrollBy(delta) {
    const next = Math.min(this.maxScroll(), Math.max(0, this.scrollOffset + delta));
    if (next !== this.scrollOffset) {
      this.scrollOffset = next;
      this.requestRender();
    }
  }

  handleInput(data) {
    if (isKey(data, "escape") || isKey(data, "ctrl+c")) {
      this.done("closed");
    } else if (isKey(data, "up")) {
      this.scrollBy(-1);
    } else if (isKey(data, "down")) {
      this.scrollBy(1);
    } else if (isKey(data, "pageup")) {
      this.scrollBy(-MAX_PANEL_BODY_LINES);
    } else if (isKey(data, "pagedown")) {
      this.scrollBy(MAX_PANEL_BODY_LINES);
    } else if (isKey(data, "home")) {
      this.scrollBy(-this.scrollOffset);
    } else if (isKey(data, "end")) {
      this.scrollBy(this.maxScroll());
    }
  }

  render(width) {
    const panelWidth = Math.max(1, width);
    const innerWidth = Math.max(1, panelWidth - 2);
    const border = (text) => style(this.theme, "border", text);

    if (panelWidth < MIN_PANEL_WIDTH) {
      return [
        border(`╭${"─".repeat(innerWidth)}╮`),
        `${border("│")}${padded("Workflow cockpit", innerWidth)}${border("│")}`,
        `${border("│")}${padded("Terminal too narrow", innerWidth)}${border("│")}`,
        `${border("│")}${padded("Esc close", innerWidth)}${border("│")}`,
        border(`╰${"─".repeat(innerWidth)}╯`),
      ];
    }

    const title = " Workflow Cockpit ";
    const titleLine = truncateText(title, innerWidth);
    const left = "─".repeat(Math.floor((innerWidth - titleLine.length) / 2));
    const right = "─".repeat(Math.max(0, innerWidth - titleLine.length - left.length));
    const body = this.bodyLines();
    const maxScroll = this.maxScroll();
    const visible = body.slice(this.scrollOffset, this.scrollOffset + MAX_PANEL_BODY_LINES);
    const scroll = maxScroll ? `↑ ${this.scrollOffset} / ↓ ${maxScroll - this.scrollOffset}` : "all content visible";
    const lines = [
      `${border(`╭${left}`)}${style(this.theme, "accent", titleLine)}${border(`${right}╮`)}`,
      `${border("│")}${style(this.theme, "dim", padded(scroll, innerWidth))}${border("│")}`,
    ];

    for (const line of visible) {
      const plain = line.startsWith("▸ ") ? line : line;
      const rendered = line.startsWith("▸ ") ? style(this.theme, "accent", padded(plain, innerWidth)) : padded(plain, innerWidth);
      lines.push(`${border("│")}${rendered}${border("│")}`);
    }

    for (let i = visible.length; i < MAX_PANEL_BODY_LINES; i += 1) {
      lines.push(`${border("│")}${padded("", innerWidth)}${border("│")}`);
    }

    lines.push(`${border("│")}${style(this.theme, "dim", padded("↑↓/jk scroll · PgUp/PgDn jump · Esc close", innerWidth))}${border("│")}`);
    lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
    return lines;
  }

  invalidate() {}

  dispose() {}
}

async function render(ctx, lines, message, level = "info") {
  await ctx?.ui?.setWidget?.("workflow-cockpit", lines, { placement: "belowEditor" });
  ctx?.ui?.notify?.(message, level);
  return lines;
}

function closeActiveCockpit(result = "replaced") {
  const session = activeCockpitSession;
  activeCockpitSession = undefined;
  session?.handle?.hide?.();
  session?.done?.(result);
}

async function renderCockpit(ctx) {
  const lines = contextLines(ctx);
  await ctx?.ui?.setWidget?.("workflow-cockpit");

  if (ctx?.mode === "tui" && typeof ctx?.ui?.custom === "function") {
    closeActiveCockpit("replaced");
    const session = { done: undefined, handle: undefined };
    const result = await ctx.ui.custom(
      (tui, theme, _keybindings, done) => {
        session.done = done;
        activeCockpitSession = session;
        return new WorkflowCockpitPanel(cockpitSections(ctx), theme, done, () => tui?.requestRender?.());
      },
      {
        overlay: true,
        overlayOptions: cockpitOverlayOptions,
        onHandle: (handle) => {
          session.handle = handle;
          if (activeCockpitSession === session) handle?.focus?.();
        },
      },
    );
    if (activeCockpitSession === session) {
      activeCockpitSession = undefined;
    }
    if (result !== "replaced") ctx?.ui?.notify?.("Workflow cockpit closed", "info");
    return lines;
  }

  return render(ctx, lines, "Workflow context shown", "info");
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
        return await renderCockpit(ctx);
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

export { WorkflowCockpitPanel, cockpitOverlayOptions, contextLines, threadStarter };
