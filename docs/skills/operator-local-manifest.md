# Operator-local utility skills manifest

LOO-152 slimmed the repo-owned skill set to **11 skills** under the flat canonical
`skills/` tree. The seventeen cited-engine utilities below moved out of tracked
Loom source to the operator-local skills root at `~/.agents/skills/`.

Repo-side migration only: this manifest records ownership and live paths. It does
**not** copy skill content into the repo and does **not** write live `~/.agents`.

## Repo-owned surfaces (11)

| root | dirs |
|---|---|
| `skills/` | `assembler`, `belt`, `biters`, `blueprint`, `lab`, `map-seed`, `prospect`, `repair-pack`, `roboports`, `rocket-launch`, `space-age` |

## Operator-local utilities (17)

These skills are **cited** by roster agents and kit docs but are **not** repo-owned.
Install and maintain them under `~/.agents/skills/<name>/` on the operator machine.

| name | operator-local path |
|---|---|
| `chrome-devtools` | `~/.agents/skills/chrome-devtools/` |
| `chronicle` | `~/.agents/skills/chronicle/` |
| `computer-use` | `~/.agents/skills/computer-use/` |
| `debug-tools` | `~/.agents/skills/debug-tools/` |
| `deliverable-report` | `~/.agents/skills/deliverable-report/` |
| `execute-plan` | `~/.agents/skills/execute-plan/` |
| `find-skills` | `~/.agents/skills/find-skills/` |
| `grill-with-docs` | `~/.agents/skills/grill-with-docs/` |
| `openai-docs` | `~/.agents/skills/openai-docs/` |
| `repo-triage` | `~/.agents/skills/repo-triage/` |
| `security-best-practices` | `~/.agents/skills/security-best-practices/` |
| `security-ownership-map` | `~/.agents/skills/security-ownership-map/` |
| `security-threat-model` | `~/.agents/skills/security-threat-model/` |
| `skill-maintenance` | `~/.agents/skills/skill-maintenance/` |
| `swiftui-pro` | `~/.agents/skills/swiftui-pro/` |
| `tdd` | `~/.agents/skills/tdd/` |
| `write-a-skill` | `~/.agents/skills/write-a-skill/` |

Historical consolidation context lives in [`canonical-manifest.md`](../archive/canonical-manifest.md).
Roster routing and engine citations live in [`factorio-kit.md`](factorio-kit.md).
