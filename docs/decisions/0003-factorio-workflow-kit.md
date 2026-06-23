# ADR 0003: Factorio-Themed Workflow Kit Replaces The Planning Lane

## Status

Accepted.

## Context

Loom carries a planning/issue lane of skills that default to GitHub Issues:
`triage`, `to-prd`, `to-issues`, `issue-execution`, and `gh-issue-thread-chain`,
plus the bootstrap trio `repo-workflow-bootstrap`, `workflow-kit`, and
`setup-matt-pocock-skills`. The Linear MCP (initiatives, projects, milestones,
issues/sub-issues, cycles, labels, comments, documents, status updates) is
available but no skill uses it.

The operator wants a curated, Factorio-themed workflow kit that is Linear-first,
bridges to GitHub PRs, is purpose-built to adapt to any repo, and bakes in a
clean-code / minimal-diff doctrine (inspired by, not copied from, the `ponytail`
skill). The kit must be eval-able before release.

A second planning convention living beside the existing one is prohibited by the
repo's own no-second-convention and clean-cutover rules. So the kit cannot be an
additive family; it must replace the lane it themes.

## Decision

A Factorio-themed kit becomes loom's single planning/issue/execution lane.

1. **Clean cutover.** The kit replaces the GitHub-default planning lane. Replaced
   skills are retired (not aliased, not duplicated) once the kit's MVP is proven.
2. **System-of-record split.** Linear owns planning (initiatives, projects,
   milestones, issues/sub-issues, cycles, triage state, docs, status). GitHub
   owns code delivery (branch/worktree/PR/CI). The two are bridged through
   Linear's native GitHub integration: the branch name carries the Linear issue
   id; the PR auto-links and auto-closes the issue on merge.
3. **Naming.** Skills use clean Factorio nouns with no harness/theme prefix
   (`prospect`, `blueprint`, `ghosts`, `roboports`, `rocket-launch`, `assembler`,
   `main-bus`, `space-age`, `research`, `modules`, `quality`, `inserter`).
   Routing is carried entirely by each `description`'s concrete `Use when ...`
   trigger; the family is grouped by a manifest, not a prefix.
4. **Clean-code doctrine.** A standalone doctrine skill (`bus-first`) carries an
   original Factorio-framed minimal-diff ladder. `assembler`, `roboports`,
   `rocket-launch`, and `quality` cite it. It is a skill, not a loom-wide rule,
   so it stays curatable per flow.
5. **Adaptation model.** `assembler` reads a repo once and generates a repo-local
   Markdown envelope under `.agents/envelope/` (Linear team/project/label map,
   domain glossary, commands, PR/issue/doc templates) plus optional repo-specific
   skills/agents, reusing the retired bootstrap trio's machinery. Local Factory
   Nucleus state may carry a generated/validated YAML mirror at
   `~/.loom/factory-nucleus/<id>/envelope/envelope.yaml`; that mirror is not a
   second binding point. `roboports` execute issues end-to-end against that
   envelope. Every kit skill reads the envelope, so behavior is dynamic per repo.
6. **Blueprints.** Canonical templates live in `blueprint/templates/` (versioned
   and eval-able in loom). `assembler` stamps repo-local copies; Linear-side
   templates are applied via `save_document` / issue-description scaffolds.
7. **Build order.** A tracer-bullet MVP ships first
   (`prospect -> blueprint -> ghosts -> roboports -> radar/proof-pass ->
   rocket-launch`, plus `bus-first` and a minimal `assembler` substrate), then
   the rest is enrichment.
8. **Eval.** Each skill is authored eval-first and gated by layers: structural
   lint (`validate-skills.mjs`), content-envelope `node:test`, trigger
   `evals.json` (positive + adversarial/typo + negative/near-miss), a golden-path
   behavioral eval against mock Linear/GitHub fixtures in offline CI, an opt-in
   live sandbox smoke before release, and a minimal-diff benchmark for
   `bus-first`.

## Rejected Alternative

- **Additive coexisting family** (Factorio skills beside the existing lane):
  rejected; it creates two skills that match the same request and violates the
  no-second-convention rule.
- **Loom-wide rule for the clean-code doctrine**: rejected; it leaks the kit's
  opinion onto every unrelated repo and is not curatable per flow.
- **Linear-only, PRs incidental**: rejected; review, CI, and merge gates live on
  GitHub, so a Linear-only kit is blind to them.

## Consequences

- The replaced skills and their tests, `canonical-manifest.md` rows, and README
  test tables are removed/updated in the cleanup phase, gated on the MVP working.
- New skill names must clear `validate-skills.mjs` collision checks against
  existing loom and global skills before release.
- The kit depends on the Linear MCP for planning side effects and on Linear's
  GitHub integration for the bridge; `.agents/envelope/` is the per-repo binding
  point, with local-state YAML only mirroring it for validation/runtime checks.
- If loom ever needs a tracker-agnostic planning lane again, this ADR must be
  superseded.
