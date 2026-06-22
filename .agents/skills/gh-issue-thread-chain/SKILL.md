---
name: gh-issue-thread-chain
description: Run GitHub issue implementation chains through agent threads. Use when the user wants one agent thread per GitHub issue to create a worktree/branch, implement the issue, open a PR, run subagent PR review, create the next issue thread, and spawn a final HTML deliverable thread on what was done in the issue chain.
---

# GitHub Issue Thread Chain

Drive one GitHub issue through implementation, PR, review, and next-thread handoff.

## Flow

1. Load thread tools if needed: `create_thread`, `send_message_to_thread`, `set_thread_title`, and `read_thread`.
2. Pick the requested issue, or the next open ready issue from `gh issue list`.
3. Create an agent thread named `#<issue> <short issue title>`.
4. Start it in a fresh worktree/branch for that issue. Use repo naming conventions; otherwise use `issue-<issue>-<slug>`.
5. Prompt the thread to:
   - read the repo handoff, issue, `AGENTS.md`, architecture docs, ADRs, code, and tests in the repo's documented order
   - implement only that issue
   - run the relevant checks
   - commit, push, and open a PR with `Closes #<issue>`
   - spawn a subagent to review the PR diff
   - fix real review findings and rerun checks
   - stop on blockers or hard errors and comment simply on the issue with what is blocking or erroring
   - create the next issue thread before closeout
   - if there is no next ready issue, create a separate deliverable thread using the final deliverable rules below

## Main Or Stack

Default to mainline:

- merge the PR when review and checks are clean
- sync `main`
- create the next thread from `main`

Use a stacked PR only when the next issue is clearly dependent on the current PR and the stack will stay small:

- leave the current PR open
- create the next branch from the current PR branch
- tell the next thread it is stacked on PR `#<pr>`

If either path is valid, choose mainline unless speed or dependency order clearly favors a stack.

## Next Thread Prompt

Use a short prompt like:

```text
Implement GitHub issue #<issue> in this worktree. Follow AGENTS.md and repo docs. Open a PR, run checks, use a subagent to review the PR, fix real findings, then create the next issue thread when this issue is complete.
```

If blocked or erroring, stop and comment the blocker/error on the issue. Stop the chain when the issue is blocked or the next base branch choice needs the user.

## Final Deliverable Thread

When there is no next ready issue, create a new agent thread named `deliverable: <repo or chain name>`.

Do not prompt the deliverable thread with a vague request like "summarize what was done." Before creating the thread, gather a compact evidence packet from the chain:

- issue numbers, titles, states, links, and acceptance criteria
- PR numbers, links, merge commits, follow-up PRs, and review findings
- files and modules changed per issue
- user-facing behavior added or changed
- checks run per issue and final repo status
- unresolved blockers, halted gates, residual risks, and next actions
- any proof artifacts or handoff paths that explain operational status

The deliverable prompt must require a visual, self-contained HTML report in `outputs/` with this minimum structure:

- **Top status strip:** repo, branch/main merge state, total issues completed, open PR count, ready issue count, and current operational status.
- **What changed:** a dense visual timeline or swimlane of each issue/PR with one-sentence purpose, changed components, review outcome, and merge result.
- **Before and after:** side-by-side sections explaining what the system could do before the chain and what it can do now.
- **Working / Not Working / Unknown:** explicit cards that say what is operational, what is still blocked or halted, and what remains unproven. Use exact halt reasons and gate names.
- **Per-issue deep dives:** one section per issue with problem, acceptance criteria result, implementation details, important files, tests, review findings, and artifacts.
- **Proof and evidence:** include command/check summaries, handoff links, artifact paths, PR links, and issue links. Do not bury this in prose.
- **Risk and guardrails:** call out any unchanged safety boundaries, especially when the repo deals with money, user data, production systems, or other high-risk workflows.
- **Next actions:** concrete code or operational steps, ordered by dependency, with the exact reason each is needed.

HTML quality bar:

- The report must be visually scannable: status cards, timeline, tables, badges, callouts, and anchored sections.
- It must answer "what works, what does not, what changed, what remains risky, and what should happen next" without requiring the reader to inspect GitHub.
- It must not use generic filler, marketing copy, or decorative-only visuals.
- It must not overstate readiness. If a proof halted, the report must make the halt more prominent than any happy-path claim.
- It must be self-contained and local-friendly. Avoid external assets unless explicitly requested.
- It must write an HTML file and reply with the absolute path. If blocked, it must state the blocker instead of producing an empty or shallow artifact.
