// Activation-token estimates: ceil(chars/4) over SKILL.md + default lens + rules.md.
// Default lens is parsed from AGENTS.md then SKILL.md (no hard-coded skill map).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const CHARS_PER_TOKEN = 4;
export const TOKEN_BUDGET_SHRINK_REPORT_MIN = 16;
export const DEFAULT_TOKEN_BUDGETS_PATH = "scripts/skill-token-budgets.json";

const DEFAULT_LENS_PATTERNS = Object.freeze([
  /(?:load\s+)?the\s+default\s+`(?<rel>references\/lens-[a-z0-9-]+\.md)`/iu,
  /`(?<rel>references\/lens-[a-z0-9-]+\.md)`\s*\(default\)/iu,
  /\(default\s+`(?<rel>references\/lens-[a-z0-9-]+\.md)`\)/iu,
]);

export function estimateTokensFromChars(charCount) {
  if (charCount <= 0) return 0;
  return Math.ceil(charCount / CHARS_PER_TOKEN);
}

export function resolveDefaultLensRelPath(skillDir) {
  for (const fileName of ["AGENTS.md", "SKILL.md"]) {
    const fullPath = path.join(skillDir, fileName);
    if (!existsSync(fullPath)) continue;
    const text = readFileSync(fullPath, "utf8");
    for (const pattern of DEFAULT_LENS_PATTERNS) {
      const match = pattern.exec(text);
      if (match?.groups?.rel) return match.groups.rel;
    }
  }
  return null;
}

function appendFileChars(skillDir, relFile, state) {
  const fullPath = path.join(skillDir, relFile);
  if (!existsSync(fullPath)) return;
  state.chars += readFileSync(fullPath, "utf8").length;
  state.files.push(relFile);
}

export function estimateSkillActivationTokens(skillDir, skillName = path.basename(skillDir)) {
  const state = { chars: 0, files: [] };
  appendFileChars(skillDir, "SKILL.md", state);

  const defaultLens = resolveDefaultLensRelPath(skillDir);
  if (defaultLens) appendFileChars(skillDir, defaultLens, state);

  appendFileChars(skillDir, "references/rules.md", state);

  return {
    skill: skillName,
    tokens: estimateTokensFromChars(state.chars),
    chars: state.chars,
    files: state.files,
    defaultLens,
  };
}

export function collectSkillActivationTokenEstimates({ skillsDir, skillNames }) {
  return skillNames.map((skill) => estimateSkillActivationTokens(path.join(skillsDir, skill), skill));
}

function validateTokenBudgetsShape(budgets, failures) {
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
