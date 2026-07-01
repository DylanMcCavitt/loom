# The Ladder, rung by rung

Each rung with why it holds and a worked before/after. Stop at the first rung that
applies; only fall through when it genuinely does not.

## 1. Does this need to exist at all?

The cheapest line is the one never laid. Question the requirement before building
to it. Overproduction is not free — unused capacity is surface area that rots.

- Before: a `formatName(first, last, opts)` helper with title-case, locale, and
  middle-name options, used in exactly one place that passes `first + " " + last`.
- After: `` `${first} ${last}` `` at the call site. Delete the helper.

## 2. Is it already on the bus?

If the codebase already produces this material, tap that line. A second
implementation is a second thing to keep in sync and a second place for bugs.

- Before: a new `debounce` in `utils/timing.ts`.
- After: import the `debounce` the project already ships in `lib/fn.ts`.

## 3. Does the standard library smelt it?

- Before: `groupBy` reduce-with-accumulator written by hand.
- After: `Object.groupBy` / `Map.groupBy` (or the stdlib equivalent in the language).

## 4. Native platform feature?

- Before: install a date-picker dependency, wrap it, add a stylesheet.
- After: `<input type="date">`. The platform already has one.

## 5. An already-installed dependency?

Adding a dependency is a permanent tax: supply chain, version drift, bundle size.
If something already in `package.json`/`go.mod`/`Cargo.toml` does it, use that.

- Before: add `uuid`.
- After: `crypto.randomUUID()` (native) or the id helper a present dependency exposes.

## 6. One line?

If the honest implementation is one line, it is one line. No wrapper, no class,
no config object "for flexibility" nobody asked for.

## 7. The minimum that works

Only here do you build. Build exactly the task, at the highest existing seam, with
no speculative parameters, hooks, or extension points. You can always add the
second case when the second case actually arrives.

## The discipline

The ladder runs *after* you understand the problem and have read the code the
change touches and traced the real flow. Lazy about the solution, never about
reading. A small diff that misreads the system is worse than a large one that
understands it.
