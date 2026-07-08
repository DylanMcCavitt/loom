# Blueprint rules

## rule/canonical-name
Status: accepted
Scope: blueprint
Rule: Use the canonical shared name `blueprint` everywhere the package is referenced; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical context may mention superseded candidates only when marked as historical context.
Source: docs/agent-contract.md#namingRules
Bad example: `omp-blueprint`
Good example: `blueprint`
Assumptions: Names are canonical and identical in every harness.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: blueprint
Rule: Act only inside the input packet and return the output packet fields listed in `SKILL.md`.
Why: Parent agents own integration, proof selection, tracker state, and launch gates.
Exceptions: Return a blocker when the packet lacks required scope, proof, or allowed files.
Source: docs/agent-contract.md#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none
