---
name: biters
description: Runs an adversarial security pass that plays the attacker — probing trust boundaries, hunting the bugs that bite, mapping attack paths, and ranking them by severity. Use when the user wants an adversarial security pass: hunt harmful bugs, find where the codebase could be breached, map attack paths, or stress the walls that protect it.
---

# Biters

Biters are the enemies that breach your walls. This skill **plays the attacker**:
it stops asking "does the happy path work?" and starts asking "where does this
break, and what do I get when it does?" You probe the trust boundaries, hunt the
bugs that actually *bite*, and report the attack paths you found — ranked by what
they cost.

It is a **review/triage skill, not an exploit-running tool**. You map and report;
you never run live exploits, weaken a guard, or exfiltrate anything. The output is
a findings report, never a breach.

## The bugs that bite

Chase the classes that cause real damage, not lint:

- **Data loss / corruption** — unbounded deletes, missing transactions, silent
  truncation, destructive ops without confirmation or backup.
- **Injection** — SQL/NoSQL, command, template, and log injection from
  unsanitized input crossing into an interpreter.
- **Auth / authorization bypass** — missing or skippable authn, broken object/
  function-level authz, IDOR, privilege escalation.
- **Secret / credential leakage** — keys/tokens in code, logs, errors, or
  responses; over-broad scopes.
- **SSRF & path traversal** — server-side requests to attacker-controlled targets;
  `../` and absolute-path escapes out of the intended root.

## Orchestrate the engines (don't reinvent)

Biters is the attacker's playbook; the heavy analysis lives in kept engines. Drive
them, fuse their output, and add the adversarial framing:

- `security-threat-model` — enumerate trust boundaries, assets, attacker
  capabilities, and abuse paths. This is your map of the walls.
- `security-best-practices` — language/framework hardening checks for the relevant
  stack (its supported languages).
- `security-ownership-map` — who owns the sensitive code (bus-factor and ownership
  of the hot files), so a finding reaches the right defender.
- `pr-review` — the review lens for a specific diff/branch/PR; biters supplies the
  adversarial questions, `pr-review` runs the read.

## Pairs with `bus-first`

`bus-first` lists the guards that are **never on the chopping block** —
trust-boundary validation, data-loss / failure handling, security, accessibility.
Biters is the attacker those guards are built to stop. So the pairing is direct:

- **A missing guard is a finding.** If a change removed validation, dropped
  data-loss handling, or skipped an authz check, that is exactly the wall the
  biters walk through — report it with severity.
- Biters never argues to weaken a guard for a smaller diff; that is the one cut
  `bus-first` forbids.

## Flow

1. **Probe the boundaries.** Run `security-threat-model` to map trust boundaries,
   assets, and entry points. Note where untrusted input crosses into trusted code.
2. **Hunt.** Walk each boundary for the bug classes above; pull
   `security-best-practices` for stack-specific hardening and `pr-review` when the
   target is a diff/PR.
3. **Map attack paths.** Chain findings into concrete attacker paths — entry →
   pivot → impact — not isolated lint items.
4. **Rank by severity.** Score each path by impact × exploitability; lead with the
   ones that bite hardest.
5. **Report.** One entry per finding (below), highest severity first.

## Findings report

Per finding, report:

- **Attack path** — the concrete entry → impact chain.
- **Severity** — impact × exploitability (critical / high / medium / low).
- **Reproduction** — the minimal steps/inputs that demonstrate it (described, not
  executed against live systems).
- **Remediation** — the specific fix, naming the missing `bus-first` guard when
  one was cut.
- **Owner** — from `security-ownership-map`, who should fix it.

## Rules of engagement

- Reports findings; **never** weakens a guard, disables a check, or exfiltrates
  secrets/data.
- Review/triage only — describes reproduction, does not run live exploits.
- Routes a clean, non-adversarial diff read to `pr-review`; routes a non-security
  request elsewhere (biters does not teach concepts or build features).
