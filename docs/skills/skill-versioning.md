# Skill versioning

Every `SKILL.md` under `skills/` carries version metadata in its YAML frontmatter, enforced by `scripts/validate-skills.mjs`:

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

## Bump policy

Treat `metadata.version` as the skill behavior version: bump it for any behavioral skill change, update the colocated `metadata.changelog` line in `SKILL.md` at the same time, and expect evals to compare current routing or instructions against prior versions to catch regressions.
