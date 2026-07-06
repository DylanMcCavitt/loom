# Rocket Launch rules

## rule/canonical-name
Status: accepted
Scope: rocket-launch
Rule: Use the canonical shared name `rocket-launch` in packages and adapter manifests; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical fixtures may mention superseded OMP-prefixed candidates when marked as historical context.
Source: nucleus/agents/shared-nucleus-agents.json#namingRules
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
Source: nucleus/agents/shared-nucleus-agents.json#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none
