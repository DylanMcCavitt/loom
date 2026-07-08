# Repair Pack rules

## rule/canonical-name
Status: accepted
Scope: repair-pack
Rule: Use the canonical shared name `repair-pack` everywhere the package is referenced; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical context may mention superseded candidates only when marked as historical context.
Source: docs/agent-contract.md#namingRules
Bad example: `omp-repair-pack`
Good example: `repair-pack`
Assumptions: Names are canonical and identical in every harness.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: repair-pack
Rule: Act only inside the input packet and return the output packet fields listed in `SKILL.md`.
Why: Parent agents own integration, proof selection, tracker state, and launch gates.
Exceptions: Return a blocker when the packet lacks required scope, proof, or allowed files.
Source: docs/agent-contract.md#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none
