const ROUTE_RULES = [
  {
    route: "thread-control",
    reason: "Visible thread/context decision before handoff.",
    any: ["fresh chat", "new thread", "switch context", "resume a handoff", "context health"],
    also: ["handoff"],
  },
  {
    route: "handoff",
    reason: "Existing handoff skill owns compacting context for a fresh agent.",
    any: ["handoff", "start a fresh chat", "fresh chat with this context"],
  },
  {
    route: "diagnose",
    reason: "Existing diagnosis loop owns bugs, failures, and regressions.",
    any: ["debug", "bug", "broken", "failing", "fails", "throwing", "regression"],
  },
  {
    route: "tdd",
    reason: "Existing TDD skill owns explicit test-first or red-green-refactor work.",
    any: ["tdd", "test-driven", "red-green-refactor", "red green refactor"],
  },
  {
    route: "ghosts",
    reason: "Ghosts owns splitting a plan or PRD into dependency-ordered Linear issues.",
    any: ["split this prd", "implementation tickets", "break this plan into issues", "turn this into issues"],
  },
  {
    route: "blueprint",
    reason: "Blueprint owns synthesizing a PRD or spec from existing context.",
    any: ["write a prd", "create a prd", "turn this into a prd", "make a spec", "create a spec"],
  },
  {
    route: "assembler",
    reason: "Assembler owns per-repo kit setup: the repo envelope, harness wiring, and repo-specific skills (replaces the retired bootstrap trio).",
    any: ["set up this repo", "set up a repo for the kit", "workflow kit", "set up the workflow kit", "workflow kit setup", "repo envelope", "refresh the envelope", "project-specific skills", "project-specific agents", "repo-specific skills", "repo-specific agents", "scaffold repo-specific agents"],
  },
  {
    route: "openai-docs",
    reason: "Existing OpenAI docs skill owns current OpenAI API documentation lookups.",
    any: ["openai docs", "responses api", "agents sdk", "apps sdk", "realtime api"],
  },
  {
    route: "execute-plan",
    reason: "Execute-plan owns explicit go-ahead requests for the current plan.",
    any: ["go ahead", "execute the plan", "proceed", "stop discussing and implement", "ship the current plan"],
  },
  {
    route: "roboports",
    reason: "Roboports owns running one tracked Linear issue end-to-end to a PR.",
    any: ["start issue", "continue issue", "ship issue", "ship one tracked issue", "work it to pr", "tracked issue end-to-end"],
  },
  {
    route: "roboports",
    reason: "Roboports owns the subagent fanout discipline when executing an issue.",
    any: ["spawn review", "spawn agents", "/spawn", "subagent recipe", "agent recipe", "parallel implementation"],
  },
  {
    route: "computer-use",
    reason: "Desktop or app wording means inspect the visible local UI, not DevTools.",
    any: ["desktop app", "local app", "app window", "read slack", "control spotify", "computer use"],
  },
  {
    route: "chrome-devtools",
    reason: "Browser page debugging belongs to Chrome DevTools.",
    any: ["browser bug", "chrome devtools", "web page bug", "inspect browser", "network request"],
    unless: ["desktop app", "local app", "app window"],
  },
];

function normalize(intent) {
  return String(intent || "")
    .toLowerCase()
    .replace(/[^a-z0-9/#_. -]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function matchesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function pushRoute(result, route, reason) {
  if (result.routes.includes(route)) return;
  result.routes.push(route);
  result.reasons.push({ route, reason });
}

export function routeIntent(intent) {
  const text = normalize(intent);
  const result = { intent: String(intent || ""), routes: [], reasons: [] };

  for (const rule of ROUTE_RULES) {
    if (rule.unless && matchesAny(text, rule.unless)) continue;
    if (!matchesAny(text, rule.any)) continue;
    pushRoute(result, rule.route, rule.reason);
    for (const route of rule.also || []) pushRoute(result, route, rule.reason);
  }

  return result;
}

export function formatRouteResult(intent) {
  const result = routeIntent(intent);
  if (!result.routes.length) {
    return [`Route for: ${intent || "unknown"}`, "No confident route. Ask for the missing intent or inspect repo context."];
  }
  return [
    `Route for: ${intent}`,
    `Recommended: ${result.routes.join(" + ")}`,
    ...result.reasons.map(({ route, reason }) => `- ${route}: ${reason}`),
  ];
}
