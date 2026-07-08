# Roboports lens: issue-delivery (default)

Loaded when the packet names `lens: issue-delivery` or names no lens at all.
Coordinates the bounded build network that turns one *ready* tracked issue into
landed code: one issue → one branch/worktree → one PR, no more.

## The bridge

Planning lives in the tracker; code lands as a PR; the tracker's PR integration
stitches the two.

- **One issue → one branch/worktree → one PR** unless the repo envelope says
  otherwise.
- **The branch name carries the tracked issue id.** The PR auto-links and, on
  merge, auto-closes the issue. Never craft a branch that drops the id.

## Required reading

1. The repo envelope: tracker team/project/label map, domain glossary,
   branch/PR conventions, and build/test commands. Never hardcode commands or
   a tracker.
2. The active tracked issue: description, comments, acceptance criteria.
3. The repo's agent context and any architecture/ADR/domain docs the issue
   names.

## Localized fanout discipline

Do not wire every subagent into one giant global network. Fan out in
*localized* small batches: each child gets a bounded, **disjoint write scope**
and a single lens.

- Default to the main agent implementing the first pass; spawn children only
  when they cut risk or context load.
- Give implementation children disjoint write scopes; give reviewers distinct
  lenses (acceptance/spec vs. safety/maintainability).
- Do not spawn separate "read issue", "implement", "review findings", and
  "fix findings" children — that makes coordination the work.

## Flow

1. Confirm scope, blockers, owned behavior, and the proof plan from the
   issue's acceptance criteria; create the one branch/worktree (id in the
   name) if absent.
2. Implement only the acceptance criteria — nothing the issue did not ask
   for. Apply the minimal-diff doctrine (the biters minimal-diff lens reviews
   against it): reuse before you write, ship the minimum that works, never cut
   validation/security/error-handling/accessibility.
3. Run the envelope's targeted checks that prove the changed behavior.
4. Fan out localized reviewer children (`biters`, one per review lens) when
   the change is non-trivial; route fixes for individual findings to
   `repair-pack`; rerun the relevant checks once across the union of changes.
5. Prepare a review packet and open or update the PR.

## Specialist routing

- Bug, failing check, exception, or regression: route to the operator-local
  `debug-tools` skill's diagnose loop when installed (see
  docs/skills/operator-local-manifest.md); otherwise run the
  reproduce→minimise→hypothesise→instrument→fix→regression-test loop inline
  before patching.
- Proof-only evidence for implemented behavior: delegate to `lab` (the lab
  ui-proof lens for user-visible flows) before launch gates rely on it.
- Drift between repo, tracker, and proof state: the biters drift lens checks
  only and does not mutate state.
- Triage of incoming, not-yet-ready work: blueprint's triage lens. This lens
  only builds an already-tracked, ready issue.
- Hand the finished PR to `rocket-launch`; this lens does not own closeout.

## Review packet

- the tracked issue id and its acceptance criteria
- changed-file list and the relevant diff/excerpts
- checks already run (and any unrun, with reasons)
- exact questions per reviewer lens
- remaining blockers, if any

## Invariants

- One issue → one branch/worktree → one PR; the branch carries the issue id.
- Implements only the acceptance criteria; reads commands from the envelope.
- Prepares the PR review-ready but never merges, closes, or silently widens.
