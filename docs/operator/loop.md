# Loom operating loop

Use this runbook to execute one self-improving Loom iteration. It restates the durable pattern; it does not depend on chat memory, local scratch paths, or a specific agent session.

## Design principles

- **External state over chat memory.** The tracker issue, branch, PR body, proof output, tracker comment, retro packet, and handoff doc are the durable record.
- **Machine-verifiable gates.** A loop does not advance on confidence alone: `npm run check` plus the issue's named proof must be green.
- **Worker != grader.** The implementer (`roboports`) does not grade its own work; `biters` reviews and `lab` proves through named lenses.
- **Fresh context per iteration.** Each issue starts from a compact packet and a clean worktree, not accumulated chat state.
- **Hard budgets.** Stop instead of improvising when budget is exhausted, a gate is red, or the work would widen scope.

## Roster links

Use the shared roster vocabulary from [`docs/agent-contract.md`](../agent-contract.md): `blueprint`, `roboports`, `biters`, `lab`, `rocket-launch`, and `belt`. Select lenses in the packet; do not duplicate skill instructions in this runbook.

## Plan

1. Pick **one** scoped tracker issue with acceptance criteria.
2. Confirm the issue is ready for `implement` mode: the expected behavior, non-goals, and proof are explicit enough for a fresh worker.
3. Use `blueprint` only for shape work that is not ready; once the packet is ready, hand it to `roboports`.
4. Name the branch/worktree/PR around the tracker id so the tracker bridge can follow the work.

## Act

1. Start a fresh-context `roboports` worker from the issue packet.
2. Create that worker's **own** worktree; never share an active worktree between issues.
3. Preserve the invariant: one issue -> one branch/worktree -> one PR, and the branch carries the issue id.
4. Implement only the acceptance criteria. If a finding appears, route one compact finding at a time through `repair-pack` instead of widening the issue.

## Verify

1. Run the repository gate: `npm run check`.
2. Run the issue's **named proof**. The proof name belongs in the packet and PR body (for example, a command-proof, smoke-proof, UI-proof, or the bench/eval gate when that stage owns the evidence).
3. Keep worker and grader separate: `biters` reviews the diff through the requested lens, and `lab` records proof evidence through the requested proof lens.
4. A red validator, failing test, missing named proof, or unreviewed material risk is a red gate.

## Record

1. Open one review-ready PR for the branch.
2. Put evidence in durable state: PR body summary, acceptance checklist, literal `npm run check` result, literal named-proof output, and unresolved risk.
3. Add the tracker comment required by the packet or tracker bridge so the issue points at the PR and evidence.
4. Feed the result into the **retro generator stage** as a retro packet: issue id, branch, PR, loaded lenses, changed files, proof, review findings, stop reason, and follow-up candidates. Reference the stage by name; do not couple the packet to a hard-coded file path. When the named proof is a bench/eval gate, follow [`evals.md`](evals.md) for judge scorecards, roboports `--score` JSON, and ablation manifests.

## Stop

Stop the loop and write a durable `belt` handoff doc when any stop condition is true:

- **Budget exhaustion:** the time, context, depth, or packet budget is exhausted before the gate is green.
- **Red gate:** `npm run check`, the named proof, bench/eval gate, or reviewer gate fails.
- **Scope widening:** the issue needs new acceptance criteria, another repo, another tracker issue, a different mode, or a decision not present in the packet.

A handoff names the issue, branch/worktree, PR if present, current gate state, proof already run, exact blocker, and the next safe action. Do not merge, close the tracker, or start a second issue from inside this loop; `rocket-launch` owns launch gates after review is ready.

## CLI checklist

Run the printable contract locally:

```sh
npm run loop
```

The command is offline and read-only. It prints the same stage names, gates, and stop conditions from this runbook; it does not spawn agents, contact trackers, or mutate worktrees.
