# Factorio Workflow Kit Manifest

The curated, Factorio-themed planning/execution lane for loom. Each repo chooses
its tracker explicitly: Linear or GitHub Issues own ghosts/planning state for
that project; GitHub owns code delivery through branches, PRs, review, CI, and
merge. Decisions are recorded in [ADR 0003](../decisions/0003-factorio-workflow-kit.md).

The tracker choice is explicit before binding planning work for a repo.

This manifest is the build envelope, not an active adapter template. Its roster
is validated against committed `skills/` by `npm run check`. Each skill is
authored eval-first: write its `evals.json` and content-envelope test, then
iterate `SKILL.md` until both pass.

## Pipeline

```
prospect      land on the idea               -> Linear initiative/project + idea doc
  -> blueprint (research-spike lens)   survey before building   -> Linear document (research notes)
  -> blueprint (spec-synthesis lens)   draft spec + templates   -> Linear doc (PRD) + blueprint/templates/
  -> blueprint (architecture lens)     keep lanes open to scale -> architecture/ADR notes
  -> blueprint (issue-decomposition)   stamp planned work       -> Linear issues/sub-issues, dependency-ordered
  -> blueprint (triage lens)           sort/route/prioritize    -> Linear states + labels
  -> roboports                         build the ghosts         -> branch/worktree -> implement/test -> PR
  -> biters (drift lens)               check drift              -> check-only sync evidence + next route
  -> lab                               prove behavior           -> targeted proof artifacts
  -> rocket-launch                     ship it                  -> review gate, merge PR, close Linear issue
  -> space-age                         beyond one repo          -> CI/CD + multi-repo/multi-env logistics

assembler   crafts the per-repo envelope + tooling that every skill above reads.
biters' minimal-diff lens carries the doctrine every code-writing skill cites.
```

## Principles

- **Tracker-picked, bridged.** Planning artifacts live in the user-selected
  tracker for that repo. Code lands as GitHub PRs. The bridge is the branch name
  (`<issue-id>`) + PR magic words.
- **Clean Factorio nouns, no prefix.** The `description` `Use when ...` line does
  all routing; names are evocative, not load-bearing for activation.
- **Doctrine, not sprawl.** Code-writing skills cite `biters`' minimal-diff
  lens: reuse before write; minimum that works; never cut
  validation/security/error-handling/accessibility.
- **Dynamic per repo.** `assembler` generates a repo envelope; skills read it.
  The canonical binding is the repo's `.agents/envelope/` Markdown; there is no
  runtime mirror or second source. Skills do not hardcode trackers, teams,
  labels, or commands.
- **Eval-first.** No skill is "released" until its eval layers are green.

## Core vocabulary and rename plan

Factory Nucleus uses one ledger vocabulary across PRDs, issues, skills, tests,
handoff graphs, and evals:

- **factory** — a repo-local workflow subsystem with a local Loom state root.
- **ghost** — planned-but-unbuilt tracked work, usually one issue.
- **blueprint** — the reusable spec/template stamped into ghosts.
- **recipe** — an executable delivery plan with ordered stages and gates.
- **envelope** — durable repo/workflow policy; this replaces `contract` as the
  concept name. Historical repo-envelope files may remain as migration notes, but
  new schema/runtime language says envelope.
- **circuit** — a validation or escalation gate guarding a protected surface.
- **inserter** — the canonical issue sorter/router; hard-renamed from the former
  `dispatch` skill with no steady-state alias or duplicate path.
- **roboports** — the canonical one-issue implementation network; hard-renamed
  from the former `robots` skill with no steady-state alias or duplicate path.
- **drift check** — check-only detection and route suggestion, now owned by the
  `biters` drift lens.
- **proof evidence** — behavior evidence collection, now owned by `lab` proof
  lenses and usable alone or as a recipe circuit.
- **rocket-launch** — launch gate, merge, and tracker closeout bridge.
- **space-age** — cross-repo or cross-environment promotion logistics.

Hard renames are clean cutovers. References, tests, handoff graphs, routing text,
and evals move to the new names together; old names may appear only in explicit
migration notes explaining the cutover.

## Skill table

| Skill | Factorio | Does | Linear | GitHub | Status | Replaces / Reuses |
|---|---|---|---|---|---|---|
| `prospect` | scout a new patch | start a new idea | initiative/project + doc | — | MVP | new |
| `blueprint` | saved layout you stamp | shape owner: PRD/spec (`spec-synthesis`), issue decomposition (`issue-decomposition`), architecture (`architecture`), research spikes (`research-spike`), triage (`triage`) via lenses | documents, issues/sub-issues, states + labels | PR/issue templates | MVP | absorbs `ghosts`, `main-bus`, `science-pack`/`research`, `inserter` as lenses |
| `roboports` | construction/logistic bots | execute one issue end-to-end + fanout discipline; refactor (`refactor`) and performance (`performance`) via lenses | reads issue/acceptance | branch/worktree -> PR | MVP | absorbs `recycler`/`quality`, `modules` as lenses; cites operator-local `tdd`, `debug-tools` |
| `biters` | enemies that breach your walls | adversarial review: correctness (`correctness`), security (`security`), minimal-diff doctrine (`minimal-diff`), drift (`drift`) via lenses | reads state/labels/dependencies for drift | reads diff/PR/proof evidence | MVP | absorbs `spitters`, `bus-first`, `radar`, `pr-review` as lenses; cites operator-local `security-threat-model`, `security-best-practices`, `security-ownership-map` |
| `lab` | the lab proves science | proof-only validation: command (`command-proof`), UI (`ui-proof`), smoke (`smoke-proof`) via lenses | optional read-only checks | local/browser/test artifacts | MVP | absorbs `spidertron`, `proof-pass` as lenses; used by `rocket-launch` |
| `repair-pack` | repair packs fix one thing | fix exactly one review/proof finding from a compact packet | reads finding packet | targeted diff + proof rerun | MVP | unchanged |
| `rocket-launch` | launch | ship: review gate, merge, close issue | close issue, status update | PR review/merge/CI | MVP | replaces `thread-closeout`, `gh-issue-thread-chain` closeout; reuses the `biters` lenses and `lab` |
| `belt` | transport belts move items | handoffs and thread continuity: `handoff`, `thread-control`, `resume` via lenses | — | — | MVP | absorbs `handoff`, `thread-control`, `resume-thread` as lenses |
| `assembler` | machine that builds machines | per-repo envelope + tooling generation | team/project/label map | template files | MVP (minimal) | replaces `repo-workflow-bootstrap`, `workflow-kit`, `setup-matt-pocock-skills` |
| `space-age` | platforms/planets | CI/CD + multi-repo/multi-env logistics | cross-project | CI | enrich | new |
| `map-seed` | reroll a bad starting map | throwaway prototype + plan around fixed constraints + retro + restart with learnings | optional prototype note | — | enrich | re-themes `prototype` |

## Historical: absorbed skills

LOO-154 retired the former expanded roster; these names are migration history,
not live routing targets:

- `ghosts` -> `blueprint` `issue-decomposition` lens.
- `main-bus` -> `blueprint` `architecture` lens.
- `science-pack` / `research` -> `blueprint` `research-spike` lens.
- `inserter` -> `blueprint` `triage` lens.
- `recycler` / `quality` -> `roboports` `refactor` lens.
- `modules` -> `roboports` `performance` lens.
- `spitters`, `bus-first`, `radar`, `pr-review` -> `biters` review,
  minimal-diff, security, and drift lenses.
- `spidertron`, `proof-pass` -> `lab` command, UI, and smoke proof lenses.
- `handoff`, `thread-control`, `resume-thread` -> `belt` continuity lenses.
- `prototype` -> `map-seed`.

## MVP skill contracts

### `prospect`

- **Trigger:** `Use when` the user is starting a brand-new idea, feature, or
  initiative from scratch and wants it captured as planning work before any
  spec/issues exist.
- **Does:** clarify the idea's intent and shape (briefly, no relitigating), then
  create the Linear home for it — an initiative or project (per the repo
  envelope) plus an idea/brief document attached to it. Returns the created
  object ids/links. Hands off to `blueprint` (`research-spike` lens if unknowns,
  `spec-synthesis` if ready to spec).
- **Linear:** `save_project` / `save_initiative` + `save_document`.
- **Invariants:** never starts implementation; never creates implementation
  issues (that is `blueprint`'s `issue-decomposition` lens); reads the
  `assembler` envelope for the target team/project.
- **Eval cases:** positive "kick off a new idea: offline mode for the editor";
  adversarial "lets start a new thing, offline editor idk yet"; negative "split
  this plan into issues" (-> route to `blueprint` `issue-decomposition`).

### `blueprint`

- **Trigger:** `Use when` the user wants a PRD/spec from current context, or
  wants/needs a reusable PR/doc/issue/project template.
- **Does:** synthesize a PRD/spec (no interview — use known context) and publish
  it as a Linear document on the prospect's project; route prototyping to
  `map-seed` when a design must be felt first, then fold its findings back. Owns
  the canonical templates under `blueprint/templates/`.
- **Linear/GitHub:** `save_document` for the spec; templates materialized by
  `assembler`.
- **Invariants:** spec uses the repo domain glossary from the envelope; explicit
  acceptance criteria + non-goals + proof plan; no file paths/code snippets in the
  spec except decision-encoding prototype snippets.
- **Eval cases:** positive "write the PRD for offline mode"; positive "give me a
  PR template for this repo"; negative "create the Linear issues now" (->
  `issue-decomposition` lens).


### `roboports`

- **Trigger:** `Use when` the user asks to start, continue, or ship one tracked
  Linear issue end-to-end (implement, test, open/update the PR).
- **Does:** one issue -> one branch/worktree (named with the Linear issue id) ->
  one PR. Main agent owns intake, integration, and launch handoff; subagents do
  bounded, disjoint, localized work (the localized-roboport discipline — never one
  mega network). Follows `biters`' minimal-diff doctrine; uses `tdd` when
  test-first and `debug-tools` for bugs. Prepares a review packet; does not own
  closeout (that is `rocket-launch`).
- **GitHub/Linear:** branch/worktree + PR; reads issue acceptance criteria.
- **Invariants:** preserves one-issue-one-branch-one-PR; branch carries the issue
  id for the bridge; implements only the acceptance criteria; never silently
  closes the issue.
- **Eval cases:** positive "implement ABC-12"; positive "continue work on the
  offline-mode sync issue"; adversarial "strat building ABC-12"; negative
  "triage the new bugs" (-> `blueprint` `triage` lens).


### `rocket-launch`

- **Trigger:** `Use when` a change is ready to ship: open/merge the PR, run the
  review gate, and close out the Linear issue.
- **Does:** enforce the launch gates, then merge and let the bridge close the
  issue. Gates: targeted tests for the changed behavior pass; >=1 review-subagent
  lens clean or findings fixed; all Linear acceptance criteria checked; GitHub CI
  green; `biters` minimal-diff pass (diff minimal, no stray abstraction).
- **GitHub/Linear:** PR review/merge + CI status; Linear issue close + status
  update.
- **Invariants:** never merges with a red gate; never silently closes without the
  bridge/acceptance check; leaves a human-reviewable record.
- **Eval cases:** positive "ship the offline-mode PR"; positive "this is ready,
  launch it"; negative "open a draft PR, not ready" (-> `roboports`).

### `assembler` (minimal for MVP)

- **Trigger:** `Use when` setting up a repo for the kit, or refreshing its
  envelope: which Linear team/project/labels map to this repo, its domain
  glossary, its commands, and its PR/issue/doc templates.
- **Does (MVP):** read the repo + ask only for facts tools can't supply, then
  generate the repo-local Markdown envelope (`.agents/envelope/`); stamp
  templates from `blueprint/templates/`. Reuses the retired bootstrap trio's
  machinery, re-themed. Full per-repo skill/agent generation is enrichment.
- **Invariants:** never writes secrets; create-missing-only; `.agents/envelope/`
  is the single author-owned binding point every kit skill reads.
- **Eval cases:** positive "set up this repo for the kit"; positive "refresh the
  Linear mapping for this repo"; negative "create an issue" (-> `blueprint`).

## Additional shipped skill notes

### `map-seed` (re-themes `prototype`)

- **Trigger:** `Use when` the user wants to prototype or de-risk a design before
  committing, work out the kinks under fixed/awkward constraints, or run a quick
  throwaway then iterate.
- **Does:** in Factorio you don't always get a good starting map; you plan around
  what you're dealt. This skill plans around constraints that can't be changed,
  runs a fast disposable prototype, retros what worked vs what didn't, then
  restarts fresh carrying the learnings (reroll the seed) instead of polishing a
  doomed first run. Reuses the existing `prototype` logic/UI references.
- **Feeds:** its findings fold back into `blueprint` (the spec) as
  decision-encoding notes; never ships to production directly.

### `biters` (security / enemies)

- **Trigger:** `Use when` the user wants an adversarial security pass: hunt
  harmful bugs, find breaches, map attack paths, or stress the codebase's walls.
- **Does:** plays the enemy. Probes trust boundaries, looks for the bugs that
  *bite* (data loss, injection, auth bypass, secret leakage), and reports attack
  paths with severity. Uses the kept security utilities when needed
  (`security-threat-model`, `security-best-practices`, `security-ownership-map`)
  and the `biters` correctness/minimal-diff lenses rather than reinventing them.


### `space-age` (platforms + planets)

- **Trigger:** `Use when` work crosses one repo or one environment: CI/CD
  pipelines, releasing/promoting through environments, or coordinating a change
  across multiple repos/services.
- **Does:** interplanetary logistics. Treats each environment/repo as a planet
  with its own constraints (staging/prod/edge ~ Vulcanus/Fulgora/Gleba/Aquilo) and
  the pipeline as the space platform carrying artifacts between them. Defines the
  promotion path and the per-planet gates (the `rocket-launch` gates apply per
  environment), and coordinates multi-repo changes so dependents land in order.
- **Invariants:** every promotion passes that environment's gates; never promotes
  past a red gate; cross-repo changes are dependency-ordered; reuses
  `rocket-launch` per hop rather than reinventing merge/gate logic.
- **Eval cases:** positive "set up CI to promote this from staging to prod";
  positive "roll this change across the three service repos"; negative "ship this
  one PR" (-> `rocket-launch`); negative "implement the feature" (-> `roboports`).

## Cutover retire/keep map

Cutover completed (2026-06-23): replacement skills reached parity and the
The previous default planning lane was retired in favor of the tracker-picked Factorio
kit. Retirements were gated on each replacement reaching parity: `inserter`,
`main-bus`, `roboports`, `rocket-launch`, and `assembler` now own the old lane's
active responsibilities.

- **Retire (replaced):** `to-prd`, `to-issues`, `triage`,
  `issue-execution`, `gh-issue-thread-chain`, `thread-closeout`,
  `improve-codebase-architecture`, `repo-workflow-bootstrap`, `workflow-kit`,
  `setup-matt-pocock-skills`, `agent-recipes`.
- **Re-theme (renamed, content reused):** `prototype` -> `map-seed`.
- **Keep as operator-local utilities (cited at `~/.agents/skills/`):**
  `chrome-devtools`, `chronicle`, `computer-use`, `debug-tools`,
  `deliverable-report`, `execute-plan`, `find-skills`, `grill-with-docs`,
  `openai-docs`, `repo-triage`, `security-best-practices`,
  `security-ownership-map`, `security-threat-model`, `skill-maintenance`,
  `swiftui-pro`, `tdd`, and `write-a-skill`; see
  [`operator-local-manifest.md`](operator-local-manifest.md).
- **Repo-owned kit utilities (`skills/`):** `assembler`, `prospect`, `space-age`, `map-seed`.
- For each retired skill: delete its dir, drop/rewrite its `*-skill.test.mjs`,
  remove its `canonical-manifest.md` row, and update the README test tables.

## Eval harness layers

1. **Lint** — `validate-skills.mjs` (frontmatter, `name`==dir, concrete
   `Use when`, no secrets, no collisions). Offline CI.
2. **Content-envelope test** — `tests/<skill>-skill.test.mjs` pins the trigger,
   routing, and load-bearing invariants. Offline CI.
3. **Trigger evals** — `<skill>/evals/evals.json` with positive + adversarial/typo
   + negative prompts, LLM-judged. On-demand.
4. **Golden-path behavioral eval** — end-to-end over mock Linear/GitHub fixtures
   (offline CI) + opt-in live sandbox smoke (test Linear team + throwaway repo)
   before release.
5. **Doctrine benchmark** — `biters` minimal-diff lens: diff/LOC vs no-skill
   baseline on fixed tasks with a correctness gate green.
