const RECIPES = [
  {
    keys: ["review", "review agents", "code review"],
    title: "Review recipe",
    role: "Security and maintainability reviewer",
    target: "Review the exact changed files and symbols named by the main agent. Do not inspect unrelated packages.",
    change: "Identify correctness, security, maintainability, and acceptance-criteria risks. Do not edit files. Do not run project-wide gates, formatters, build, lint, or tests.",
    acceptance: "Return only actionable findings with file paths, line numbers, observed evidence, and the minimal fix needed. Say \"No findings\" only after checking the named target.",
  },
  {
    keys: ["debug", "diagnose", "failure"],
    title: "Debug recipe",
    role: "Failure reproducer and root-cause analyst",
    target: "Investigate the named failing command, test, issue, or code path. Stay inside the provided files and reproduction steps.",
    change: "Reproduce or trace the failure, isolate the smallest likely cause, and propose the source fix. Do not edit files unless the main agent explicitly assigns implementation. Do not run project-wide gates, formatters, build, lint, or tests.",
    acceptance: "Report the failing input, observed error, root cause, and exact next edit or diagnostic gap.",
  },
  {
    keys: ["tests", "test", "coverage"],
    title: "Tests recipe",
    role: "Behavior-focused test writer",
    target: "Add or update tests for the named behavior and edge cases only. Do not refactor production code unless required for testability and approved by the main agent.",
    change: "Create tests that assert behavior, invariants, error handling, and edge values. Avoid brittle default-string assertions unless the user-visible contract requires exact text. Do not run project-wide gates, formatters, build, lint, or tests.",
    acceptance: "Return the test files changed, behaviors covered, and any production seams that still need main-agent implementation.",
  },
  {
    keys: ["parallel", "implementation", "parallel implementation"],
    title: "Parallel implementation recipe",
    role: "Scoped implementation specialist",
    target: "Implement one named slice in the exact files and symbols assigned. Do not edit shared contracts unless coordinated with the main agent.",
    change: "Make the smallest source change that satisfies the slice. Preserve existing conventions and unrelated user changes. Do not run project-wide gates, formatters, build, lint, or tests.",
    acceptance: "Report changed files, satisfied acceptance criteria, and any local assumptions the main agent must verify.",
  },
  {
    keys: ["issue", "issue work", "pr"],
    title: "Issue work recipe",
    role: "One-issue implementation owner",
    target: "Work only on the named tracked issue in its existing issue worktree and branch. Do not create another worktree or branch.",
    change: "Read the issue, repo-local agent docs, and relevant domain docs. Implement only the issue acceptance criteria. Preserve one issue to one branch/worktree to one PR. Do not run project-wide gates, formatters, build, lint, or tests.",
    acceptance: "Return the issue number, changed files, acceptance criteria covered, and targeted checks the main agent should run before PR closeout.",
  },
];

function normalize(intent) {
  return String(intent || "").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function recipeForIntent(intent) {
  const text = normalize(intent);
  if (!text) return null;
  return RECIPES.find((recipe) => recipe.keys.some((key) => text.includes(key))) || null;
}

export function formatRecipe(intent) {
  const recipe = recipeForIntent(intent);
  if (!recipe) return null;
  return [
    `${recipe.title} · from agent-recipes patterns`,
    `Role: ${recipe.role}`,
    "# Target",
    recipe.target,
    "",
    "# Change",
    recipe.change,
    "",
    "# Acceptance",
    recipe.acceptance,
  ];
}

export function recipeCount() {
  return RECIPES.length;
}
