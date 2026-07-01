# Cross-Harness Plugin Bridge Design

Issue LOO-2 designed the cross-harness plugin bridge: how Loom installs its
skills/agents/config nucleus into the **Codex** and **Claude** plugin/marketplace
surfaces through portable plugin manifests. LOO-102 activates that design for
scratch-HOME proof only, and LOO-105 makes `.agents/skills/{agent-name}/` the
canonical repo-local package source rendered into the plugin distribution tree.
The bridge reuses the shipped render-to-write executor
(`scripts/render-harness-nucleus.mjs`) and its strict-manual safety gate for every
write.

LOO-102/LOO-105 write nothing to the operator's real `~/.codex`, `~/.claude`,
`~/.agents`, or repo config without explicit HITL approval, and they do not
install, enable, or publish any plugin.
This bridge builds directly on the adapter plans already in this repo:

- `docs/harness/codex-adapter-plan.md` (issue #41) — Codex agent/skill/config mapping and TOML template boundaries.
- `docs/harness/claude-adapter-plan.md` (issue #42) — Claude agent/skill/settings mapping and Markdown/JSON template boundaries.
- `docs/harness/resource-manifest.md` / `.json` (issue #38) — disposition model (`track`/`adapt`/`reference-only`/`local-only`) and the source of truth for ownership.
- `scripts/render-harness-nucleus.mjs` (issue #56) — the render → gate → apply executor and `~/.loom-harness/applied-manifest.json` marker model.
- `scripts/lib/harness-safety.mjs` (issue #45) — shared `DANGEROUS_PATH_RULES`, secret/private-home scanners reused by the gate.

> Scope note: historical sections below preserve the design rationale; the
> authoritative activation boundary is the LOO-102 record and scratch-only
> verification loop in §3.2-§3.4.

## Sources

Plugin/marketplace formats below are grounded in the official Codex and Claude
documentation. Anything not confirmed by these sources is marked as an
**assumption** or **open question** and is never presented as fact.

- Codex — Build plugins: <https://developers.openai.com/codex/plugins/build>
- Codex — Plugins (browse/install): <https://developers.openai.com/codex/plugins>
- Codex — Hooks: <https://developers.openai.com/codex/hooks>
- Claude Code — Create plugins: <https://code.claude.com/docs/en/plugins>
- Claude Code — Create and distribute a plugin marketplace: <https://code.claude.com/docs/en/plugin-marketplaces>
- Claude Code — Hooks reference: <https://code.claude.com/docs/en/hooks>

The OMP nucleus surfaces (bundled agents, skill candidates, config split) are
grounded in `distributions/snapshots/omp-builtins/source.json`,
`distributions/snapshots/omp-builtins/portability-matrix.json`, and
`adapters/omp/source/` as recorded by the adapter plans and the resource manifest.

---

## 1. Inventory of Codex and Claude plugin/marketplace surfaces

Both harnesses ship the *same conceptual model*: a **plugin** is a self-contained
directory whose manifest names the plugin and points at bundled components
(skills, hooks, MCP servers, …); a **marketplace** is a JSON catalog that lists
plugins and where to fetch each one. The harness installs a plugin from a
marketplace entry into a per-harness cache, and stores enable/disable state
separately. The wrappers, component sets, and a few field names differ.

### 1.1 Codex

**Plugin manifest** — `.codex-plugin/plugin.json` is the required entry point.
Only `plugin.json` lives inside `.codex-plugin/`; all component dirs stay at the
plugin root. Source: Codex *Build plugins*.

| Field | Role |
| --- | --- |
| `name`, `version`, `description` | Identity (kebab-case `name` is the plugin id + component namespace). |
| `author`, `homepage`, `repository`, `license`, `keywords` | Publisher/discovery metadata. |
| `skills` | `./`-relative pointer to bundled skill folders (`skills/<name>/SKILL.md`). |
| `mcpServers` | `./`-relative pointer to `.mcp.json` (direct map or wrapped `mcp_servers`). |
| `apps` | `./`-relative pointer to `.app.json` (apps/connectors). |
| `hooks` | `./`-relative path / array / inline object for lifecycle hooks (default `hooks/hooks.json`). |
| `interface` | Install-surface metadata: `displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`, `brandColor`, `composerIcon`, `logo`, `screenshots`. |

> Codex plugin manifests **have no `agents` component pointer** — Codex custom
> agents are TOML config surfaces (`.codex/agents/*.toml`, per
> `docs/harness/codex-adapter-plan.md`), *not* plugin-bundled components. This is
> the single biggest divergence from Claude and drives the mapping in §2.

**Marketplace** — a JSON catalog Codex reads from (Build plugins → *How Codex uses marketplaces*):

- repo: `$REPO_ROOT/.agents/plugins/marketplace.json`
- legacy-compatible repo: `$REPO_ROOT/.claude-plugin/marketplace.json`
- personal: `~/.agents/plugins/marketplace.json`
- the curated source behind the official Plugin Directory

Marketplace entry shape: top-level `name`, `interface.displayName`, and
`plugins[]` where each entry has `name`, `source`, `policy`, `category`:

```json
{
  "name": "local-example-plugins",
  "interface": { "displayName": "Local Example Plugins" },
  "plugins": [
    {
      "name": "my-plugin",
      "source": { "source": "local", "path": "./plugins/my-plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

- `source` may be a `local` object (`{"source":"local","path":"./..."}`) or a bare
  string path; or a Git source `{"source":"url",...}` / `{"source":"git-subdir","url":...,"path":...,"ref":...,"sha":...}`.
- `source.path` is `./`-prefixed, relative to the marketplace root, and must stay
  inside that root.
- `policy.installation` ∈ `AVAILABLE` | `INSTALLED_BY_DEFAULT` | `NOT_AVAILABLE`;
  `policy.authentication` decides whether auth happens on install or first use.
- An entry whose source can't be resolved is skipped (the marketplace does not fail).

**Install surfaces / CLI:**

- `codex plugin marketplace add <owner/repo|url|./local-root> [--ref <ref>] [--sparse <path>]`, plus `list` / `upgrade` / `remove`.
- In-session `/plugin marketplace add`, `/plugin install <plugin>@<marketplace>`, `/reload-plugins`.
- Install cache (**local-only**): `~/.codex/plugins/cache/$MARKETPLACE/$PLUGIN/$VERSION/` (`$VERSION` is `local` for local plugins).
- Enable/disable + plugin-scoped MCP policy stored in `~/.codex/config.toml` (`[plugins."<plugin>"]`, `[plugins."<plugin>".mcp_servers.<server>]`).
- Personal plugin source folders by convention under `~/.codex/plugins/<name>/` (distinct from the `cache/` subtree).

### 1.2 Claude Code

**Plugin manifest** — `.claude-plugin/plugin.json`; only `name` is strictly
required (it is the namespace). Components auto-discover from standard dirs when
the pointers are omitted. Source: Claude *Create plugins*.

| Field | Role |
| --- | --- |
| `name` | **Required.** Identity + skill/agent/command namespace (`/<name>:<skill>`). |
| `description`, `version`, `author` | Identity/attribution (`version` omitted ⇒ git commit SHA is the version). |
| `homepage`, `repository`, `license`, `keywords` | Publisher/discovery metadata. |
| `skills`, `agents`, `commands` | Component pointers (`skills/<name>/SKILL.md`, `agents/*.md`, legacy `commands/`). |
| `hooks` | Pointer to `hooks/hooks.json`. |
| `mcpServers` | Pointer to `.mcp.json`. |
| `outputStyles`, `lspServers` | Output styles dir, `.lsp.json`. |

Plugin-root dirs: `skills/`, `agents/`, `commands/`, `hooks/hooks.json`,
`.mcp.json`, `.lsp.json`, `monitors/monitors.json`, `bin/`, and a `settings.json`
(only `agent` and `subagentStatusLine` keys supported). A single-skill plugin may
place `SKILL.md` at the plugin root.

> Claude plugin manifests **do** bundle `agents/*.md`, unlike Codex.

**Marketplace** — `.claude-plugin/marketplace.json` at the repo root (Claude
*Create and distribute a plugin marketplace*):

```json
{
  "name": "my-plugins",
  "owner": { "name": "Your Name" },
  "plugins": [
    {
      "name": "review-plugin",
      "source": "./plugins/review-plugin",
      "description": "Adds a /review skill for quick code reviews"
    }
  ]
}
```

- Plugin `source` types: relative path (`"./..."`); `github` `{repo, ref?, sha?}`;
  `url` `{url, ref?, sha?}`; `git-subdir` `{url, path, ref?, sha?}`.
- An optional `$schema` and `description` may appear; the schema URL referenced by
  Anthropic's own marketplace (`https://anthropic.com/claude-code/marketplace.schema.json`)
  is **not currently a live document** — see open questions.

**Install surfaces / CLI:**

- `claude plugin marketplace add <owner/repo>`; in-session `/plugin marketplace add`, `/plugin install <plugin>@<marketplace>`, `/reload-plugins`.
- `claude plugin validate` (the same check the community review pipeline runs).
- Dev/test without install: `claude --plugin-dir ./plugin` (also `.zip`), `claude --plugin-url <zip-url>`.
- Skills-directory plugin: `claude plugin init <name>` scaffolds `~/.claude/skills/<name>/.claude-plugin/plugin.json` that auto-loads next session as `<name>@skills-dir` — no marketplace/install step.
- Plugin download cache + runtime data (**local-only**): `~/.claude/plugins/cache/`, `~/.claude/plugins/data/`.

### 1.3 Cross-harness compatibility (the bridge's leverage)

Three documented facts make a *single portable bridge* feasible rather than two
unrelated installers:

1. **Codex reads `.claude-plugin/marketplace.json`** as a legacy-compatible repo
   marketplace location. One repo-root marketplace file can therefore be visible
   to both harnesses (Codex additionally prefers `.agents/plugins/marketplace.json`). LOO-101 uses Claude plugin skills for shared-agent packages instead of the optional `agents/` component.
2. **Shared manifest field vocabulary**: `name`, `version`, `description`,
   `author`, `homepage`, `repository`, `license`, `keywords`, `skills`,
   `mcpServers`, `hooks` mean the same thing in both `plugin.json` dialects. The
   wrapper dir (`.codex-plugin/` vs `.claude-plugin/`) and the extras differ
   (Codex: `apps`, `interface`; Claude: `agents`, `commands`, `outputStyles`,
   `lspServers`, `monitors`, root `settings.json`).
3. **Shared hooks schema**: both use `hooks.json` with the same three-level shape
   (event → matcher group → command handlers) and both expose a `Stop` event
   (§4). Codex even sets `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA` alongside its
   own `PLUGIN_ROOT`/`PLUGIN_DATA` "for compatibility with existing plugin hooks."

### 1.4 Open questions / assumptions for §1

- **[Open]** Can one plugin *folder* carry sibling `.codex-plugin/` and
  `.claude-plugin/` manifests over a shared component root (a "dual-manifest"
  plugin), so both harnesses load the same files? Both docs say "only the manifest
  belongs in the wrapper dir; components stay at plugin root," which *suggests*
  two sibling wrappers over a shared root are compatible, but neither doc states
  this co-location is supported. **Assumption pending verification.** Fallback:
  ship per-harness plugin folders that share content via the renderer.
- **[Open]** Codex `interface.capabilities` enum values and Codex `category`
  allowed values are not enumerated in the docs read (examples only: `"Read"`,
  `"Write"`, `category "Productivity"`). Treat as free-form until confirmed.
- **[Open]** Claude marketplace `$schema` URL is referenced but not live; do not
  depend on remote schema validation.
- **[Assumption]** "Loom nucleus" = the OMP bundled agents (8) and skill
  candidates (6) recorded under `distributions/snapshots/omp-builtins/` plus the portable
  config base `adapters/omp/source/config.yml`, exactly as the #41/#42 adapter plans
  scoped them.

---

## 2. Mapping the Loom nucleus onto each plugin schema

Loom's nucleus has three parts: **skills** (6 portable command-derived skill candidates), **shared agent packages** (the canonical shared nucleus model from `docs/harness/shared-nucleus-agents.*`), and **config** (`adapters/omp/source/` portable base). The mapping respects each harness's component model and treats native agent files as harness-specific adapter format, not canonical behavior source.

| Loom nucleus piece | Source of truth | Codex plugin surface | Claude plugin surface |
| --- | --- | --- | --- |
| Skill candidates `omp-btw`, `omp-guided-goal`, `omp-handoff`, `omp-complaint-to-rule`, `omp-plan`, `omp-tangent` | `distributions/snapshots/omp-builtins/portability-matrix.json`; shared `.agents/skills/<name>` | plugin `skills/<name>/SKILL.md` via `plugin.json#skills` | plugin `skills/<name>/SKILL.md` via `plugin.json#skills` |
| Shared nucleus agents such as `spidertron`, `science-pack`, `main-bus`, `biters`, `spitters`, `bus-first`, and `lab` | `docs/harness/shared-nucleus-agents.*` | Canonical Vercel-shaped packages under plugin `skills/{agent-name}/`; Codex may load them as plugin skills and must not get direct `omp-*` custom-agent ports. | Canonical Vercel-shaped packages under plugin `skills/{agent-name}/`; LOO-101 supersedes the #42 `agents/omp-*.md` Claude role ports. |
| Dropped agent `oracle`; kept-native `task`, `quick_task`, (Codex) `explore` | source.json | not packaged | not packaged |
| Library/API research deps (for shared `science-pack`) | #41/#42 plus `docs/harness/shared-nucleus-agents.*` | plugin `.mcp.json` via `plugin.json#mcpServers` (optional) | plugin `.mcp.json` via `plugin.json#mcpServers` (optional) |
| Verified-loop check (§4) | this design | plugin `hooks/hooks.json` `Stop` handler (`type:"command"`) | plugin `hooks/hooks.json` `Stop` handler |
| Plugin identity + catalog | this design | `.codex-plugin/plugin.json` + `~/.agents/plugins/marketplace.json` (or repo `.agents/plugins/marketplace.json`) | `.claude-plugin/plugin.json` + repo `.claude-plugin/marketplace.json` |
| Config nucleus `adapters/omp/source/config.yml` (modelRoles, provider routing, skill toggles) | `adapters/omp/source/`; resource-manifest | **Not plugin-portable** — provider/model/role config is forbidden in rendered manifests (see §3 gate). Stays OMP source; only neutral `interface` metadata is exposed | **Not plugin-portable** — plugin root `settings.json` is limited to `agent`/`subagentStatusLine`; never carries model/provider/auth |

### 2.1 Packaging decision: one "loom-nucleus" plugin, dual manifest

Recommended unit: a single logical plugin named **`loom-nucleus`** whose component
root holds `skills/` and `hooks/`, fronted by both
wrapper manifests:

```
loom-nucleus/
├── .codex-plugin/plugin.json      # Codex identity: name, version, skills, hooks, interface
├── .claude-plugin/plugin.json     # Claude identity: name, version, skills, agents, hooks
├── skills/
│   ├── omp-handoff/SKILL.md          # OMP command-derived skill candidate
│   ├── blueprint/                    # canonical shared-agent package
│   │   ├── AGENTS.md
│   │   ├── SKILL.md
│   │   ├── references/
│   │   └── exemplars/
│   └── lab/                          # (+ remaining shared-agent packages)
└── hooks/
    └── hooks.json                 # Stop verifier (both harnesses)
```

This keeps one component tree as the single source. Whether co-located dual
manifests load cleanly is the open question in §1.4; if it does not, the renderer
emits two per-harness plugin folders from the same templates (content stays
DRY because the renderer owns the copy). The catalog side stays simple: a Claude
`.claude-plugin/marketplace.json` (also read by Codex) plus a Codex-native
`~/.agents/plugins/marketplace.json`, each listing the `loom-nucleus` entry with
a `local` `source.path` (Codex entry adds `policy` + `category`; Claude entry adds
`description`).

### 2.2 What deliberately does **not** become a plugin entry

- **Provider/model/role config** — forbidden in any rendered manifest by the gate
  (§3); it is operator state, not portable plugin content.
- **Codex custom agents** — TOML config, not a Codex plugin component; the plugin
  only advertises them.
- **Local-only runtime** — `~/.codex/plugins/cache/`, `~/.claude/plugins/cache|data/`,
  sessions, auth, local settings: reported and skipped, never write targets.

### 2.3 Open questions for §2

- **[Open]** Should the Codex adapted agents also be re-expressed as Codex
  *skills* inside the plugin (so a Codex user gets them without separately
  installing `.codex/agents/*.toml`), or stay config-only? Affects whether the
  plugin's `skills/` set differs per harness.
- **[Resolved by LOO-101]** Keep one `loom-nucleus` plugin. Shared agents render as canonical skill packages, so Codex and Claude consume the same component tree without a separate Claude `agents/` bundle.

---

## 3. Install / verify loop reusing `render-harness-nucleus.mjs`

The bridge does **not** introduce a second writer. It reuses the existing
render → gate → apply executor and its strict-manual policy verbatim; the only
new work is teaching it about plugin/marketplace candidates and JSON-manifest
gating.

### 3.1 The loop

1. **Render** — tracked plugin-bridge source/templates are rendered into an
   ephemeral temp dir only (`renderToTemp` → `mkdtempSync`), exactly as today.
   Nothing is written to a live path during render.
2. **Gate** — `renderAndGate` runs `preflightFindings` (no path traversal, no
   absolute destinations, destinations must be `~/...` or project-relative) then
   `gateRenderedOutput` over the rendered bytes:
   - `secretError` — reject token/key/secret-looking values.
   - `containsPrivateHomePath` — reject absolute private home-path leakage (the gate's `PRIVATE_HOME_PATH_PATTERN`, i.e. an absolute path under the user home directory).
   - `dangerousPathReason` via `DANGEROUS_PATH_RULES` — already rejects
     `plugins/cache`, `auth.json`, sessions/history, blobs, `settings.local.json`,
     `*.db`/`*.sqlite`, logs. So any candidate aimed at `~/.codex/plugins/cache/`
     or `~/.claude/plugins/cache|data/` is rejected automatically.
   - `pathMatchesLocalOnly` — reject any destination matching a `local-only`
     pattern from the resource manifest.
   - forbidden-key scan — `FORBIDDEN_GLOBAL_KEYS` (`model`, `model_provider*`,
     `*_base_url`, `profile(s)`, `auth`, `notify*`, `otel`, `telemetry`, …) plus
     each boundary's own `forbiddenKeys`.
3. **Apply** (`--write`, HITL) — `runWrite` refuses unless the dry-run render +
   gate pass clean, then applies **create-missing-only**: it never overwrites an
   existing non-marker live file (skips with `exists:`), backs up a kit-owned
   marker before updating it (`*.loom-bak-<timestamp>`), and records each write in
   `~/.loom-harness/applied-manifest.json`, so a second run is a clean no-op.
4. **Verify** — see §3.3.

Disposition gating is unchanged: `resolveDisposition` consults
`docs/harness/resource-manifest.json`; only `track`/`adapt` surfaces become
`appliable` candidates, while `reference-only`/`local-only` surfaces are reported
and skipped.

### 3.2 LOO-102 activation deltas

LOO-102 turns the follow-on design into the scratch-HOME activation path:

- `scripts/render-plugin-bridge.mjs` is the plugin-bridge candidate source. It imports the shared render/gate/apply primitives from `scripts/render-harness-nucleus.mjs`, so JSON/TOML/YAML/Markdown gating, marker ownership, backup-on-drift, and create-missing-only semantics stay on one bus.
- Plugin-owned templates under `adapters/plugin-bridge/` render the dual `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` wrappers, both marketplace manifests, the 6 OMP skill candidates, and `hooks/hooks.json` plus `verify-loom-install.mjs`.
- Shared-agent packages are authored under `.agents/skills/{agent-name}/` and derived directly into transient `distributions/loom-nucleus/skills/{agent-name}/` render candidates. The committed bridge tree no longer carries byte-copy package output.
- `docs/harness/resource-manifest.json` marks the personal plugin marketplace/source root as `adapt`, while Codex/Claude plugin caches, auth, sessions, histories, DBs, local settings, and runtime state remain `local-only`.
- The writer allowlist is deliberately narrow: only `~/.agents/plugins/marketplace.json` and `~/.agents/plugins/loom-nucleus/**` can be appliable. Track/adapt candidates outside that root refuse the whole write, and symlink-escape checks realpath existing ancestors before any file is created.
- JSON manifests are parsed and forbidden-key scanned by the shared gate. Markdown YAML frontmatter is scanned; frontmatter-less Markdown stays content-only package guidance.
- Native OMP/Codex/Claude role-agent files stay out of scope. The activated shared roster is the Vercel-shaped package tree consumed as plugin skills by Codex and Claude and kept source-compatible with the OMP workflow-kit package shape.

### 3.3 Verification step

LOO-102 verification is scratch-HOME-only:

1. **Second write readback** — re-run `scripts/render-plugin-bridge.mjs --home <scratch> --write --json`; every appliable candidate must report `already-applied`, `created` must be empty, and `markerChanged` must be `false`.
2. **Shipped verifier readback** — run `adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs` from the scratch install root. It reads only the scratch plugin source and scratch `.loom-harness/applied-manifest.json`, exits 0 on a healthy install, and exits non-zero with structured JSON for missing components or marker hash drift.

Live harness readback is deferred until the live-HOME promotion gate has passed (`dry-run -> review -> explicit apply`). That future proof may check Codex plugin marketplace/cache metadata or Claude plugin validation after explicit approval; it is not part of LOO-102 and must not read operator runtime state during scratch activation.

### 3.4 Resolved source/version decisions

- **[Resolved by LOO-102]** Loom writes both `~/.agents/plugins/marketplace.json` and the co-located `~/.agents/plugins/loom-nucleus/**` plugin source during approved scratch apply. The plugin source path stays inside the marketplace root.
- **[Resolved by LOO-102]** `plugin.json` pins explicit version `0.1.0`.
- **[Verified live — LOO-15, codex-cli 0.142.0]** Codex auto-discovers `~/.agents/plugins/marketplace.json` (no `codex plugin marketplace add` needed) and reports the marketplace root as `$HOME`, resolving `source.path` relative to that root. The plugin source is therefore referenced as `./.agents/plugins/loom-nucleus` (not `./loom-nucleus`). Install with `codex plugin add <plugin>@<marketplace>` (the verb is `add`, not `install`); credential-less local plugin policy fields parsed and installed cleanly in that proof.

- **[Resolved by LOO-105]** Shared-agent package authorship is `.agents/skills/{agent-name}/`; shared-agent package candidates are derived from `.agents/skills/{agent-name}/` at render/validation time; the former checked-in byte-copy distribution tree is deleted.
---

## 4. Stop-hook verified loop (botched-install detection)

A botched or partial install must be detected and reported, not silently
tolerated. Both harnesses expose a `Stop` lifecycle hook, which is the natural
cross-harness primitive:

- **Codex** — `Stop` runs at turn scope; the docs literally list "run a custom
  validation check when a conversation turn stops, enforcing standards" as a hook
  use case. Only `type:"command"` handlers run today (`prompt`/`agent` are parsed
  but skipped; `async` is skipped).
- **Claude** — `Stop` fires "when Claude finishes responding" (once per turn;
  `StopFailure` covers API-error turn ends). Command handlers receive event JSON
  on stdin and return decisions via exit code / stdout.

### 4.1 Design

Ship a `Stop` handler inside `loom-nucleus/hooks/hooks.json`, identical schema for
both harnesses:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/verify-loom-install.mjs\"",
            "timeout": 30,
            "statusMessage": "Verifying Loom nucleus install"
          }
        ]
      }
    ]
  }
}
```

- `${CLAUDE_PLUGIN_ROOT}` is set by **both** harnesses (Codex also sets
  `PLUGIN_ROOT`; using the `CLAUDE_*` form keeps one command string portable).
- The verifier is **read-only**: it asserts install integrity and *reports* through
  process exit status plus stdout/stderr only. It never writes plugin data, local
  runtime state, repo config, or HOME config.

What the verifier checks (all derivable from already-tracked data):

1. The rendered marketplace.json + plugin.json parse and the entry for
   `loom-nucleus` is present and well-formed.
2. The expected skills/agents are loaded — cross-check the loaded component names
   against the expected sets in `distributions/snapshots/omp-builtins/source.json` (8 agents)
   and `portability-matrix.json` (6 skills), so a dropped/duplicated/renamed
   component is caught.
3. The `~/.loom-harness/applied-manifest.json` marker hashes match the live files
   the renderer claims to own (no drift, no partial write).
4. No forbidden key / secret / private-home path slipped into an installed
   manifest (re-applies the §3 gate rules to the *installed* copy).

On any failure it exits non-zero with a structured reason; on success it stays
silent (exit 0). This makes the Stop hook the standing, per-turn detector that
the install is still healthy — complementing the one-time post-apply verification
in §3.3.

### 4.2 Constraints to honor (grounded)

- **Trust gate.** Non-managed plugin hooks are *not* trusted on install in either
  harness; Codex skips them until reviewed (`/hooks`, trust recorded by hash) and
  Claude applies the same plugin-hook trust model. So the Stop verifier is dormant
  until a human trusts it. For AFK installs this means the verified-loop is not
  self-arming — see open questions.
- **Codex handler type.** Must be `type:"command"` (prompt/agent handlers are
  skipped). The design uses a command handler only.
- **Timeout.** Set explicitly (`30`s here); Codex defaults to `600`s if omitted.

### 4.3 Open questions for §4

- **[Open]** AFK arming: because plugin Stop hooks require manual trust, a fully
  unattended install cannot auto-enable its own verifier. Options: (a) document a
  one-time `/hooks` trust step; (b) for managed/enterprise contexts, deliver the
  verifier as a *managed* hook (Codex `requirements.toml [hooks]`,
  `allow_managed_hooks_only`) which is trusted by policy. Decide per deployment.
- **[Open]** Should a Codex `Stop` verifier *block* turn completion on failure, or
  only report? (Codex `Stop` can "enforce standards"; exact block semantics/return
  shape for `Stop` were not fully enumerated in the docs read.) Default: report
  non-zero, do not block, to stay within the non-goal.
- **[Open]** Claude `StopFailure` (API-error turn end) ignores output/exit code,
  so the verifier cannot rely on it; verification is `Stop`-only.

---

## Non-goals (restated)

- **No live writes outside the strict-manual gate.** Every write goes through the
  shared render/gate/apply path (`scripts/render-plugin-bridge.mjs --write`, which
  reuses `render-harness-nucleus.mjs` primitives): create-missing-only, gated,
  marker-tracked, backup-on-drift. The Stop verifier is read-only/report-only.
- No plugin publishing to the official Codex Plugin Directory or Claude community
  marketplace; no enabling/disabling of third-party plugins; no edits to live
  `~/.codex`, `~/.claude`, `~/.agents`, or repo config in this slice.
- No deduplication of skill roots, no provider/model/auth/profile config changes,
  no copying of plugin caches or runtime state.

## Consolidated decisions and remaining open questions

Resolved by LOO-102:

1. Co-located dual `.codex-plugin/` + `.claude-plugin/` manifests over one component root are the selected scratch-HOME activation shape.
2. Shared agents are expressed as plugin skills under `skills/{agent-name}/`; direct Codex/Claude role-agent ports remain superseded.
3. One `loom-nucleus` plugin is the selected unit; split skill/agent plugins are not used for this activation.
4. The scratch writer creates both the personal marketplace catalog and the co-located plugin source under `~/.agents/plugins/`.
5. `plugin.json` pins explicit version `0.1.0`.

Still deferred:

1. Codex `interface.capabilities` enum values remain example-grounded only. (§1.4)
2. Claude marketplace `$schema` is not a live document; no remote validation depends on it. (§1.4)
3. AFK arming of the Stop verifier still requires a manual `/hooks` trust step or a future managed-hook deployment path. (§4.3)
4. Codex `Stop` block-vs-report semantics stay report-only until a future issue verifies blocking behavior. (§4.3)

## LOO-102 activation record

LOO-102's scratch-HOME activation proof is:

1. **Scratch apply only.** `node scripts/render-plugin-bridge.mjs --home <scratch> --write --json` creates only the approved personal marketplace catalog and co-located `loom-nucleus` plugin source under `~/.agents/plugins/`, then records each owned file in `~/.loom-harness/applied-manifest.json`.
2. **Idempotency.** A second write against the same scratch HOME creates nothing, reports every appliable candidate as `already-applied`, and leaves `markerChanged: false`.
3. **Verifier.** `adapters/plugin-bridge/loom-nucleus/hooks/verify-loom-install.mjs` is read-only and exits non-zero with structured JSON when a package component is missing or a marker hash drifts.
4. **Harness surfaces.** The shared roster packages are proved once at the OMP-compatible source package surface (`.agents/skills/{agent-name}/`) and through both plugin consumers: Codex `.codex-plugin/plugin.json#skills` and Claude `.claude-plugin/plugin.json#skills`.
5. **Promotion gate.** Live-HOME promotion remains **dry-run -> review -> explicit apply**. The dry-run manifest, deterministic package checks, eval checks, and scratch apply/verifier proof must pass before a human approves any non-scratch HOME target.
6. **Governance.** Evidence/decision-log ownership stays with the LOO-103 collector -> judge -> human review loop. Deterministic checks required before apply are `scripts/validate-shared-agent-packages.mjs`, `scripts/validate-shared-agent-evals.mjs`, `scripts/render-plugin-bridge.mjs --json`, and the targeted scratch apply/verifier proof.
7. **Local-only boundary.** Existing OMP/Codex/Claude auth, sessions, histories, caches, DBs, browser state, local settings, plugin caches, and runtime files are neither read nor copied; they remain represented only by resource-manifest path patterns.
