# Lab rules

## rule/canonical-name
Status: accepted
Scope: lab
Rule: Use the canonical shared name `lab` everywhere the package is referenced; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical context may mention superseded candidates only when marked as historical context.
Source: docs/agent-contract.md#namingRules
Bad example: `omp-lab`
Good example: `lab`
Assumptions: Names are canonical and identical in every harness.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: lab
Rule: Act only inside the input packet and return the output packet fields listed in `SKILL.md`.
Why: Parent agents own integration, proof selection, tracker state, and launch gates.
Exceptions: Return a blocker when the packet lacks required scope, proof, or allowed files.
Source: docs/agent-contract.md#agents
Bad example: Fixing adjacent findings not named in the packet.
Good example: Returning one scoped finding with proof and residual risk.
Assumptions: The active issue/PR is the parent boundary.
Open decisions: none

## rule/lens-scope
Status: accepted
Scope: lab
Rule: Load only the packet-named lens reference (default `lens-command-proof.md` when absent); a lens selects proof guidance and never widens packet scope, changes the prove boundary, or turns proof into implementation.
Why: Lenses replace the retired spidertron agent and proof-pass skill; keeping them selection-only preserves proof-only behavior and small context.
Exceptions: A proof coordinator may fan out one lab child per lens in parallel when each lens has a distinct evidence contract.
Source: docs/agent-contract.md#lensPolicy
Bad example: A ui-proof-lens run that redesigns the UI or fixes the defect it observed.
Good example: A smoke-proof-lens run that grades the claim `partially proven` and names the exact blocker.
Assumptions: The input packet carries the `lens` field per the shared contract.
Open decisions: none

## rule/proof-class-honesty
Status: accepted
Scope: lab
Rule: Grade every proof run with an explicit class (proven, partially proven, plumbing evidence only, blocked, unproven) and never call a run countable when data, external access, permissions, or acceptance criteria are incomplete.
Why: Separating "code/checks pass" from "operational proof passed" prevents launch gates from consuming inflated evidence.
Exceptions: Command-only proofs may omit the class when the packet's expected evidence is a single named check result.
Source: skills/lab/references/lens-smoke-proof.md
Bad example: Reporting "verified" because unit tests passed while the live path was never exercised.
Good example: Reporting "plumbing evidence only: checks pass, external API unreachable; next action: rerun with credentials."
Assumptions: The packet names the acceptance criteria or proof standard.
Open decisions: none
