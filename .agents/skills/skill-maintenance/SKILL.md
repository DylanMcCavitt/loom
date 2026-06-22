---
name: skill-maintenance
description: Audit, validate, archive, restore, or clean up local skills safely. Use when the user asks to clean unused skills, reduce skill clutter, inspect active skill inventory, validate skill folders, compare active vs archived skills, create a reversible archive, or improve skill-trigger hygiene.
---

# Skill Maintenance

Use this skill to keep the local skills directory useful and low-noise.

## Flow

1. Inventory active local skills:
   - list `<skills-dir>/*/SKILL.md` (e.g. `~/.agents/skills` or the active skills root)
   - extract `name` and `description`
   - note skills without `SKILL.md`
   - count active and archived skills
2. Check usage/context signals:
   - search memory and session summaries when available
   - inspect modification dates
   - identify duplicates with built-in plugins or newer skills
3. Classify skills:
   - `keep`: actively useful or broad utility
   - `archive`: redundant, noisy, old project-specific, or unused
   - `review`: uncertain; ask before moving
4. Prefer reversible cleanup:
   - move archive candidates to a `skills-archive/<date>-<slug>/` directory
   - do not delete
   - write or update a restore command/script when useful
5. Validate remaining skills when the validator is available.

## Archive Heuristics

Archive candidates include:

- old project-specific helpers no longer in active work
- visual style packs that overlap with current frontend/design instructions
- skills that force verbose/full-output behavior
- local browser/runtime helpers now replaced by official Browser/Chrome tools
- broken/incomplete folders without a valid `SKILL.md`

Keep candidates include:

- repo workflow skills
- screen/history context utilities
- docs/PDF/notebook utilities
- security skills that only trigger explicitly
- current project-specific skills
- issue-chain and handoff automation

## Rules

- Never delete skill folders unless explicitly asked.
- Never archive a skill just because it has zero memory hits if it is clearly useful and low-noise.
- Report exactly what moved, where it moved, and how to restore it.
- If uncertain, leave the skill active and mark it `review`.
