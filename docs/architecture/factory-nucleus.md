# Factory Nucleus architecture

Factory Nucleus is the tracker-neutral planning and delivery contract behind the
Factorio workflow kit.

## Contract

- A planned unit of work is a **ghost**.
- A repo-local/local-state **envelope** records workflow policy.
- A **tracker adapter** maps provider-native objects onto the same ghost shape.
- A **recipe** plans ordered stages and gates as inert data.
- **Radar** is check-only and never rewrites tracker, blueprint, or repo state.

## Tracker selection

Factory Nucleus has no default tracker. New envelopes start with:

```yaml
tracker:
  provider: none
```

Use the picker to present available providers:

```sh
npm run choose-tracker -- --root <repo>
```

Then bind exactly one provider for that repo:

```sh
npm run factory -- bind-tracker --root <repo> --provider linear --team <team> --project <project>
npm run factory -- bind-tracker --root <repo> --provider github --repo <owner/name>
```

Linear and GitHub Issues are peer adapters. Linear can be the operator's personal
choice, but Loom must not silently infer it or GitHub for a project.

## Commands

| Command | Purpose |
| --- | --- |
| `scan` | Zero-footprint repo scan. |
| `init-envelope` | Create local envelope state with no tracker selected. |
| `choose-tracker` | Print the tracker picker prompt/options. |
| `bind-tracker` | Bind the user's selected tracker. |
| `plan` | Produce an inert recipe plan from a tracker fixture. |
| `radar` | Check drift and recommend a route without writes. |

## Validation

Default validation is offline and fixture-backed:

```sh
npm run check
```

Live tracker smoke is opt-in and sandbox-only:

```sh
npm run smoke:live
```
