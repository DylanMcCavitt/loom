<!-- Claude harness instruction bridge template. Dry-run only. -->
<!-- Candidate destination after approval: ./CLAUDE.md or ./.claude/CLAUDE.md -->
<!-- Claude Code reads CLAUDE.md, not AGENTS.md. Bridge to the shared repo workflow -->
<!-- instead of duplicating it, so OMP, Codex, and Claude read one source of truth. -->
<!-- A symlink (ln -s AGENTS.md CLAUDE.md) is an alternative when no Claude-specific -->
<!-- content is needed. Do not paste secrets, machine paths, or runtime state here. -->

@AGENTS.md

## Claude Code

Claude-specific notes belong below the import. Keep this file a thin bridge: shared
workflow policy stays in AGENTS.md and the OMP workflow-kit, not duplicated here.
