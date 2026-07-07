# Security Policy

## Reporting a vulnerability

Report security issues through [GitHub private security advisories](https://github.com/dylanmccavitt2015/loom-nucleus/security/advisories/new) for this repository. Do not open public issues for exploitable findings.

Include:

- a clear description of the issue and its impact
- steps to reproduce (commands, inputs, or validator paths)
- any proof-of-concept you are comfortable sharing

We will acknowledge receipt and coordinate disclosure on a reasonable timeline.

## Scope

This repository ships a **prompt pack** (skills and agent guidance) and **validation tooling** (validators, offline tests). There is no hosted runtime service, API, or production deployment in this repo.

In scope:

- tracked skill source under `nucleus/`
- CI validators and release workflows under `scripts/` and `.github/workflows/`
- accidental secret leakage in tracked source or validation tooling

Out of scope:

- vulnerabilities in third-party harnesses (OMP, Codex, Claude) themselves
- operator-local files under `~/.omp`, `~/.codex`, `~/.claude`, or `~/.agents`
- social-engineering attacks against individual operators

## Secrets and committed content

**No secrets should ever be committed.** API keys, tokens, credentials, private home paths, and live session state belong in operator-local storage only.

The skill validators (`scripts/validate-skills.mjs`) scan the tracked skill sources for secret-like content and forbidden runtime paths. `npm run check` runs these gates on every PR and release tag.

If you find a false negative (content that should be blocked but passes validation), please report it as a security advisory so the gate can be tightened.
