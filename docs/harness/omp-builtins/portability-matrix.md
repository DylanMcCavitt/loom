# OMP Runtime Command Portability Matrix

Issue #40 classifies every built-in OMP slash command indexed by the #39 snapshot at `docs/harness/omp-builtins/commands.json`. The canonical machine-readable matrix is `portability-matrix.json`; this file summarizes the policy and review points before any adapter or skill ports are implemented.

## Portability classes

- `document`: document as a cross-harness reference or native-harness concept; do not port as an executable command yet.
- `skill`: portable as shared harness instructions or agent workflow guidance without needing live OMP TUI control.
- `cli-wrapper`: portable through a stable top-level OMP CLI invocation with explicit arguments and no active TUI dependency.
- `adapter-required`: requires a runtime control adapter because the command reads or mutates the active OMP session, TUI state, transcript, provider stream, or collaboration state.
- `omp-only`: keep as an OMP-only interaction because the command is a TUI affordance or local OMP UI action with no useful Codex/Claude target.

## Runtime boundary

Plain `SKILL.md` ports are insufficient for commands that operate on the live OMP TUI/session. Those commands need runtime access to active message selection, session identity, provider stream state, model lane state, collaboration relay state, background jobs, or transcript mutation. The matrix marks those commands with `runtimeSessionCommand: true` and generally classifies them as `adapter-required` unless there is a stable CLI path that can operate on explicit arguments.

Examples:

- `/branch`, `/fork`, and `/tree` need the active OMP message tree.
- `/compact`, `/shake`, `/dump`, `/session`, `/drop`, `/retry`, and `/rename` need the active transcript/session record.
- `/advisor`, `/browser`, `/fast`, `/force`, `/fresh`, `/goal`, `/loop`, `/switch`, and `/plan-review` need live runtime flags or scheduler state.
- `/collab`, `/join`, `/leave`, and `/share` touch collaboration or sharing state; only `join` has a stable CLI entry point.

## Stable CLI-backed commands

The `cli-wrapper` class is intentionally narrower than OMP's ACP/text slash-command list. A command is `cli-wrapper` only when this OMP version exposes a top-level CLI command or flag that can be called with explicit arguments:

- `agents`: `omp agents unpack --dir <target> --json`
- `export`: `omp --export <session-file>`
- `join`: `omp join <link>`
- `marketplace`: `omp plugin marketplace|discover|install|uninstall|list|upgrade`
- `model`: `omp models [ls|find|refresh|canonical|<provider>] --json`
- `plugins`: `omp plugin list|enable|disable --json`
- `resume`: `omp --resume <session-id-or-path>`
- `settings`: `omp config list|get|set|reset|path|init-xdg --json`
- `setup`: `omp setup [python|speech] --check --json`
- `ssh`: `omp ssh add|remove|list --json`
- `stats`: `omp stats --json|--summary|--port <port>`
- `usage`: `omp usage --json --redact`

## Shared skill candidates

The `skill` class covers behavior that can be carried as portable workflow instructions for Codex and Claude. These are not exact ports of OMP runtime state:

- `btw`: bounded side-question handling.
- `guided-goal`: goal interview and objective refinement.
- `handoff`: handoff writing and context transfer discipline.
- `omfg`: complaint-to-rule drafting.
- `plan`: plan-before-execute workflow.
- `tan`: tangential subagent delegation workflow.

## OMP-only commands

The `omp-only` class is reserved for TUI affordances with no useful cross-harness executable target:

- `copy`: OMP rendered-message clipboard picker.
- `exit` and `quit`: OMP process lifecycle.
- `extensions`: Extension Control Center dashboard.
- `hotkeys`: OMP TUI shortcut help.

## Open product decisions

The `openProductDecisions` array in `portability-matrix.json` records the decisions that should be reviewed before adapter implementation starts:

- Runtime adapter command envelope.
- Live session identity.
- Skill ports versus native features.
- CLI wrapper permissions.
- Transcript and share privacy.

Validate this matrix through the repo-wide offline checks:

```sh
npm run check
```
