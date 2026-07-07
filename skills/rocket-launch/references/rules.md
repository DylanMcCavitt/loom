# Rocket Launch rules

## rule/canonical-name
Status: accepted
Scope: rocket-launch
Rule: Use the canonical shared name `rocket-launch` in packages and adapter manifests; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical fixtures may mention superseded OMP-prefixed candidates when marked as historical context.
Source: docs/agent-contract.md#namingRules
Bad example: `omp-rocket-launch`
Good example: `rocket-launch`
Assumptions: Adapter renderers translate format only.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: rocket-launch
Rule: Act only inside the input packet and return the output packet fields listed in `SKILL.md`.
Why: Parent agents own integration, proof selection, tracker state, and launch gates.
Exceptions: Return a blocker when the packet lacks required scope, proof, or allowed files.
Source: docs/agent-contract.md#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none

## rule/retro-writeback
Status: accepted
Scope: rocket-launch
Rule: After a successful merge, run `node scripts/retro-packet.mjs --pr <merged-pr-number>` and treat the generated retro PR as the human-review gate for evidence write-back.
Why: Launch is the point where proof, review, acceptance, and diff evidence are fresh enough to close the guidance feedback loop without editing accepted skills directly.
Exceptions: If the retro generator fails, record the failure in the launch record and open a blocker instead of hand-editing accepted guidance.
Source: docs/agent-contract.md#evidenceIntake
Bad example: Merging a retro PR automatically or copying a generated rule candidate straight into `references/rules.md`.
Good example: Opening the generated `retro/pr-{number}/` packet PR and waiting for human review to accept, redirect, defer, or reject each candidate.
Assumptions: `scripts/retro-packet.mjs` exists on the merged base branch.
Open decisions: none
