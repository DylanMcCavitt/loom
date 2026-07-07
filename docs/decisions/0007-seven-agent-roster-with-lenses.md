# ADR 0007: Seven-Agent Roster With Lenses

## Status

Accepted.

## Context

The shared nucleus began with a 17-agent Factorio starter roster (see `docs/archive/shared-nucleus-agent-history.md`). Overlap across modes, duplicated routing, and maintenance cost motivated consolidation. LOO-154 reduced the tracked roster to seven agents; LOO-152 kept eleven repo-owned skills total (seven roster agents plus four kit utilities).

`nucleus/agents/shared-nucleus-agents.md` and `shared-nucleus-agents.json` define the machine-readable contract: request modes, delegation DAG, repair-pack loop, evidence intake, and activation gates.

## Decision

1. **One agent per mode.** The canonical roster is `blueprint`, `roboports`, `biters`, `lab`, `repair-pack`, `rocket-launch`, and `belt` — each owns a primary request mode (`shape`, `implement`, `review`, `prove`, `repair`, `launch`, and handoff).
2. **Lenses, not agents.** Behavioral variants from the retired 17-agent set survive as lens references under each agent's `references/` directory, selected by the packet `lens` field with mode defaults when absent.
3. **Packet contract.** Every delegation uses bounded input/output packets with mode, lens, loaded references, proof state, and stop reasons; machine-readable fields live in `shared-nucleus-agents.json`.
4. **Pipeline DAG.** Autonomous depth is capped at three; children never merge PRs, close tracker issues, render native harness agent files, or live-apply to HOME in this contract slice.
5. **Package shape.** Each roster agent is one Vercel-shaped package under `nucleus/skills/{agent-name}/` (AGENTS.md, SKILL.md, references/, exemplars/), rendered outward by adapters and the plugin bridge.

## Rejected Alternative

Re-expanding to seventeen tracked agents is rejected. It recreates mode overlap and contradicts the kit's minimal-diff, one-issue-one-branch delivery model.

## Consequences

Absorbed agent names map through `shared-nucleus-agents.json#absorbedAgents`. Kit utilities and operator-local cited engines stay outside the roster. Changes to roster size or mode boundaries require superseding this ADR and updating validators/evals.

