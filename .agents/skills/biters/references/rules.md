# Biters rules

## rule/canonical-name
Status: accepted
Scope: biters
Rule: Use the canonical shared name `biters` in packages and adapter manifests; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical fixtures may mention superseded OMP-prefixed candidates when marked as historical context.
Source: nucleus/agents/shared-nucleus-agents.json#namingRules
Bad example: `omp-biters`
Good example: `biters`
Assumptions: Adapter renderers translate format only.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: biters
Rule: Act only inside the input packet and return the output packet fields listed in `SKILL.md`.
Why: Parent agents own integration, proof selection, tracker state, and launch gates.
Exceptions: Return a blocker when the packet lacks required scope, proof, or allowed files.
Source: nucleus/agents/shared-nucleus-agents.json#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none

## rule/lens-scope
Status: accepted
Scope: biters
Rule: Load only the packet-named lens reference (default `lens-correctness.md` when absent); a lens selects guidance and never widens packet scope, changes the review boundary, or grants delegation authority.
Why: Lenses replace the retired spitters and radar review roles and carry the minimal-diff doctrine; keeping them selection-only preserves the shared contract's mode boundaries and small context.
Exceptions: A review coordinator may fan out one biters child per lens in parallel when each lens has a distinct finding contract.
Source: nucleus/agents/shared-nucleus-agents.json#lensPolicy
Bad example: A security-lens pass that also edits code or expands into general refactor review.
Good example: A minimal-diff-lens pass that returns KEEP/CUT/GUARD findings and confirms no guard was weakened.
Assumptions: The input packet carries the `lens` field per the shared contract.
Open decisions: none

## rule/guards-not-negotiable
Status: accepted
Scope: biters
Rule: Never propose removing trust-boundary validation, data-loss/failure handling, security, or accessibility; a change that dropped one of these is a finding to restore it.
Why: These guards are exactly what adversarial review exists to protect; a smaller diff never justifies a weaker wall.
Exceptions: none
Source: nucleus/skills/biters/references/lens-minimal-diff.md
Bad example: Praising a diff for deleting input validation because it shrank the change.
Good example: A GUARD finding that restores the dropped authz check, ranked by severity.
Assumptions: Guard removal is detectable from the diff and surrounding code.
Open decisions: none
