# Belt rules

## rule/canonical-name
Status: accepted
Scope: belt
Rule: Use the canonical shared name `belt` everywhere the package is referenced; do not use `omp-`, `codex-`, or `claude-` prefixes.
Why: Shared nucleus behavior must stay portable across harnesses.
Exceptions: Historical context may mention superseded candidates only when marked as historical context.
Source: docs/agent-contract.md#namingRules
Bad example: `omp-belt`
Good example: `belt`
Assumptions: Names are canonical and identical in every harness.
Open decisions: none

## rule/packet-boundary
Status: accepted
Scope: belt
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
Scope: belt
Rule: Load only the packet-named lens reference (default `lens-handoff.md` when absent); a lens selects carrier guidance and never widens packet scope or changes the shape/review boundary.
Why: Lenses replace the retired handoff, thread-control, and resume-thread skills; keeping them selection-only preserves the shared contract's mode boundaries and small context.
Exceptions: none
Source: docs/agent-contract.md#lensPolicy
Bad example: A resume-lens run that starts editing files before the resume report is complete.
Good example: A thread-control-lens run that returns a continue-or-switch decision and routes handoff writing to the handoff lens.
Assumptions: The input packet carries the `lens` field per the shared contract.
Open decisions: none

## rule/handoff-redaction
Status: accepted
Scope: belt
Rule: Save handoff documents outside the repo (OS temp directory), reference existing artifacts by path or URL instead of duplicating them, and redact secrets, tokens, PII, and private home paths.
Why: Handoffs are runtime state, not tracked source; committed or leaky handoffs violate the repo's local-only and no-secrets rules.
Exceptions: none
Source: skills/belt/references/lens-handoff.md
Bad example: Committing a handoff containing an API token and a full conversation transcript to `docs/`.
Good example: A temp-directory handoff carrying state, proof summary, blockers, and links to the issue and PR.
Assumptions: The OS temp directory is available to the next session.
Open decisions: none
