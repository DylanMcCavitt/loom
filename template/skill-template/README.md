# Skill template

Copy this directory when authoring a new skill package. It mirrors the Vercel-shaped layout used by `nucleus/skills/*` roster agents.

```sh
cp -R template/skill-template nucleus/skills/<your-skill>
# or for a kit utility:
cp -R template/skill-template nucleus/utilities/<your-skill>
```

Then:

1. Replace `<skill-name>` placeholders in `SKILL.md` frontmatter and body.
2. Write a trigger-rich `description` with a concrete `Use when` or `Use for` clause.
3. Add lens or deep guidance under `references/`.
4. Add `evals/evals.json` before merging kit-facing skills.
5. Run `npm run render` then `npm run check`.

This template is **not** scanned by `validate-skills.mjs` (only `nucleus/skills/`, `nucleus/utilities/`, and `.agents/skills/` are gated).
