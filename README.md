# Loom

Loom is a curated, harness-agnostic agent skill pack for turning planning, implementation, review, proof, repair, launch, handoff, and initiative workflows into portable skills that teams can install wherever their coding agents read skill directories.

## Skill roster

| Skill | Purpose |
| --- | --- |
| `belt` | Carries durable handoff, thread-control, and resume context with concise state, proof, risks, and next actions. |
| `biters` | Reviews changes adversarially for correctness, regressions, maintainability, scope creep, missing tests, security, and workflow drift. |
| `blueprint` | Shapes specs, issue decompositions, architecture seams, research spikes, tracker triage, and reusable planning templates. |
| `lab` | Runs proof-only command, UI, and smoke validation while recording behavior evidence without expanding scope. |
| `repair-pack` | Fixes exactly one concrete review or proof finding from a fresh compact packet. |
| `roboports` | Coordinates one tracked implementation issue end to end with localized fanout, minimal diffs, refactors, and performance work. |
| `rocket-launch` | Enforces launch gates for ready changes and records the evidence loop for PR merge and tracker closeout handoff. |
| `assembler` | Sets up or refreshes a repo-local workflow kit envelope, harness wiring, repo glossary, commands, templates, and skills. |
| `prospect` | Captures a brand-new idea, feature, or initiative as tracked planning work before a spec or issues exist. |
| `space-age` | Coordinates artifact promotion and cross-repo delivery through ordered CI/CD or dependency hops. |
| `map-seed` | De-risks constrained designs with a fast throwaway prototype, retro, and restarted plan. |

## Install per harness

The fastest route is the bundled installer:

```sh
npm run install:skills
```

On a TTY it opens an interactive picker: choose skills, choose harnesses, review the summary, confirm. Non-interactively, drive it with flags:

```sh
node scripts/install.mjs --harness codex,claude --all --yes
node scripts/install.mjs --harness cursor --skills belt,lab --yes
node scripts/install.mjs --list
```

Every harness defaults to symlink except `cursor` (installer defaults to copy for safety; on Cursor Linux a `~/.cursor/skills` symlink resolves, enumerates all skills, and passes agent invocation via `cursor-agent` per v0.2.1 install smoke—use `--symlink` to opt in) and `factory` (copy; symlink support undocumented) and `omp` (config snippet only); `--symlink`/`--copy` override. OMP is config-based, so the installer prints the `skills.customDirectories` snippet instead of writing files. Existing targets that were not installed by Loom are skipped with a warning unless `--force` is passed, and `--dry-run` prints the plan without writing. Global target paths follow the skills.sh supported-agents matrix.

Manual routes, for reference:

| Harness | Global skills directory | Default mode |
| --- | --- | --- |
| Claude Code (`claude`) | `~/.claude/skills` | symlink |
| Codex CLI (`codex`) | `~/.codex/skills` | symlink |
| Generic Agent Skills — Cline, Dexto, Kimi Code CLI, Warp, Zed (`agents`) | `~/.agents/skills` | symlink |
| Cursor (`cursor`) | `~/.cursor/skills` | copy |
| Gemini CLI (`gemini`) | `~/.gemini/skills` | symlink |
| GitHub Copilot (`copilot`) | `~/.copilot/skills` | symlink |
| OpenCode (`opencode`) | `~/.config/opencode/skills` | symlink |
| Amp — also Replit / universal (`amp`) | `~/.config/agents/skills` | symlink |
| Goose (`goose`) | `~/.config/goose/skills` | symlink |
| Windsurf (`windsurf`) | `~/.codeium/windsurf/skills` | symlink |
| Factory Droid (`factory`) | `~/.factory/skills` | copy |
| Roo Code (`roo`) | `~/.roo/skills` | symlink |
| Kilo Code (`kilo`) | `~/.kilocode/skills` | symlink |
| Charm Crush (`crush`) | `~/.config/crush/skills` | symlink |
| Continue (`continue`) | `~/.continue/skills` | symlink |
| Qwen Code (`qwen`) | `~/.qwen/skills` | symlink |
| Trae (`trae`) | `~/.trae/skills` | symlink |
| OpenHands (`openhands`) | `~/.openhands/skills` | symlink |
| Augment (`augment`) | `~/.augment/skills` | symlink |
| OMP (`omp`) | `skills.customDirectories: [~/loom/skills]` — no directory write | config |

## Maintainers

### Commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Runs `npm run validate` and then `npm test`. |
| `npm run validate` | Runs every `scripts/validate-*.mjs` validator. |
| `npm run lint` | Alias for `npm run validate`. |
| `npm test` | Runs `node --test tests/*.test.mjs`. |
| `npm run bench` | Runs `node scripts/bench.mjs`. |
| `npm run loop` | Runs `node scripts/loop.mjs`. |
| `npm run guard:worktree` | Runs `node scripts/worktree-guard.mjs`. |
| `npm run install:skills` | Runs `node scripts/install.mjs`. |

### Test Suites

| Area | Command |
| --- | --- |
| Assembler skill | `node --test tests/assembler-skill.test.mjs` |
| Benchmark script | `node --test tests/benchmarks-bench.test.mjs` |
| Eval dashboard | `node --test tests/eval-dashboard.test.mjs` |
| Biters skill | `node --test tests/biters-skill.test.mjs` |
| Blueprint skill | `node --test tests/blueprint-skill.test.mjs` |
| Factorio kit golden path | `node --test tests/factorio-kit-goldenpath.test.mjs` |
| Frontmatter metadata | `node --test tests/frontmatter.test.mjs` |
| Harness safety library | `node --test tests/harness-safety-lib.test.mjs` |
| Skill installer | `node --test tests/install-skills.test.mjs` |
| Loop entrypoint | `node --test tests/loop-entrypoint.test.mjs` |
| Map seed skill | `node --test tests/map-seed-skill.test.mjs` |
| Nucleus docs drift | `node --test tests/nucleus-docs-drift.test.mjs` |
| Prospect skill | `node --test tests/prospect-skill.test.mjs` |
| Roboports skill | `node --test tests/roboports-skill.test.mjs` |
| Rocket launch skill | `node --test tests/rocket-launch-skill.test.mjs` |
| Retro packet | `node --test tests/retro-packet.test.mjs` |
| Skill quality gate | `node --test tests/skill-quality.test.mjs` |
| Skill validation | `node --test tests/skill-validation.test.mjs` |
| Space age skill | `node --test tests/space-age-skill.test.mjs` |
| Worktree guard | `node --test tests/worktree-guard.test.mjs` |

### Validators

| Validator | Command | Purpose |
| --- | --- | --- |
| Nucleus docs drift | `node scripts/validate-nucleus-docs-drift.mjs` | Keeps README identity, commands, script citations, and test-suite rows aligned with package scripts and files on disk. |
| Skill quality | `node scripts/validate-skill-quality.mjs` | Enforces word/description budgets, bans filler phrases and vendor tracker names, and requires eval coverage; existing violations are grandfathered in `scripts/skill-quality-allowlist.json`, a ratchet that may only shrink. |
| Skill validation | `node scripts/validate-skills.mjs` | Checks skill shape, frontmatter, naming, and secret-like content. |

### Eval tiers

The pack uses a three-tier eval ladder; tier 1 is enforced offline in `npm run check`, while tiers 2–3 are opt-in bench modes. Operator cadence, evidence rules, and deferred gaps: [`docs/operator/evals.md`](docs/operator/evals.md).

| Tier | Eval | Run |
| --- | --- | --- |
| 1 | Trigger evals | Per-skill routing corpora in `skills/<name>/evals/evals.json`; validated by the skill-quality gate as part of `npm run check` (coverage required). |
| 2 | Judge | `npm run bench -- --judge [skill]` scores `SKILL.md` against `benchmarks/judge/RUBRIC.md` with a model in the loop; writes JSON and markdown scorecards under `retro/`. |
| 3 | Ablation | `npm run bench -- --ablate <skill>` materializes full, absent, and trimmed roboports workspaces to compare with-skill vs without-skill uplift (re-score arms with `npm run bench -- --score <workspace>`). |

Tiers 2–3 are model-in-the-loop modes: they read `LOOM_JUDGE_*` settings, falling back to the committed default backend in `benchmarks/judge/judge.config.json`; `LOOM_JUDGE_BACKEND=none` opts out (then they skip with exit 0), and they never run in CI.

### Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| Benchmark harness | `node scripts/bench.mjs` | Runs repository benchmark checks. |
| Eval dashboard | `node scripts/eval-dashboard.mjs` | Renders gitignored judge scorecards into `retro/eval-dashboard.html` plus a stdout summary. |
| Skill installer | `node scripts/install.mjs` | Links or copies `skills/` into harness skill directories, interactively or via flags. |
| Operator loop | `node scripts/loop.mjs` | Runs the offline loop entrypoint. |
| Retro packet helper | `node scripts/retro-packet.mjs` | Handles retro packet maintenance. |
| Worktree guard | `node scripts/worktree-guard.mjs` | Confirms agent work starts in the intended checkout. |

### Release asset

The release tarball ships only `skills/`, `docs/agent-contract.md`, `LICENSE`, `README.md`, and `RELEASE-NOTES.md`. Development tooling lives only in the repository.
