# Factorio Workflow Kit Manifest

The curated, Factorio-themed planning/execution lane for loom. Linear is the
planning system of record; GitHub is code delivery; the two are bridged by
Linear's native GitHub integration (branch name carries the Linear issue id, the
PR auto-links and auto-closes the issue on merge). Decisions are recorded in
[ADR 0003](../decisions/0003-factorio-workflow-kit.md).

This manifest is the build contract. Each skill is authored eval-first: write its
`evals.json` and content-contract test, then iterate `SKILL.md` until both pass.

## Pipeline

```
prospect      land on the idea            -> Linear initiative/project + idea doc
  -> research    survey before building    -> Linear document (research notes)
  -> blueprint   draft spec + templates    -> Linear doc (PRD) + blueprint/templates/
  -> main-bus    keep lanes open to scale  -> architecture/ADR notes
  -> ghosts      stamp planned work        -> Linear issues/sub-issues, dependency-ordered
  -> dispatch    sort/route/prioritize     -> Linear states + labels
  -> robots      build the ghosts          -> branch/worktree -> implement/test -> PR
  -> modules     optimize where it pays    -> perf via diagnose, diminishing-returns aware
  -> quality     refactor in place/salvage -> upgrade or recycle, never sprawl
  -> rocket-launch  ship it                -> review gate, merge PR, close Linear issue
  -> space-age   beyond one repo           -> CI/CD + multi-repo/multi-env logistics

assembler   crafts the per-repo contract + tooling that every skill above reads.
bus-first   the minimal-diff doctrine every code-writing skill cites.
```

## Principles

- **Linear-first, bridged.** Planning artifacts are Linear objects. Code lands as
  GitHub PRs. The bridge is the branch name (`<issue-id>`) + PR magic words.
- **Clean Factorio nouns, no prefix.** The `description` `Use when ...` line does
  all routing; names are evocative, not load-bearing for activation.
- **Doctrine, not sprawl.** `bus-first` is cited, never copied, by code-writing
  skills. Reuse before write; minimum that works; never cut
  validation/security/error-handling/accessibility.
- **Dynamic per repo.** `assembler` generates a repo contract; skills read it.
  Skills do not hardcode trackers, teams, labels, or commands.
- **Eval-first.** No skill is "released" until its eval layers are green.

## Skill table

| Skill | Factorio | Does | Linear | GitHub | Status | Replaces / Reuses |
|---|---|---|---|---|---|---|
| `bus-first` | Gleba spoilage / clean bus | minimal-diff doctrine ladder | — | — | MVP | new; inspired by ponytail |
| `prospect` | scout a new patch | start a new idea | initiative/project + doc | — | MVP | new |
| `blueprint` | saved layout you stamp | PRD/spec + reusable templates | document; template scaffolds | PR/issue templates | MVP | replaces `to-prd` |
| `ghosts` | ghost = planned-unbuilt entity | split plan into tracer-bullet issues, dep-ordered | issues/sub-issues, blocked-by | — | MVP | replaces `to-issues` |
| `robots` | construction/logistic bots | execute one issue end-to-end + fanout discipline | reads issue/acceptance | branch/worktree -> PR | MVP | replaces `issue-execution`, `agent-recipes`; reuses `tdd`, `diagnose` |
| `rocket-launch` | launch | ship: review gate, merge, close issue | close issue, status update | PR review/merge/CI | MVP | replaces `thread-closeout`, `gh-issue-thread-chain` closeout; reuses `pr-review`, `proof-pass` |
| `assembler` | machine that builds machines | per-repo contract + tooling generation | team/project/label map | template files | MVP (minimal) | replaces `repo-workflow-bootstrap`, `workflow-kit`, `setup-matt-pocock-skills` |
| `research` | science packs (tiered) | spike/investigate before building | research document | — | enrich | new |
| `main-bus` | central bus, anti-spaghetti | scalability/architecture so you don't wall yourself in | ADR/doc | — | enrich | replaces `improve-codebase-architecture` |
| `dispatch` | filter inserter / logistics request | triage: classify, prioritize, route to ready | states + labels | — | enrich | replaces `triage` |
| `modules` | modules + beacons (diminishing returns) | optimize where returns exist | — | — | enrich | new; reuses `diagnose` |
| `quality` | quality tiers + recycler | refactor in place / salvage / delete | — | — | enrich | new; cites `bus-first` |
| `space-age` | platforms/planets | CI/CD + multi-repo/multi-env logistics | cross-project | CI | enrich | new |
| `map-seed` | reroll a bad starting map | throwaway prototype + plan around fixed constraints + retro + restart with learnings | optional prototype note | — | enrich | re-themes `prototype` |
| `biters` | enemies that breach your walls | adversarial security review: hunt harmful bugs, breaches, attack paths | — | — | enrich | new; reuses `security-threat-model`, `security-best-practices`, `pr-review` |

## MVP skill contracts

### `bus-first` (doctrine)

- **Trigger:** `Use when` writing or changing code and the change risks
  over-building, premature abstraction, a new dependency, or a rewrite of code
  that already exists; or when asked to do a minimal-diff / tighten pass on a
  change or PR.
- **The ladder (walk after understanding the code, stop at the first rung that holds):**
  1. Does this need to exist? No -> skip it (don't overproduce; Gleba spoilage).
  2. Already on the bus (in this codebase)? -> reuse it, don't rewrite.
  3. Standard library does it? -> use it.
  4. Native platform feature? -> use it.
  5. An already-installed dependency? -> use it.
  6. One line? -> one line.
  7. Only then: the minimum that works.
- **Never cut:** trust-boundary validation, data-loss handling, security,
  accessibility. Lazy about the solution, never about reading the code first.
- **Reference files:** `LADDER.md` (the rungs + worked before/after examples),
  `REVIEW.md` (how to run a minimal-diff pass on someone else's change).
- **Eval cases:**
  - positive: "add a date picker to the signup form" -> reaches for the native
    control / existing component instead of a new dependency + wrapper.
  - positive: "tighten this PR, it feels over-engineered" -> runs the ladder over
    the diff and proposes removals without cutting validation.
  - adversarial/typo: "make this chnage as small as possible" -> still activates.
  - negative: "explain how React reconciliation works" -> does NOT activate
    (no code change requested).

### `prospect`

- **Trigger:** `Use when` the user is starting a brand-new idea, feature, or
  initiative from scratch and wants it captured as planning work before any
  spec/issues exist.
- **Does:** clarify the idea's intent and shape (briefly, no relitigating), then
  create the Linear home for it — an initiative or project (per the repo
  contract) plus an idea/brief document attached to it. Returns the created
  object ids/links. Hands off to `research` (if unknowns) or `blueprint` (if
  ready to spec).
- **Linear:** `save_project` / `save_initiative` + `save_document`.
- **Invariants:** never starts implementation; never creates issues (that is
  `ghosts`); reads the `assembler` contract for the target team/project.
- **Eval cases:** positive "kick off a new idea: offline mode for the editor";
  adversarial "lets start a new thing, offline editor idk yet"; negative "split
  this plan into issues" (-> route to `ghosts`).

### `blueprint`

- **Trigger:** `Use when` the user wants a PRD/spec from current context, or
  wants/needs a reusable PR/doc/issue/project template.
- **Does:** synthesize a PRD/spec (no interview — use known context) and publish
  it as a Linear document on the prospect's project; route prototyping to
  `map-seed` when a design must be felt first, then fold its findings back. Owns
  the canonical templates under `blueprint/templates/`.
- **Linear/GitHub:** `save_document` for the spec; templates materialized by
  `assembler`.
- **Invariants:** spec uses the repo domain glossary from the contract; explicit
  acceptance criteria + non-goals + proof plan; no file paths/code snippets in the
  spec except decision-encoding prototype snippets.
- **Eval cases:** positive "write the PRD for offline mode"; positive "give me a
  PR template for this repo"; negative "create the Linear issues now" (->
  `ghosts`).

### `ghosts`

- **Trigger:** `Use when` the user wants to turn a plan/spec/PRD into tracked
  issues, create implementation tickets, or break work down.
- **Does:** split the plan into tracer-bullet vertical slices (each cuts through
  every layer, demoable on its own), mark HITL vs AFK, set dependencies, then
  publish Linear issues/sub-issues in dependency order with blocked-by relations.
- **Linear:** `save_issue` (parent for sub-issues, blockedBy/blocks, labels,
  project, milestone, estimate), reads contract label/state map.
- **Invariants:** thin vertical slices over thick horizontal ones; dependency
  order so blockers are referenceable; does not implement; does not modify a
  parent idea's scope.
- **Eval cases:** positive "turn the offline-mode PRD into issues"; positive
  "make tickets for this"; adversarial "brek this down into tickts"; negative
  "implement issue ABC-12" (-> `robots`).

### `robots`

- **Trigger:** `Use when` the user asks to start, continue, or ship one tracked
  Linear issue end-to-end (implement, test, open/update the PR).
- **Does:** one issue -> one branch/worktree (named with the Linear issue id) ->
  one PR. Main agent owns intake/integration/closeout; subagents do bounded,
  disjoint, localized work (the localized-roboport discipline — never one mega
  network). Cites `bus-first` for the implementation; uses `tdd` when test-first,
  `diagnose` for bugs. Prepares a review packet; does not own closeout (that is
  `rocket-launch`).
- **GitHub/Linear:** branch/worktree + PR; reads issue acceptance criteria.
- **Invariants:** preserves one-issue-one-branch-one-PR; branch carries the issue
  id for the bridge; implements only the acceptance criteria; never silently
  closes the issue.
- **Eval cases:** positive "implement ABC-12"; positive "continue work on the
  offline-mode sync issue"; adversarial "strat building ABC-12"; negative
  "triage the new bugs" (-> `dispatch`).

### `rocket-launch`

- **Trigger:** `Use when` a change is ready to ship: open/merge the PR, run the
  review gate, and close out the Linear issue.
- **Does:** enforce the launch gates, then merge and let the bridge close the
  issue. Gates: targeted tests for the changed behavior pass; >=1 review-subagent
  lens clean or findings fixed; all Linear acceptance criteria checked; GitHub CI
  green; `bus-first` pass (diff minimal, no stray abstraction).
- **GitHub/Linear:** PR review/merge + CI status; Linear issue close + status
  update.
- **Invariants:** never merges with a red gate; never silently closes without the
  bridge/acceptance check; leaves a human-reviewable record.
- **Eval cases:** positive "ship the offline-mode PR"; positive "this is ready,
  launch it"; negative "open a draft PR, not ready" (-> `robots`).

### `assembler` (minimal for MVP)

- **Trigger:** `Use when` setting up a repo for the kit, or refreshing its
  contract: which Linear team/project/labels map to this repo, its domain
  glossary, its commands, and its PR/issue/doc templates.
- **Does (MVP):** read the repo + ask only for facts tools can't supply, then
  generate the repo-local contract (`.agents/contract/` or repo docs) and stamp
  templates from `blueprint/templates/`. Reuses the retired bootstrap trio's
  machinery, re-themed. Full per-repo skill/agent generation is enrichment.
- **Invariants:** never writes secrets; create-missing-only; the contract is the
  single binding point every kit skill reads.
- **Eval cases:** positive "set up this repo for the kit"; positive "refresh the
  Linear mapping for this repo"; negative "create an issue" (-> `ghosts`).

## Enrichment skill notes

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
  paths with severity. Orchestrates the kept security engines
  (`security-threat-model`, `security-best-practices`, `security-ownership-map`)
  and `pr-review` rather than reinventing them.
- **Pairs with:** `bus-first`'s "never on the chopping block" guards — `biters`
  is the attacker those guards defend against.

### `research` (science packs)

- **Trigger:** `Use when` there is an open unknown that must be resolved before
  building — a spike, a feasibility/approach investigation, a "how do other
  systems do this", or a decision blocked on missing facts.
- **Does:** runs a time-boxed investigation and writes findings as a Linear
  document on the idea's project. Tiered like science packs: start with the
  cheapest pack that answers the question (red = a quick local spike / read the
  code; green = integration/contract checks; higher tiers = external/library/
  prior-art research) and stop as soon as the decision is unblocked. Reuses
  `map-seed` when the unknown is best answered by a throwaway prototype.
- **Invariants:** time-boxed; every finding states the decision it unblocks;
  never slides into implementation; feeds `blueprint`. Reads the repo contract.
- **Eval cases:** positive "spike whether we can do offline sync with CRDTs";
  positive "research how other editors handle conflict resolution"; negative
  "implement the sync layer" (-> `robots`); negative "what's the capital of
  France" (no activation).

### `main-bus` (re-themes `improve-codebase-architecture`)

- **Trigger:** `Use when` planning structure/architecture so the codebase can
  scale without walling itself in — laying shared "lanes", deciding seams, or
  untangling spaghetti before it spreads.
- **Does:** plans the bus. Identifies the shared materials (core types, services,
  utilities) that many features tap, keeps them flowing on clear lanes, and routes
  new work off the bus instead of laying parallel spaghetti. Calls out where the
  current layout blocks future scale and proposes the minimal restructure (cites
  `bus-first` — restructure no more than the scaling need requires). Reuses the
  existing architecture/deepening/interface/language guidance, re-themed.
- **Invariants:** plans/advises, does not mass-refactor in place (that is
  `quality`); proposes seams at the highest point; records decisions as an
  ADR/doc. Reads the repo contract + domain glossary.
- **Eval cases:** positive "how should we structure this so it scales";
  positive "this is turning into spaghetti, plan the bus"; negative "rename this
  variable everywhere" (-> `quality`); negative "implement the cache" (->
  `robots`).

### `dispatch` (re-themes `triage`)

- **Trigger:** `Use when` sorting incoming Linear issues: classify, prioritize,
  set state/labels, decide what is ready to pick up, or route bugs vs features.
- **Does:** the filter inserter — routes each issue to the right place. Moves
  issues through the contract's state machine (e.g. needs-triage -> needs-info ->
  ready-for-agent / ready-for-human / wontfix) and category (bug vs enhancement),
  using the repo contract's label/state map; reproduces bugs before promoting
  them; writes an agent brief when marking ready-for-agent. Re-themes the existing
  `triage` state machine to Linear via `save_issue`/labels/`save_comment`.
- **Invariants:** exactly one category + one state per issue; never implements;
  reads the contract label/state map and never hardcodes label strings; routes
  fully-specified work to `robots` and decomposition to `ghosts`.
- **Eval cases:** positive "triage the new bugs and tell me what's ready";
  positive "what should we pick up next"; negative "split this plan into issues"
  (-> `ghosts`); negative "implement ABC-12" (-> `robots`).

### `modules` (modules + beacons)

- **Trigger:** `Use when` optimizing for performance/efficiency: a slow path, a
  throughput/latency problem, or a "make this faster/cheaper" ask.
- **Does:** optimizes where the returns are real. Finds the bottleneck first
  (reuses `diagnose`), measures a baseline, applies the smallest effective change,
  and re-measures. Respects diminishing returns (beacons scale 1.5x-root-n, not
  linearly) — stops when the next gain costs more than it returns. Cites
  `bus-first`: never adds complexity or an abstraction for a gain you can't measure.
- **Invariants:** measure before and after (no unverified perf claims); optimize
  the proven bottleneck, not a guess; never trades correctness or a guard for speed.
- **Eval cases:** positive "this endpoint is slow, speed it up"; positive "reduce
  the build time"; negative "explain big-O of quicksort" (no activation); negative
  "refactor this for readability" (-> `quality`).

### `quality` (quality tiers + recycler)

- **Trigger:** `Use when` improving existing code in place without changing
  behavior: refactor for clarity/maintainability, raise a module's quality tier,
  or delete/salvage dead or duplicated code.
- **Does:** two moves. Quality tier = upgrade a unit in place (vertical) instead
  of sprawling new code (horizontal). Recycler = break code back down — delete
  dead paths, salvage duplication back onto the bus — accepting that a refactor
  costs effort now to repay later. Cites `bus-first` (reuse before rewrite;
  smallest change) and runs behavior-preserving checks.
- **Invariants:** behavior-preserving (tests stay green; no feature change); never
  deletes load-bearing guards; prefers reuse over rewrite; distinct from `modules`
  (perf) and `main-bus` (structure planning).
- **Eval cases:** positive "clean up this module, it's a mess"; positive "this is
  duplicated in three places, consolidate it"; negative "make it faster" (->
  `modules`); negative "add a new endpoint" (-> `robots`).

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
  one PR" (-> `rocket-launch`); negative "implement the feature" (-> `robots`).

## Cutover retire/keep map

Deferred (decision, 2026-06-23): the cutover is NOT run until each retired skill's
replacement exists at parity — specifically `dispatch` and `main-bus` are built and
`assembler` is fleshed beyond the MVP to absorb the bootstrap trio. Until then the
kit co-exists with the skills it will replace (accepted transient routing overlap).
Each retirement is gated on its own replacement reaching parity, not done as one
blanket delete.

- **Retire (replaced):** `to-prd`, `to-issues`, `triage`,
  `issue-execution`, `gh-issue-thread-chain`, `thread-closeout`,
  `improve-codebase-architecture`, `repo-workflow-bootstrap`, `workflow-kit`,
  `setup-matt-pocock-skills`, `agent-recipes`.
- **Re-theme (renamed, content reused):** `prototype` -> `map-seed`.
- **Keep as engines (cited, not retired):** `diagnose`, `tdd`, `pr-review`,
  `proof-pass`, `handoff`, `repo-triage`, `resume-thread`, `deliverable-report`,
  `execute-plan`, `zoom-out`, `thread-control`, `fleet-status`,
  `security-threat-model`, `security-best-practices`, `security-ownership-map`,
  plus all non-workflow skills.
- For each retired skill: delete its dir, drop/rewrite its `*-skill.test.mjs`,
  remove its `canonical-manifest.md` row, and update the README test tables.

## Eval harness layers

1. **Lint** — `validate-skills.mjs` (frontmatter, `name`==dir, concrete
   `Use when`, no secrets, no collisions). Offline CI.
2. **Content-contract test** — `tests/<skill>-skill.test.mjs` pins the trigger,
   routing, and load-bearing invariants. Offline CI.
3. **Trigger evals** — `<skill>/evals/evals.json` with positive + adversarial/typo
   + negative prompts, LLM-judged. On-demand.
4. **Golden-path behavioral eval** — end-to-end over mock Linear/GitHub fixtures
   (offline CI) + opt-in live sandbox smoke (test Linear team + throwaway repo)
   before release.
5. **Doctrine benchmark** — `bus-first` only: diff/LOC vs no-skill baseline on
   fixed tasks with a correctness gate green.
