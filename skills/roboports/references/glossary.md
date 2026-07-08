# Roboports glossary

- Agent: delegated specialist executing bounded work packets selected by mode and source routing.
- Harness adapter: model-agnostic format/runtime translator; adapters preserve names and behavior contracts.
- Packet: bounded input and output fields controlling scope, proof, and reporting.
- Coverage gap: missing or unresolved standard that blocks durable guidance.
- Human decision log: accepted evidence-intake decision recording scope, rationale, evidence, exceptions, approver, target file, and checks.
- Lens: packet-selected variant guidance (`references/lens-<name>.md`); selects guidance only and never widens scope.
- The bridge: the branch name carries the tracked issue id so the PR auto-links and the merge auto-closes the issue.
- Behavior-preserving refactor: same behavior, higher tier — no new features, no output changes, existing tests green before and after.
- Recycle: delete unreachable/dead code or salvage duplication onto the existing shared lane; never load-bearing guards.
- Load-bearing guard: trust-boundary validation, data-loss/error handling, security checks, or accessibility — never deleted in the name of cleanup.
- Baseline / delta: the measured before value and the measured change; the performance lens makes no unverified claims.
- Bottleneck: the proven limiting step; the only thing the performance lens optimizes.
- Diminishing returns: the stop signal — the next gain costs more than it returns.
