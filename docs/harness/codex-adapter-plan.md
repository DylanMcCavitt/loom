# Codex Adapter Plan

Issue #41 defines the Codex-side adapter plan for the unified OMP/Codex/Claude harness nucleus. This slice is a plan and validation package only. It does not write to live `~/.codex`, does not change the Codex default model/provider, and does not remove duplicate skills.

Canonical data lives in `docs/harness/codex-adapter-plan/adapter-plan.json`. Parseable dry-run templates live under `docs/harness/codex-adapter-plan/templates/`.

The reusable repo workflow source for the harness nucleus is the OMP workflow-kit at `~/.omp/agent/workflow-kit`. This issue treats it as a reference-only source: translate the workflow into Codex-native instructions, config, custom agents, and skills, but do not copy live OMP runtime state into `~/.codex`.

## Official Codex Docs Used

The plan was checked against the current Codex manual fetched from `https://developers.openai.com/codex/codex-manual.md` and references these official OpenAI Codex docs:

- [Config basics](https://developers.openai.com/codex/config-basic): config precedence, user config, project `.codex/config.toml`, and trust boundaries.
- [Advanced config profiles](https://developers.openai.com/codex/config-advanced#profiles): `~/.codex/<profile>.config.toml` naming and profile overlays.
- [Project config boundaries](https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml): project-local keys Codex ignores for provider/auth/profile/telemetry control.
- [Custom agents](https://developers.openai.com/codex/subagents#custom-agents): custom agent TOML locations, required fields, and inherited optional settings.
- [Subagent concepts](https://developers.openai.com/codex/concepts/subagents): parallel subagent tradeoffs and explicit triggering.
- [Agent skills](https://developers.openai.com/codex/skills): skill folder shape, discovery roots, progressive disclosure, and `skills.config` entries.
- [AGENTS.md guidance](https://developers.openai.com/codex/guides/agents-md): global and project instruction discovery.
- [Authentication](https://developers.openai.com/codex/auth): credential cache handling and why `auth.json` is local-only.

## Repository Workflow Nucleus

The nucleus workflow should follow the OMP workflow-kit repo model, expressed in whatever language each harness can use.

Portable policy:

- Keep a global layer for default workflow instructions, sticky safety rules, and reusable skills.
- Keep a project layer for repo-local instructions, repo config, `docs/agents` guidance, scope ledger, handoffs, issue/PR templates, labels, and project skills.
- Preserve full-flow traceability from grilled plan to PRD, issues, triage, one issue/worktree/PR implementation, verification evidence, and handoff when blocked.
- Use an idempotent apply/check model where a marker manifest defines what "applied" means and existing files are not overwritten.
- Keep project skills exactly one directory below `.agents/skills`, with `SKILL.md` frontmatter and concrete `Use when ...` triggers.
- Treat GitHub issue/PR templates and standard workflow labels as repo workflow surfaces when a repo uses GitHub.

Codex translation:

- Project-specific workflow policy belongs in repo-local instruction/config candidates and shared `.agents/skills` where it is useful across harnesses.
- General reusable workflow policy belongs in user-level instruction or skill surfaces, such as `~/.agents/skills`; direct OMP bundled-agent role ports are superseded by the shared nucleus per-agent package contract.
- Codex custom agents are optional harness adapters only. The canonical target model is one Vercel-shaped package per shared nucleus agent with canonical names and no harness prefixes.
- Future renderers must produce dry-run manifests before writing live `~/.codex` or repo config.

## OMP Agent Mapping

The #39 snapshot contains eight bundled OMP agents. This historical mapping now treats
direct OMP role ports as superseded context, not active Codex renderer targets. The
canonical target is `docs/harness/shared-nucleus-agents.*`: one Vercel-shaped package
per shared nucleus agent, with canonical names and no `omp-`, `codex-`, or `claude-`
prefix.

| OMP agent | Recommendation | Codex target | Candidate | Rationale |
| --- | --- | --- | --- | --- |
| `designer` | superseded | shared nucleus package | `spidertron` | Future UI/UX workflow activation belongs to shared `spidertron`, not `omp-designer`. |
| `explore` | keep | native subagent | `explorer` | Codex already ships a read-heavy explorer role. |
| `librarian` | superseded | shared nucleus package | `science-pack` | Future source-verified research activation belongs to shared `science-pack`, not `omp-librarian`. |
| `oracle` | drop | native default/worker | none | Broad senior-engineer behavior overlaps native Codex defaults and would add routing ambiguity. |
| `plan` | superseded | shared nucleus packages | `blueprint` / `ghosts` / `roboports` / `main-bus` | Future planning work routes through canonical shared packages, not `omp-planner`. |
| `quick_task` | keep | native worker/profile choice | `worker` | Mechanical low-reasoning work maps to native worker and optional profile/model choice. |
| `reviewer` | superseded | shared nucleus packages | `biters` / `spitters` / `bus-first` / `lab` | Future review work routes through canonical shared packages, not `omp-reviewer`. |
| `task` | keep | native worker/default | `worker` | General-purpose delegated execution is already native Codex behavior. |

Superseded candidate TOML templates for `omp-designer`, `omp-planner`, and
`omp-reviewer` remain parseable historical fixtures only. Active renderer paths must not
emit those files, and any future `omp-librarian` candidate language is superseded before
implementation.

## Skill Candidate Mapping

Issue #40 identified six OMP command behaviors that can become shared harness skills. Issue #41 keeps them as future plan rows only:

| OMP command | Future Codex skill | Boundary |
| --- | --- | --- |
| `btw` | `omp-btw` | Port side-question discipline, not OMP ephemeral runtime subthreads. |
| `guided-goal` | `omp-guided-goal` | Port objective interview flow, not persistent OMP goal state. |
| `handoff` | `omp-handoff` | Port handoff-writing discipline, not OMP session spawning. |
| `omfg` | `omp-complaint-to-rule` | Port complaint-to-rule drafting, not automatic rule installation. |
| `plan` | `omp-plan` | Port plan-before-execute guidance when a custom planning agent is too heavy. |
| `tan` | `omp-tangent` | Port tangential delegation prompts, not OMP background agent launch. |

No Codex or Claude skill ports are created in this issue.

## TOML Template Boundaries

### Base Config Template

Template: `docs/harness/codex-adapter-plan/templates/base.config.template.toml`

Allowed content:

- project instruction fallback filenames
- project instruction byte budget
- safe feature toggles such as `features.multi_agent`

Forbidden content:

- `model`, `model_provider`, `model_providers`
- `openai_base_url`, `chatgpt_base_url`
- `profile`, `profiles`
- auth, telemetry, notification, trusted-project, or machine-local path values

### Optional Profile Template

Template: `docs/harness/codex-adapter-plan/templates/profile.omp-harness.config.template.toml`

Candidate destination after explicit approval: `~/.codex/omp-harness.config.toml`.

Profiles may tune review effort, sandbox, approval policy, or feature toggles. They must not redirect provider routing, credentials, or default model/provider behavior.

### Superseded Custom Agent Templates

Historical templates:

- `docs/harness/codex-adapter-plan/templates/agents/omp-designer.toml`
- `docs/harness/codex-adapter-plan/templates/agents/omp-planner.toml`
- `docs/harness/codex-adapter-plan/templates/agents/omp-reviewer.toml`

These files preserve the earlier adapter rationale as superseded context and validation
fixtures. They are not active renderer inputs, have no candidate `.codex/agents/*.toml`
or `~/.codex/agents/*.toml` destinations, and must not be presented as the shared agent
activation target. Future native agent work must start from
`docs/harness/shared-nucleus-agents.*` and render per-agent Vercel-shaped packages with
canonical names and no harness prefixes.

### Skill Enable/Disable Template

Template: `docs/harness/codex-adapter-plan/templates/skills.config.template.toml`

Candidate destination after explicit approval: merge entries into `~/.codex/config.toml`.

These examples show only explicit `[[skills.config]]` toggles. They must not delete duplicate skill directories, copy plugin caches, vendor global skills, or modify live config without a future dry-run renderer and human approval.

## Current `~/.codex` Boundary

Live `~/.codex` inspection for this issue was path/category-only and read-only. The plan treats these surfaces as local-only:

- credential/auth cache: `~/.codex/auth.json` or OS keychain material
- session state: `~/.codex/sessions/`, `~/.codex/archived_sessions/`, `~/.codex/session_index.jsonl`
- prompt/history state: `~/.codex/history.jsonl`
- logs and diagnostics: `~/.codex/log/`
- app/cache/plugin state: `~/.codex/cache/`, `~/.codex/.tmp/`, `~/.codex/plugins/cache/`
- generated or user-provided artifacts: `~/.codex/attachments/`, `~/.codex/generated_images/`, `~/.codex/blobs/`
- local databases: `~/.codex/*.sqlite*`
- app/server state: `~/.codex/*state*.json`
- local automation state: `~/.codex/automations/`
- browser/computer-use state: `~/.codex/browser/`, `~/.codex/computer-use/`
- shell and memory state: `~/.codex/shell_snapshots/`, `~/.codex/memories/`

Generated candidates are dry-run-only in this issue:

- `.codex/config.toml` from the base template
- `~/.codex/omp-harness.config.toml` from the profile template
- future per-agent Vercel-shaped packages from `docs/harness/shared-nucleus-agents.*`
- future `skills.config` entries merged into `~/.codex/config.toml`

Superseded `omp-*` Codex custom-agent templates are not generated candidates.

## Dry-Run Render And Validation Strategy

Before any live Codex modification is allowed:

1. Render active templates into a temporary directory, never directly into `~/.codex`; superseded OMP-prefixed custom-agent templates are not active renderer inputs.
2. Parse all rendered TOML with the vendored in-process TOML parser.
3. Compare OMP agent mapping rows against `distributions/snapshots/omp-builtins/source.json`; fail when a bundled agent is missing or duplicated.
4. Validate that the Codex adapter preserves the workflow-kit repo lifecycle as portable policy rather than copying live OMP runtime files.
5. Reject rendered content containing absolute private home paths, API key/token-looking text, provider routing keys, auth cache destinations, or default model changes in the base template. The safety gate also scans in-scope tracked source for absolute private home paths and secret-looking values before any future render/write executor can use that source.
6. Validate official Codex references cover config, profiles, custom agents/subagents, skills, `AGENTS.md`, and auth/local credential boundaries.
7. Print a dry-run manifest showing active candidate destination paths, required human approvals, and skipped local-only surfaces; the manifest must not list OMP-prefixed custom agents as shared agent activation targets.
8. Future agent activation must render per-agent Vercel-shaped packages from `docs/harness/shared-nucleus-agents.json` with canonical names and no harness prefixes.
9. Require a future issue and PR before writing to live `~/.codex`, `.codex/agents`, or `.agents/skills`.

### Render-to-write executor

`scripts/render-harness-nucleus.mjs` implements this strategy end to end and is the keystone that turns the plan + checks into an instantiation:

```sh
node scripts/render-harness-nucleus.mjs            # dry-run: render to temp, gate, print manifest
node scripts/render-harness-nucleus.mjs --write    # strict-manual apply (create-missing-only)
```

In dry-run (default, AFK-safe) it renders the active Codex templates and the decided OMP source under `adapters/omp/source/` into an ephemeral temp directory, runs the dry-run safety gate over the rendered output (secret-looking values, absolute private home paths, dangerous destinations, local-only write targets, forbidden provider/model/auth/telemetry/profile keys, and TOML parseability), and prints a deterministic candidate manifest — destination, disposition, applied/not-applied, overwrite risk, required approvals, and skipped local-only surfaces — with zero writes. Disposition is resolved from the resource manifest: only `track`/`adapt` surfaces become appliable candidates, while `reference-only` and `local-only` surfaces are reported and skipped. Superseded OMP-prefixed custom-agent templates do not enter this active render path.

The gated `--write` path executes the strict-manual approval policy below; it never bypasses it. It refuses to run unless the dry-run render and the safety gate pass clean, is create-missing-only (skips any existing non-marker live file with `exists:` and leaves user edits intact), backs up any kit-owned marker before updating it, and applies idempotently against a marker manifest (`~/.loom-harness/applied-manifest.json`) so a second run is a clean no-op.

LOO-86 no longer activates the OMP-derived Codex custom-agent candidates. The direct
`omp-*` role adapter path is paused because the target agent model changed: future
activation should render shared Factorio workflow agents across OMP, Codex, and Claude,
with no harness-specific prefix. The follow-up plan should define the canonical shared
agent contract, delegation DAG, `repair-pack` finding-fix loop, eval harness, and only
then a create-missing/marker-owned activation path.

Run the repo-wide offline checks:

```sh
npm run check
```

## Human Decisions Before Implementation

| Decision | Resolution |
| --- | --- |
| What replaces adapted OMP agents as Codex activation targets? | Direct OMP-prefixed Codex custom agents are superseded. Future agent activation targets the shared nucleus contract: one Vercel-shaped package per canonical agent name, with no harness prefix. |
| Should designer, librarian, planner, and reviewer OMP role candidates remain active renderer targets? | No. Keep their rationale only as superseded adapter-plan context; active renderers must not emit `omp-designer`, `omp-librarian`, `omp-planner`, or `omp-reviewer`. |
| Which skill candidates should be repo-local .agents/skills versus personal ~/.agents/skills? | Use the OMP workflow-kit split: repo workflow and domain skills go in `.agents/skills`; general reusable workflow skills go in `~/.agents/skills`; inspect the active OMP skill roots before final placement. |
| Should the optional omp-harness profile set sandbox/approval defaults, or should it only document recommended CLI flags? | The optional `omp-harness` profile should set sandbox and approval defaults. |
| What review/approval policy is required before merging any generated template into live ~/.codex/config.toml? | Default to a strict manual gate: separate issue/PR, dry-run rendered diff, dangerous-key validation, backup of the live file, and explicit human approval before any write. |

Approval policy options for a future live config issue:

- `strict-manual` (recommended): separate issue/PR, dry-run diff, validation pass, live-file backup, and explicit human approval before writing `~/.codex/config.toml`.
- `checked-local-apply`: allow a local apply command only after the dry-run checker passes and creates a backup; still forbid provider, auth, trust, telemetry, and default-model changes.
- `docs-only`: never write live config from the harness; render instructions and let the human manually copy reviewed entries.
