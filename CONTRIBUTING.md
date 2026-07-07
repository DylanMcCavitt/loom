# Contributing

Thank you for helping improve Loom. This repo is a declarative harness nucleus: canonical skills and agents live in `nucleus/`, adapters translate format only, and validators keep portable surfaces honest.

## Before you start

1. **One issue, one branch, one PR.** Linear is the tracker (`LOO-*` issues). Prefix commits with the issue id, e.g. `LOO-205: add release workflow`.
2. **Run the gate before opening a PR:** `npm run check` must pass.
3. **Dry-run first.** Do not write live `~/.omp`, `~/.codex`, `~/.claude`, or `~/.agents` without the explicit gated `--write` flow and human approval.

## Adding or changing a skill

### Where skills live

| Surface | Path | Role |
|---|---|---|
| Canonical roster agents | `nucleus/skills/<name>/` | Seven shared agents (`blueprint`, `roboports`, `biters`, `lab`, `repair-pack`, `rocket-launch`, `belt`) |
| Kit utilities | `nucleus/utilities/<name>/` | Repo-owned utilities (`assembler`, `prospect`, `space-age`, `map-seed`) |
| Compatibility render | `.agents/skills/` | **Generated** — never hand-edit |
| Operator-local engines | `~/.agents/skills/<name>/` | Personal cited utilities (see `docs/skills/operator-local-manifest.md`) |
| Starter template | `template/skill-template/` | Copy scaffold for new packages — not validated as a shipped skill |

**Canonical vs personal:** repo workflow and domain skills belong in `nucleus/`. General reusable engines cited by the kit but not repo-owned stay operator-local under `~/.agents/skills/`; the repo records names and paths in `docs/skills/operator-local-manifest.md` only.

### Package shape

Start from `template/skill-template/` or mirror an existing `nucleus/skills/*` package:

```
<skill-name>/
  SKILL.md          # required entrypoint with YAML frontmatter
  references/       # progressive disclosure (lens files, rules, deep docs)
  evals/            # trigger evals (recommended for kit skills)
  AGENTS.md         # shared-agent packages only
  templates/        # when the skill owns reusable scaffolds
```

### `SKILL.md` frontmatter discipline

Every skill entrypoint needs YAML frontmatter with:

- **`name`** — must equal the directory name (kebab-case, no harness prefixes).
- **`description`** — one paragraph that includes a concrete **`Use when`** or **`Use for`** trigger. Validators reject vague descriptions without a real trigger phrase.
- **`metadata.version`** — semver string for the skill package.
- **`metadata.changelog`** — single ASCII line, `<version> - <summary>`.

Example:

```yaml
---
name: my-skill
description: Does X for Y workflows. Use when you need to Z with the active issue packet.
metadata:
  version: "0.1.0"
  changelog: "0.1.0 - initial public release"
---
```

Keep the `SKILL.md` body as the entrypoint. Move long guidance, lens variants, and tables into `references/` and load them progressively (named lens → `references/lens-<name>.md`).

Treat `metadata.version` as the skill behavior version: bump it for any behavioral skill change, update the colocated `metadata.changelog` line in `SKILL.md` at the same time, and expect evals to compare current routing or instructions against prior versions to catch regressions.

### Progressive disclosure

- Put only routing, mode boundaries, and load order in `SKILL.md`.
- Put lens-specific behavior in `references/lens-*.md`.
- Put durable rules and decision logs in `references/rules.md` or `references/*.md`.
- Never duplicate the shared agent contract; link `nucleus/agents/shared-nucleus-agents.md` when relevant.

### Evals expectation

Kit skills should ship `evals/evals.json` with:

- **positive** prompts that must route correctly
- **adversarial / typo** prompts that must still route or refuse safely
- **negative / near-miss** prompts that must defer to another skill

Structural lint (`validate-skills.mjs`) is necessary but not sufficient; evals pin trigger and routing behavior.

## Render pipeline (never hand-edit compat)

`nucleus/` is the **source**. After editing skills or utilities there:

```sh
npm run render    # regenerates .agents/skills/ from nucleus/skills/ + nucleus/utilities/
```

**Never hand-edit `.agents/skills/`.** The compatibility surface is derived; drift validators compare canonical source to the rendered tree.

For harness installs, `npm run render-nucleus` dry-runs adapter output and `npm run install-nucleus` applies only through the gated create-missing-only executor.

## Conventions and drift guards

- **One issue / branch / PR** — do not batch unrelated harness surfaces.
- **`npm run check` is the merge gate** — all `validate-*.mjs` scripts, inventory, safety gate, and unit tests.
- **Drift validators will catch table lies** — `validate-nucleus-docs-drift.mjs` guards README/operator commands, Factorio kit roster tables, and stale path claims. If docs list a skill, it must exist under `nucleus/skills/` or `nucleus/utilities/`.
- **No secrets, no Linear ids in canonical skill source** — `LOO-*` issue references belong in commits and PRs, not in `nucleus/` skill text.
- **Generated distributions** under `distributions/` are render output; fix `nucleus/` or adapter templates, then re-render.

## Pull requests

1. Branch from `main` with the `dylanmccavitt2015/loo-<id>-*` naming convention when tied to Linear.
2. Keep README changes out of mechanical/tooling PRs unless the issue explicitly requires doc updates.
3. Confirm `npm run check` is green in CI.
4. Describe what you changed, what you did **not** change, and how you verified it.

## Questions

Open a Linear issue or GitHub discussion for design questions. For security reports, see [SECURITY.md](SECURITY.md).
