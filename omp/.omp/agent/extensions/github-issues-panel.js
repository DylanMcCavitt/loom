const OSC = "\x1b]8;;";
const ST = "\x1b\\";

function hyperlink(text, url) {
  return `${OSC}${url}${ST}${text}${OSC}${ST}`;
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

async function runGh(args, cwd) {
  const proc = Bun.spawn(["gh", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    const message = (stderr || stdout || `gh exited ${code}`).trim();
    throw new Error(message);
  }
  return stdout.trim();
}

const repoCache = new Map();

async function currentRepo(cwd) {
  const cached = repoCache.get(cwd);
  if (cached) return cached;
  const raw = await runGh(["repo", "view", "--json", "nameWithOwner,url"], cwd);
  const repo = JSON.parse(raw);
  if (!repo?.nameWithOwner || !repo?.url) throw new Error("No GitHub repository found for cwd");
  repoCache.set(cwd, repo);
  return repo;
}

function repoFromIssueUrl(url) {
  const match = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/);
  return match ? { nameWithOwner: match[1], url: `https://github.com/${match[1]}` } : null;
}

async function listIssues(cwd, limit) {
  const raw = await runGh([
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,url,state,updatedAt",
  ], cwd);
  const issues = JSON.parse(raw);
  const repo = repoFromIssueUrl(issues[0]?.url) || await currentRepo(cwd);
  repoCache.set(cwd, repo);
  return { repo, issues };
}

async function issueUrl(cwd, ref) {
  const repoRef = ref.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/);
  if (repoRef) {
    return {
      label: `${repoRef[1]}#${repoRef[2]}`,
      url: `https://github.com/${repoRef[1]}/issues/${repoRef[2]}`,
    };
  }

  const number = ref.replace(/^#/, "");
  if (!/^\d+$/.test(number)) throw new Error("Use an issue number like 12, #12, or owner/repo#12");
  const repo = await currentRepo(cwd);
  return {
    label: `#${number}`,
    url: `${repo.url}/issues/${number}`,
  };
}

async function paste(ctx, text) {
  if (ctx.ui?.pasteToEditor) {
    await ctx.ui.pasteToEditor(text);
    return;
  }
  if (ctx.ui?.getEditorText && ctx.ui?.setEditorText) {
    const existing = await ctx.ui.getEditorText();
    await ctx.ui.setEditorText(`${existing || ""}${text}`);
  }
}

function rewriteIssueRefs(text, repoUrl) {
  return text.replace(/(^|[\s(])#(\d+)\b/g, (_m, prefix, number) => {
    return `${prefix}[#${number}](${repoUrl}/issues/${number})`;
  });
}

export default function githubIssuesPanel(pi) {
  pi.setLabel?.("GitHub Issues Panel");

  pi.registerCommand("issues", {
    description: "Show open GitHub issues for the current repository",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (trimmed === "clear" || trimmed === "off") {
        await ctx.ui?.setWidget?.("github-issues-panel");
        ctx.ui?.notify?.("GitHub issues panel cleared", "info");
        return;
      }

      const requested = Number.parseInt(trimmed || "7", 10);
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(9, requested)) : 7;
      try {
        const { repo, issues } = await listIssues(ctx.cwd, limit);
        const lines = [
          `GitHub issues · ${repo.nameWithOwner} · ${hyperlink("open in browser", `${repo.url}/issues`)}`,
        ];
        if (!issues.length) {
          lines.push("No open issues.");
        } else {
          for (const issue of issues.slice(0, 9)) {
            const label = hyperlink(`#${issue.number}`, issue.url);
            lines.push(`${label} ${truncate(issue.title, 72)} · ${issue.state.toLowerCase()}`);
          }
        }
        await ctx.ui?.setWidget?.("github-issues-panel", lines, { placement: "belowEditor" });
        ctx.ui?.notify?.(`Showing ${issues.length} open issue${issues.length === 1 ? "" : "s"}`, "info");
      } catch (error) {
        ctx.ui?.notify?.(`GitHub issues panel failed: ${error.message}`, "error");
      }
    },
  });

  pi.registerCommand("issue", {
    description: "Paste an OMP issue:// reference for an issue number",
    handler: async (args, ctx) => {
      const ref = args.trim();
      if (!ref) {
        ctx.ui?.notify?.("Usage: /issue 12", "error");
        return;
      }
      const number = ref.replace(/^#/, "");
      if (!/^\d+$/.test(number)) {
        ctx.ui?.notify?.("/issue accepts a current-repo issue number only", "error");
        return;
      }
      await paste(ctx, `issue://${number}`);
    },
  });

  pi.registerCommand("issue-link", {
    description: "Paste a Markdown GitHub issue link",
    handler: async (args, ctx) => {
      const ref = args.trim();
      if (!ref) {
        ctx.ui?.notify?.("Usage: /issue-link 12", "error");
        return;
      }
      try {
        const issue = await issueUrl(ctx.cwd, ref);
        await paste(ctx, `[${issue.label}](${issue.url})`);
      } catch (error) {
        ctx.ui?.notify?.(`Issue link failed: ${error.message}`, "error");
      }
    },
  });

  pi.registerCommand("linkrefs", {
    description: "Rewrite #123 refs in the editor to Markdown issue links",
    handler: async (_args, ctx) => {
      if (!ctx.ui?.getEditorText || !ctx.ui?.setEditorText) {
        ctx.ui?.notify?.("Editor text APIs are unavailable in this mode", "error");
        return;
      }
      try {
        const repo = await currentRepo(ctx.cwd);
        const before = await ctx.ui.getEditorText();
        const after = rewriteIssueRefs(before || "", repo.url);
        await ctx.ui.setEditorText(after);
        ctx.ui?.notify?.("Rewrote #issue refs to Markdown links", "info");
      } catch (error) {
        ctx.ui?.notify?.(`Link rewrite failed: ${error.message}`, "error");
      }
    },
  });
}
