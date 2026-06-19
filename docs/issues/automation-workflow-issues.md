# Automation workflow issue packets

GitHub publication was not attempted because this checkout has no configured GitHub remote or target repository. These packets are saved locally for version-controlled handoff.

## 1. Add automation skill validation for version-controlled skills

**Type:** AFK

### What to build

Add a validation path that checks future automation skills under the version-controlled skill directory before they are installed or relied on.

### Acceptance criteria

- [ ] Every skill directory is exactly one level under `.agents/skills/<name>/SKILL.md` or the chosen repo-local equivalent.
- [ ] Every `SKILL.md` has frontmatter `name` and `description`.
- [ ] Every description contains concrete `Use when ...` trigger language.
- [ ] Validation fails on duplicate skill names, duplicate names that collide with existing global skills such as `handoff`, and API-key/token-looking strings.
- [ ] Validation does not require live network access.

### Non-goals

- Do not install, activate, or rewrite any automation skill as part of this slice.
- Do not require GitHub or any network-backed tracker to run validation.

### Relevant files / areas

- `~/.omp/agent/workflow-kit/README.md` for workflow-kit skill rules.
- `omp/.omp/agent/` for the current repo-local agent configuration tree.
- Existing global skills, especially `handoff`, for collision checks.

### Test / check expectations

- Run the validator against at least one good skill fixture and one bad fixture with missing frontmatter.
- Observe the good fixture pass and the bad fixture fail with a visible error.

### Risks / migration notes

- Keep validation deterministic and offline so it can run in AFK agent worktrees.
- Avoid hard-coding only the current global skill set; make collisions easy to extend as more global skills appear.

### Desired base branch

main

### Blocked by

None - can start immediately

## 2. Add automation routing fixtures that preserve existing skills

**Type:** AFK

### What to build

Add fixture-driven tests that prove new automation routing points to existing specialized skills instead of duplicating or stealing their work.

### Acceptance criteria

- [ ] Input like `tests are failing, debug it` routes to `diagnose`.
- [ ] Input like `start a fresh chat with this context` routes to `thread-control` plus existing `handoff` semantics.
- [ ] Input like `split this PRD into implementation tickets` routes to `to-issues`.
- [ ] Input like `inspect browser bug` routes to `chrome-devtools` or `computer-use` based on browser-vs-desktop wording.
- [ ] Fixtures explicitly assert forbidden routes where a new automation skill would steal work from `handoff`, `diagnose`, `tdd`, `to-issues`, or `to-prd`.

### Non-goals

- Do not implement the new automation skills in this slice.
- Do not change the behavior of existing global skills.

### Relevant files / areas

- Existing global skills: `handoff`, `diagnose`, `tdd`, `to-issues`, `to-prd`, `prototype`, `workflow-kit`, `computer-use`, `chrome-devtools`, and `openai-docs`.
- New automation skills introduced by later issues.
- Any route-selection fixtures or tests added by issue 1.

### Test / check expectations

- Run the routing fixture test.
- Observe all expected route assertions and forbidden route assertions pass.

### Risks / migration notes

- This suite should protect existing specialized skills from overlap as new automation skills are added.
- Keep fixture wording realistic enough to catch accidental trigger drift.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills

## 3. Add thread-control skill as a router to handoff, not a replacement

**Type:** AFK

### What to build

Add a version-controlled `thread-control` skill that decides whether to continue in the current chat or start a new visible thread, then invokes or instructs use of the existing `handoff` skill when switching.

### Acceptance criteria

- [ ] The skill description has this concrete trigger: `Use when the user asks whether to continue in this chat, switch context, start a new thread, resume a handoff, or make context health visible.`
- [ ] The skill never claims to write handoffs itself; it delegates handoff creation to the existing `handoff` skill.
- [ ] The skill defines context-risk signals: many unrelated touched files, changed goal, stale verification, unresolved decisions, active subagents with divergent scope, issue/branch mismatch, and stale file assumptions.
- [ ] The skill emits a visible next-thread starter when switching is recommended.

### Non-goals

- Do not create a duplicate `handoff` skill.
- Do not implement Pi extension commands in this slice.

### Relevant files / areas

- Existing `handoff` skill at `skill://handoff`.
- Project-specific skill location under `.agents/skills/` or the chosen repo-local equivalent.
- Static skill validation from issue 1.

### Test / check expectations

- Static skill validation passes.
- Routing fixture for `start a fresh chat with this context` includes both `thread-control` and `handoff`.

### Risks / migration notes

- Thread switching must remain visible to the user; the skill should not silently discard context.
- Handoff content should stay owned by the existing `handoff` skill to avoid divergent templates.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills

## 4. Add agent-recipes skill for high-quality subagent prompts

**Type:** AFK

### What to build

Add a version-controlled `agent-recipes` skill that turns short intents such as review, debug, tests, parallel implementation, and issue work into complete task-subagent assignments.

### Acceptance criteria

- [ ] The skill description has this concrete trigger: `Use when the user wants to spawn agents from a short intent such as review, debug, tests, parallel implementation, or issue work.`
- [ ] Every recipe includes target, change, acceptance, and explicit no-project-wide-gates instruction for subagents.
- [ ] Recipes are role-specific, not generic cloned workers.
- [ ] The skill tells the main agent to batch independent tasks in one `task` call.

### Non-goals

- Do not spawn subagents from the skill during validation.
- Do not replace the task tool contract or weaken its no-project-wide-gates rule for subagents.

### Relevant files / areas

- Active harness instructions for the `task` tool contract.
- Project-specific skill location under `.agents/skills/` or the chosen repo-local equivalent.
- Static skill validation from issue 1.

### Test / check expectations

- Static skill validation passes.
- Routing fixture for `/spawn review` or `spawn review agents` selects `agent-recipes`.

### Risks / migration notes

- Recipes should create sharper roles and complete assignments without encouraging agents to run project-wide gates.
- Keep examples small enough to maintain while still covering common intents.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills

## 5. Add execute-plan skill for explicit go-ahead automation

**Type:** AFK

### What to build

Add a version-controlled `execute-plan` skill for moments where the user says to proceed with the current plan and stop discussing.

### Acceptance criteria

- [ ] The skill description has this concrete trigger: `Use when the user says go, execute, proceed, ship the current plan, or stop discussing and implement.`
- [ ] The skill requires converting any explicit checklist into todos before work starts.
- [ ] The skill requires delegation for parallelizable multi-file work.
- [ ] The skill requires verification before yielding.
- [ ] The skill asks only for missing external decisions that tools cannot answer.

### Non-goals

- Do not make this skill close issues or prepare PR closeout evidence.
- Do not bypass existing workflow instructions for todos, delegation, or verification.

### Relevant files / areas

- Existing workflow instructions that require todos, delegation, and verification.
- Routing fixtures from issue 2.
- Project-specific skill location under `.agents/skills/` or the chosen repo-local equivalent.

### Test / check expectations

- Static validation passes.
- Routing fixture for `go ahead and do the current plan` selects `execute-plan` and does not select `to-issues`.

### Risks / migration notes

- The trigger must distinguish execution from issue conversion; `go` should not route to `to-issues`.
- The skill should make missing external decisions explicit instead of asking for repo facts that tools can inspect.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills
- Add automation routing fixtures that preserve existing skills

## 6. Add issue-autopilot skill for one issue to one PR workflow

**Type:** AFK

### What to build

Add a version-controlled `issue-autopilot` skill that starts or finishes one issue using project conventions, active issue docs, branch/worktree rules, acceptance criteria, and verification.

### Acceptance criteria

- [ ] The skill description has this concrete trigger: `Use when the user asks to start, continue, or ship one tracked issue end-to-end.`
- [ ] The skill preserves the existing global rule: one issue/task to one branch/worktree to one PR unless repo docs say otherwise.
- [ ] The skill requires reading repo-local `.omp/AGENTS.md` and `docs/agents/*` when present.
- [ ] The skill uses existing `triage`, `diagnose`, `tdd`, or `handoff` skills when those triggers fit instead of duplicating them.

### Non-goals

- Do not create branches, worktrees, issues, or PRs in this slice.
- Do not replace specialized triage, diagnosis, TDD, or handoff workflows.

### Relevant files / areas

- `omp/.omp/agent/AGENTS.md` for the one issue/task to one branch/worktree to one PR rule and verification expectations.
- `~/.omp/agent/workflow-kit/README.md` for project-layer workflow-kit guidance.
- Routing fixtures from issue 2.

### Test / check expectations

- Static validation passes.
- Routing fixture for `start issue 42 and work it to PR` selects `issue-autopilot`.

### Risks / migration notes

- The skill must not assume a GitHub target when the checkout lacks tracker configuration.
- Keep closeout behavior tied to an active tracked issue, not a generic implementation plan.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills
- Add automation routing fixtures that preserve existing skills

## 7. Add workflow cockpit Pi extension with visible context and routing commands

**Type:** AFK

### What to build

Add a custom Pi extension beside `github-issues-panel.js` that exposes visible commands for context health and routing without implementing the skills itself.

### Acceptance criteria

- [ ] Extension registers `/ctx` to show repo, active issue if known, branch/worktree if available, touched-file count if available, last verification if recorded, active agents if available, and context-risk flags.
- [ ] Extension registers `/route <intent>` to display the recommended existing skill/tool route for the intent.
- [ ] Extension registers `/new-thread` to display a next-thread starter that tells the user to invoke/use the existing `handoff` skill with the current focus.
- [ ] Extension registers `/spawn-recipe <intent>` to paste or display a task-subagent assignment recipe generated from the `agent-recipes` patterns.
- [ ] Missing optional state renders as `unknown`, not as an exception.
- [ ] `/new-thread` references existing handoff behavior and does not write handoffs itself.
- [ ] `/route` prefers existing specialized skills over new automation skills when applicable.

### Non-goals

- Do not implement skill behavior inside the extension.
- Do not silently execute shell, GitHub, or destructive commands from these routes.
- Do not add `/go` or `/ship` in this slice.

### Relevant files / areas

- `omp/.omp/agent/extensions/github-issues-panel.js` for Pi extension registration style, especially `pi.setLabel?.(...)`, `pi.registerCommand(...)`, `ctx.ui?.notify?.(...)`, and `ctx.ui?.setWidget?.(...)`.
- `thread-control` skill from issue 3.
- `agent-recipes` skill from issue 4.
- Routing fixtures from issue 2.

### Test / check expectations

- Mock the Pi API and assert every command registers.
- Assert command handlers notify or render visible output.
- Assert invalid or missing args produce visible errors without throwing.

### Risks / migration notes

- Missing context should degrade to `unknown`, not block the cockpit.
- The extension should stay a visible router; skill ownership remains with the skill files.

### Desired base branch

main

### Blocked by

- Add automation routing fixtures that preserve existing skills
- Add thread-control skill as a router to handoff, not a replacement
- Add agent-recipes skill for high-quality subagent prompts

## 8. Add go and ship commands to the workflow cockpit

**Type:** AFK

### What to build

Extend the workflow cockpit extension with `/go` and `/ship` commands that make automation visible and route to the correct skill intent.

### Acceptance criteria

- [ ] Extension registers `/go` and outputs exactly: `Proceed with the current plan. Do not ask unless blocked by missing external information. Preserve unrelated changes. Use subagents for parallelizable work. Verify before yielding.`
- [ ] Extension registers `/ship` and outputs exactly: `Finish the active issue end-to-end. Check acceptance criteria, implement missing work, verify behavior, and prepare closeout evidence. Ask only if the active issue or target repository is unknown.`
- [ ] `/go` does not imply issue closeout.
- [ ] `/ship` requires active issue context or emits a visible error telling the user to set or provide one.
- [ ] Both commands are visible and reversible: they paste or display prompts, not silently execute destructive commands.

### Non-goals

- Do not call shell, GitHub, branch, worktree, or PR APIs from `/go` or `/ship`.
- Do not change the prompts from the exact strings above without updating the tests.

### Relevant files / areas

- Workflow cockpit extension from issue 7.
- `execute-plan` skill from issue 5.
- `issue-autopilot` skill from issue 6.

### Test / check expectations

- Mock extension test asserts `/go` and `/ship` output exactly the prompts above.
- Mock extension test asserts neither command calls shell or GitHub APIs.

### Risks / migration notes

- `/ship` must not become a generic execute button; it is issue closeout and needs active issue context.
- Exact-prompt tests are intentional here because the command contract is user-visible.

### Desired base branch

main

### Blocked by

- Add execute-plan skill for explicit go-ahead automation
- Add issue-autopilot skill for one issue to one PR workflow
- Add workflow cockpit Pi extension with visible context and routing commands

## 9. Add automation workflow benchmark suite

**Type:** AFK

### What to build

Add a separate benchmark suite for automation workflow friction so it does not get mixed with the existing/current `scripts/autoresearch.sh` traceability benchmark.

### Acceptance criteria

- [ ] Primary metric is `automation_workflow_friction`.
- [ ] Metrics include `automation_command_count`, `route_accuracy_score`, `duplicate_skill_overlap_count`, `context_visibility_score`, `new_thread_reuses_handoff_skill`, `unsafe_autonomy_violations`, `spawn_recipe_count`, `commands_to_start_issue`, and `commands_to_safe_handoff`.
- [ ] Hard checks require `duplicate_skill_overlap_count=0`, `unsafe_autonomy_violations=0`, and `new_thread_reuses_handoff_skill=1`.
- [ ] The suite is separate from the current `scripts/autoresearch.sh` unless execution explicitly chooses to replace that script.
- [ ] The current `scripts/autoresearch.sh` remains treated as a full-flow traceability benchmark, not the harness-friction benchmark described in `/tmp/oh-my-pi-harness-benchmark-handoff.md`.

### Non-goals

- Do not replace `scripts/autoresearch.sh` unless the issue implementer explicitly chooses and documents that migration.
- Do not optimize benchmark scores by weakening hard checks.

### Relevant files / areas

- `scripts/autoresearch.sh` for the current full-flow traceability benchmark boundary.
- `/tmp/oh-my-pi-harness-benchmark-handoff.md` for prior harness benchmark context.
- Workflow cockpit extension from issues 7 and 8.
- Skill validation and routing fixtures from issues 1 and 2.

### Test / check expectations

- Run the benchmark.
- Observe all hard checks pass and all metrics are finite.

### Risks / migration notes

- Keep automation workflow friction metrics separate from research traceability metrics so regressions are diagnosable.
- Hard checks should fail loudly on duplicate skill overlap or unsafe autonomy.

### Desired base branch

main

### Blocked by

- Add automation skill validation for version-controlled skills
- Add automation routing fixtures that preserve existing skills
- Add workflow cockpit Pi extension with visible context and routing commands
- Add go and ship commands to the workflow cockpit
