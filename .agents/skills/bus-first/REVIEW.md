# Tighten mode: a minimal-diff pass over a change

Use this when asked to shrink, tighten, or de-over-engineer an existing diff or PR
(your own or someone else's).

## Steps

1. **Read for understanding first.** Trace what the change actually does and why,
   before judging its size. Do not propose cuts to code you have not understood.
2. **Walk the ladder over the diff.** For each added construct (file, function,
   class, dependency, abstraction, option), find the lowest rung that would have
   stopped it from being written:
   - rung 1 -> the construct isn't needed; remove it.
   - rung 2 -> it duplicates something on the bus; replace with the existing one.
   - rungs 3-5 -> it reinvents stdlib / platform / an installed dependency.
   - rung 6 -> it could be one line.
   - rung 7 -> it's justified but oversized (speculative params, hooks).
3. **Protect the guards.** Never propose removing trust-boundary validation,
   data-loss/failure handling, security, or accessibility. If the diff is small
   *because* it dropped one of these, that is a finding to ADD it back, not praise.
4. **Report.** One line per finding.

## Output format

```
KEEP   <what and why it earns its place>
CUT    <construct>  -> rung N: <the cheaper path>
GUARD  <missing validation/security/a11y/error-handling to restore>
```

End with the net effect (roughly what shrinks) and an explicit confirmation that
no guard was weakened.
