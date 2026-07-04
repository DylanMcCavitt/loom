# Shared nucleus agent contract history

Historical context moved out of `nucleus/agents/shared-nucleus-agents.md` by LOO-154. The JSON contract (`nucleus/agents/shared-nucleus-agents.json`) remains the machine-readable source for evidence intake, activation gates, and superseded candidates.

## Issue history

- LOO-96 base contract; LOO-97 autonomous delegation DAG; LOO-98 repair-pack finding-fix loop; LOO-99 offline shared-agent eval harness; LOO-100 retirement of OMP-prefixed active candidates; LOO-101 canonical package rendering; LOO-102 scratch-HOME shared roster activation; LOO-103 evidence intake and decision log; LOO-104 deterministic shared-package checks; LOO-105 canonical repo-local package source.
- LOO-154 consolidated the 17-agent starter roster to 7 agents with lens references and moved non-roster skills to `nucleus/utilities/`.
- LOO-152 slimmed repo-owned skills to 11 (7 roster + 4 kit utilities) and moved 17 cited-engine utilities operator-local to `~/.agents/skills/` per `docs/skills/operator-local-manifest.md`.

## Pre-consolidation starter roster (superseded by LOO-154)

blueprint, ghosts, inserter, roboports, radar, lab, biters, spitters, spidertron, bus-first, repair-pack, main-bus, science-pack, belt, recycler, modules, rocket-launch. The absorbed agents survive as lens references; the mapping is recorded in `shared-nucleus-agents.json#absorbedAgents`.

## Superseded direct OMP-role candidates

- `omp-designer` (Codex) — UI workflow proof belongs to the `lab` `ui-proof` lens.
- `omp-planner` (Codex) — planning work belongs to `blueprint` lenses and `roboports`.
- `omp-reviewer` (Codex) — review work belongs to `biters` lenses, `lab`, and stable rule citations.
- `omp-librarian` (Codex) — research belongs to the `blueprint` `research-spike` lens.

These candidates remain only as historical adapter-plan context; they are not the shared nucleus agent model.

## Activation gate detail

LOO-102 activates the roster only through the plugin-bridge scratch-HOME path:

1. `node scripts/render-plugin-bridge.mjs --home <scratch> --write --json` renders approved create-missing candidates under `~/.agents/plugins/loom-nucleus/` and the personal marketplace catalog, then records marker metadata in `~/.loom-harness/applied-manifest.json`.
2. A second `--write` against the same scratch HOME must be a clean no-op: every appliable candidate reports `already-applied`, no new files are created, and the marker manifest is unchanged.
3. `adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs` verifies the installed copy without writing: missing components, marker hash drift, malformed manifests, forbidden provider/auth/profile keys, and non-portable absolute paths produce structured non-zero reports.
4. Proof covers the shared roster package shape once at the source surface and once through each native plugin consumer: OMP-compatible Vercel-shaped packages under `nucleus/skills/{agent-name}/`, Codex via `.codex-plugin/plugin.json#skills`, and Claude via `.claude-plugin/plugin.json#skills`.
5. Existing OMP, Codex, and Claude auth, sessions, histories, caches, DBs, browser state, local settings, plugin caches, and runtime files remain local-only.

Live-HOME promotion gate: dry-run -> review -> explicit apply. Required deterministic checks before apply are `scripts/validate-shared-agent-packages.mjs`, `scripts/validate-shared-agent-evals.mjs`, `scripts/render-plugin-bridge.mjs --json`, and the targeted plugin-bridge scratch apply/verifier proof.

## Evidence-intake collector -> judge -> human review loop

Documentation and offline-contract workflow only; it does not collect from live Slack, Figma, GitHub, HOME, session history, or private runtime state. The collector gathers evidence without scoring or proposing rules; the judge validates sources, separates facts/inferences/open questions, groups candidates, and keeps every candidate pending; human review chooses exactly one of rule, reference, exemplar, lint rule, eval, coverage gap, or no change. Decision-log entries record scope, rationale, evidence, exceptions, approver, target file, and checks. Accepted changes land in the narrowest relevant destination per `shared-nucleus-agents.json#evidenceIntake.destinationPolicy`.
