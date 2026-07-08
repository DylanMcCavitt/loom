# Release Notes

## 0.2.1

- Added an interactive `install loom` TUI installer with skills.sh-style per-harness install flow, `scripts/install.mjs`, and `npm run install:skills`.
- Added a skill-quality gate validator enforcing conciseness, word budgets, filler bans, tracker-coupling bans, and eval coverage with a shrink-only ratchet allowlist.
- Swept skill content to tracker-neutral vocabulary and word budgets, draining the quality-gate allowlist.
- Added model-in-the-loop bench modes for rubric scorecards and ablation uplift harnesses, opt-in via `LOOM_JUDGE_API_KEY`.
- Added trigger eval corpora for belt, lab, and repair-pack under `skills/<name>/evals/`.

## 0.2.0

- Purged obsolete harness machinery from the public pack identity so the repo presents as portable skills first.
- Flattened the canonical skill source into `skills/` with seven roster agents and four utilities.
- Moved the shared agent contract to `docs/agent-contract.md` as the contract shipped with the pack.
- Added roster guard coverage to keep documented skill names aligned with committed skill packages.
- Added spec-constraint validation for skill frontmatter and pack documentation drift.
- Limited the release asset to pack contents only: skills, contract, license, README, and release notes.

## 0.1.0

First public packaging release of the Loom nucleus harness.

### WIP drain and stacked landing

- Consolidated the workflow kit into seven roster agents with lens references and four repo-owned utilities.
- Landed harness adapter plans, plugin bridge, and shared-agent contract single-sourcing across OMP, Codex, and Claude surfaces.
- Retired duplicate skill roots and operator-local cited engines per the LOO-152 slim-down manifest.

### Pack hygiene

- Routing fixes and contract single-sourcing through `nucleus/agents/shared-nucleus-agents.*`.
- Drift guards for README/operator commands, kit roster tables, and rendered compatibility surfaces.
- Safety gate coverage for secret-like content, forbidden runtime paths, and adapter template boundaries.

### Dogfood convergence

- Operator-local skill root documented at `~/.agents/skills/` with manifest-only repo tracking.
- Claude plugin bridge and marketplace catalog wired for scratch-HOME apply proof.
- Weekly OMP snapshot drift radar workflow for advisory pin-vs-npm monitoring.

### Public packaging

- MIT license, security policy, and starter skill template.
- Semver `0.1.0` on `package.json` and repo marketplace manifest.
- Tag-triggered GitHub Release workflow producing a portable `loom-pack` artifact.
