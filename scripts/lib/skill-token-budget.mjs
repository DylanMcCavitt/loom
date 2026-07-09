// Activation-token estimates for skill packages.
//
// Cost model (chars/4, ceil): SKILL.md + the package's default lens reference
// (when one exists) + references/rules.md when present. This mirrors the
// realistic first-load set described in each skill's AGENTS.md load order
// (SKILL.md → default lens → rules), not the full reference tree.
//
// Default lens resolution (maintainable, no hard-coded skill map):
// 1. Prefer AGENTS.md load-order / lens-reference prose.
// 2. Fall back to SKILL.md lens prose.
// Patterns accepted:
//   - `the default \`references/lens-<name>.md\``
//   - `load the default \`references/lens-<name>.md\``
//   - `` `references/lens-<name>.md` (default) ``
// Skills without a matching default (utilities, non-lens packages) contribute
// only SKILL.md (+ rules.md if present).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CHARS_PER_TOKEN = 4;
/** Report (do not fail) when the estimate is at least this many tokens under budget. */
export const TOKEN_BUDGET_SHRINK_REPORT_MIN = 16;
export const DEFAULT_TOKEN_BUDGETS_PATH = "scripts/skill-token-budgets.json";

const DEFAULT_LENS_PATTERNS = Object.freeze([
  /(?:load\s+)?the\s+default\s+`(?<rel>references\/lens-[a-z0-9-]+\.md)`/iu,
  /`(?<rel>references\/lens-[a-z0-9-]+\.md)`\s*\(default\)/iu,
]);

export function estimateTokensFromChars(charCount) {
  if (!Number.isFinite(charCount) || charCount <= 0) return 0;
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

export function resolveDefaultLensRelPath(skillDir) {
  for (const fileName of ["AGENTS.md", "SKILL.md"]) {
    const fullPath = path.join(skillDir, fileName);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const pattern of DEFAULT_LENS_PATTERNS) {
      const match = pattern.exec(text);
      if (match?.groups?.rel) return match.groups.rel.split(path.sep).join("/");
    }
  }
  return null;
}

function fileCharCount(filePath) {
  if (!existsSync(filePath)) return { chars: 0, present: false };
  return { chars: readFileSync(filePath, "utf8").length, present: true };
}

/**
 * @returns {{
 *   skill: string,
 *   tokens: number,
 *   chars: number,
 *   files: string[],
 *   defaultLens: string | null,
 * }}
 */
export function estimateSkillActivationTokens(skillDir, skillName = path.basename(skillDir)) {
  const files = [];
  let chars = 0;

  const skillMd = path.join(skillDir, "SKILL.md");
  const skillMdStats = fileCharCount(skillMd);
  if (skillMdStats.present) {
    chars += skillMdStats.chars;
    files.push("SKILL.md");
  }

  const defaultLens = resolveDefaultLensRelPath(skillDir);
  if (defaultLens) {
    const lensStats = fileCharCount(path.join(skillDir, ...defaultLens.split("/")));
    if (lensStats.present) {
      chars += lensStats.chars;
      files.push(defaultLens);
    }
  }

  const rulesRel = "references/rules.md";
  const rulesStats = fileCharCount(path.join(skillDir, "references", "rules.md"));
  if (rulesStats.present) {
    chars += rulesStats.chars;
    files.push(rulesRel);
  }

  return {
    skill: skillName,
    tokens: estimateTokensFromChars(chars),
    chars,
    files,
    defaultLens,
  };
}

export function collectSkillActivationTokenEstimates({ skillsDir, skillNames }) {
  const estimates = [];
  for (const skill of skillNames) {
    estimates.push(estimateSkillActivationTokens(path.join(skillsDir, skill), skill));
  }
  return estimates;
}

export function validateTokenBudgetsShape(budgets, failures) {
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) {
    failures.push("token budgets: must be a JSON object mapping skillName → token budget");
    return false;
  }
  let valid = true;
  for (const [skill, tokens] of Object.entries(budgets)) {
    if (!Number.isInteger(tokens) || tokens < 0) {
      failures.push(`token budgets: ${skill} must be a non-negative integer`);
      valid = false;
    }
  }
  return valid;
}

/**
 * Compare live estimates to recorded budgets.
 * - Exceeding the recorded budget fails (trim content or raise the budget in review).
 * - Dropping by TOKEN_BUDGET_SHRINK_REPORT_MIN or more yields a non-failing notice.
 * - Missing / stale skill keys fail so the ratchet file stays complete.
 */
export function compareTokenBudgets(estimates, budgets) {
  const failures = [];
  const notices = [];
  if (!validateTokenBudgetsShape(budgets, failures)) {
    return { failures, notices, rows: [] };
  }

  const seen = new Set();
  const rows = [];
  for (const estimate of estimates) {
    seen.add(estimate.skill);
    const budget = budgets[estimate.skill];
    const status = budget === undefined
      ? "missing-budget"
      : estimate.tokens > budget
        ? "over"
        : estimate.tokens <= budget - TOKEN_BUDGET_SHRINK_REPORT_MIN
          ? "under"
          : "ok";
    rows.push({
      skill: estimate.skill,
      tokens: estimate.tokens,
      budget: budget ?? null,
      defaultLens: estimate.defaultLens,
      files: estimate.files,
      status,
    });

    if (budget === undefined) {
      failures.push(
        `token-budget: ${estimate.skill} has no recorded budget (${estimate.tokens} tokens estimated); add it to ${DEFAULT_TOKEN_BUDGETS_PATH} after review`,
      );
      continue;
    }
    if (estimate.tokens > budget) {
      failures.push(
        `token-budget: ${estimate.skill} activation estimate is ${estimate.tokens} tokens; budget is ${budget}. Trim SKILL.md / default lens / rules.md, or consciously raise the budget in ${DEFAULT_TOKEN_BUDGETS_PATH} via review`,
      );
    } else if (estimate.tokens <= budget - TOKEN_BUDGET_SHRINK_REPORT_MIN) {
      notices.push(
        `token-budget: ${estimate.skill} estimate ${estimate.tokens} is meaningfully under budget ${budget}; lower the budget in ${DEFAULT_TOKEN_BUDGETS_PATH} (or pass --update-budgets)`,
      );
    }
  }

  for (const skill of Object.keys(budgets).sort((left, right) => left.localeCompare(right))) {
    if (!seen.has(skill)) {
      failures.push(`token-budget: stale budget entry for removed skill '${skill}'; remove it from ${DEFAULT_TOKEN_BUDGETS_PATH}`);
    }
  }

  return { failures, notices, rows };
}

export function buildTokenBudgets(estimates) {
  const budgets = {};
  for (const estimate of estimates) {
    budgets[estimate.skill] = estimate.tokens;
  }
  return budgets;
}

export function formatTokenBudgetTable(rows) {
  const skillWidth = Math.max(5, ...rows.map((row) => row.skill.length));
  const tokenWidth = Math.max(6, ...rows.map((row) => String(row.tokens).length));
  const budgetWidth = Math.max(6, ...rows.map((row) => String(row.budget ?? "-").length));
  const header = `${"skill".padEnd(skillWidth)}  ${"tokens".padStart(tokenWidth)}  ${"budget".padStart(budgetWidth)}  status  files`;
  const lines = [header, "-".repeat(header.length)];
  for (const row of rows) {
    const files = row.files.join(" + ") || "(none)";
    lines.push(
      `${row.skill.padEnd(skillWidth)}  ${String(row.tokens).padStart(tokenWidth)}  ${String(row.budget ?? "-").padStart(budgetWidth)}  ${row.status.padEnd(6)}  ${files}`,
    );
  }
  return lines.join("\n");
}
