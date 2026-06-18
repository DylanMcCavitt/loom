# Spike: floating side-panel placement via direct `tui.showOverlay` (issue #29)

**Verdict: FEASIBLE, but lower-level than the documented extension contract.**
A positioned floating panel can be rendered from an extension by driving the real
`tui.showOverlay` obtained from the `ctx.ui.custom` factory. Focus capture/restore,
`Esc`/close lifecycle, render invalidation, and cleanup all work correctly. Because it
bypasses `ctx.ui.custom`'s managed overlay and leans on several internal TUI behaviors,
it ships **opt-in only** (`OMP_CTX_SIDE_PANEL=1`); the framed full-width panel that #27
shipped remains the authoritative default.

All line refs below are into the globally installed OMP 16.0.5 packages under
`@oh-my-pi/` (resolved at `~/.bun/install/global/node_modules/@oh-my-pi/`).

---

## 1. What the documented extension API gives you

`ctx.ui.custom` is wired straight to the controller's `showHookCustom`:

- `pi-coding-agent/src/modes/controllers/extension-ui-controller.ts:57`
  `custom: (factory, options) => this.showHookCustom(factory, options)`
- `showHookCustom` signature — `extension-ui-controller.ts:698-706`. The only options
  field is **`{ overlay?: boolean }`**. There is **no** `overlayOptions` and **no**
  `onHandle` — confirming the issue's premise: positioning is not exposed through the
  documented API.
- Overlay mount is **hardcoded** — `extension-ui-controller.ts:737-743`:
  ```ts
  overlayHandle = this.ctx.ui.showOverlay(component, {
    anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: 0,
  });
  ```
  So `overlay: true` always yields a bottom-center, full-width overlay regardless of
  what the extension wants.

### The escape hatch: the factory receives the real `TUI`

`extension-ui-controller.ts:731`:
```ts
Promise.try(() => factory(this.ctx.ui, theme, keybindings, close)).then(c => { ... });
```
`this.ctx.ui` **is** the live `TUI` singleton. The factory's first argument therefore
exposes the full lower-level surface — `showOverlay`, `setFocus`, `requestRender` —
which is the only way an extension can obtain a `tui` handle (the extension
`ExtensionUI` object itself exposes `custom`/`setStatus`/`setWidget`/editor helpers, not
`showOverlay`).

## 2. The positioning API on `TUI` (`pi-tui/src/tui.ts`)

- `OverlayOptions` — `tui.ts:436-481`: `width` (`number | "<n>%"`), `minWidth`,
  `maxHeight`, `anchor` (incl. `"right-center"`, `tui.ts:352-361`), `offsetX/Y`,
  `row`/`col` (absolute or `%`), `margin`, **`visible(termWidth, termHeight)`**
  (`:464-469`, re-evaluated every render), `fullscreen`.
- `OverlayHandle` — `tui.ts:486-493`: `hide()` (permanent removal), `setHidden()`,
  `isHidden()`. No `focus` method — focus is `TUI.setFocus(component)` (`:1337-1360`).
- `showOverlay` — `tui.ts:1371-1421`: pushes `{component, options, preFocus, hidden}`
  onto `overlayStack`, records `preFocus = #focusedComponent`, and focuses the component
  iff it is currently visible (`:1376-1378`). `hide()` removes the entry and restores
  focus to the next visible overlay or `preFocus` (`:1385-1399`).
- Layout resolution — `tui.ts:2163-2259`: anchors, percentage width/col, `minWidth`
  floor, margin clamping. `right-center` puts the panel flush to the right edge,
  vertically centered (`:2271-2287`).
- Visibility — `#isOverlayVisible` (`tui.ts:1443-1449`) calls `options.visible(columns,
  rows)` each frame; compositing skips hidden/invisible entries
  (`#compositeOverlaysIntoWindow`, `:2302-2324`).

## 3. Lifecycle analysis (the part the spike had to prove)

### Focus capture / restore — **works**
- `showOverlay` captures `preFocus` and focuses the visible slot (`:1373-1378`).
- `TUI.setFocus` has a guard (`tui.ts:1338-1344`): any focus attempt is redirected to
  the topmost *visible* overlay. This is what keeps focus pinned to our panel even
  though the framework calls `setFocus(editor)` afterward (see §4).
- On `hide()`, focus restores to the next visible overlay or, when none remain, the
  captured `preFocus` (the editor). So teardown returns focus to the editor with no
  extra bookkeeping (`:1385-1399`, `hideOverlay` `:1424-1434`).

### `Esc`/close vs `ctx.ui.custom`'s `done` — **works, decoupled**
- `done` (= `close`, `extension-ui-controller.ts:715-729`) is a one-shot: it guards
  re-entry with `closed`, calls `component.dispose?.()`, `overlayHandle?.hide()`,
  `setFocus(editor)`, and resolves the custom promise.
- The shipped design calls `done("opened")` **synchronously inside the factory** to
  resolve the custom promise immediately and *skip the framework's bottom-full mount*:
  once `closed` is set, the post-factory `.then` only runs `c.dispose?.()` and returns
  without mounting (`extension-ui-controller.ts:731-735`). We return an **inert
  placeholder** as `c` so that `dispose()` never touches the live panel.
- The real panel's own `Esc` path (`panel-shell.js` `PanelShell.handleInput` →
  `close()` → `done`) is rewired to our overlay teardown, which `hide()`s both slots.

### Render invalidation — **works**
- `showOverlay`/`setHidden`/`hide` each call `requestRender` (`tui.ts:1381,1398,1417`).
- The shell drives `tui.requestRender()` on scroll/refresh (`panel-shell.js`
  `#requestRender`), and the overlay compositor re-renders the visible slot every frame
  at that slot's resolved width — so the *same* shell component re-flows when the
  terminal crosses the breakpoint.

### Cleanup on replacement — **works**
- `closeActivePanel` (existing `panel-shell.js`) closes the prior panel before a new one
  mounts; for the positioned path the stored close handle removes **both** overlay slots
  (`mountSidePanelOverlay().close()` hides framed + floating), so no ghost overlay
  survives a `/ctx` re-invoke.

## 4. Why two complementary slots (the responsive design)

A single `visible`-gated positioned overlay cannot provide the "narrow → framed
full-width" fallback, because the framed full-width surface is a *different* overlay
geometry. The framework overlay options are hardcoded and have no `visible`, so they
cannot be width-gated either. The solution mounts the **same** shell component as two
slots with mutually exclusive predicates:

```js
tui.showOverlay(panel, { anchor:"bottom-center", width:"100%", maxHeight:"100%", margin:0, visible: w => w <  THRESHOLD }); // framed
tui.showOverlay(panel, { anchor:"right-center",  width:"42%",  minWidth:56, maxHeight:"100%", visible: w => w >= THRESHOLD }); // floating
```

Exactly one slot is visible at any width, so the component renders once and the engine
flips it live on resize. Focus follows the topmost visible slot via the `setFocus`
redirect guard; `hide()`-ing both restores the editor.

## 5. Risks (why this stays opt-in, not the default)

1. **Below the documented contract.** `tui.showOverlay`/`setFocus` are engine-level
   APIs, not part of the extension contract; OMP may change them across releases.
2. **Depends on `closed`-short-circuit skip-mount** (`extension-ui-controller.ts:731-735`).
   If OMP mounts before checking `closed`, the inert-placeholder trick would need
   revisiting (it would still not corrupt the panel, but the framework would briefly
   mount the placeholder).
3. **Depends on the `setFocus` topmost-overlay redirect** (`tui.ts:1338-1344`) to keep
   focus on the panel after the framework's post-factory `setFocus(editor)`.

These are stable, in-tree behaviors today, and the path degrades safely (to the framed
presenter) whenever `tui.showOverlay` is absent or primitives can't resolve — but they
are enough coupling that the framed panel must stay authoritative.

## 6. Recommendation

- **Ship the positioned panel gated, default-off** behind `OMP_CTX_SIDE_PANEL=1`
  (implemented on `/ctx`). Framed full-width is the default and is unchanged from #27.
- **Keep the framed presenter authoritative.** Do not flip the default until the
  upstream API lands (below) or the engine-level dependencies are proven stable across
  an OMP upgrade with a live wide/narrow smoke test.
- **Upstream ask (recommended):** OMP should let `ctx.ui.custom` forward an
  `overlayOptions` (and ideally `onHandle`) to its internal `showOverlay`
  (`extension-ui-controller.ts:737-743`). Vanilla Pi already exposes this; OMP hardcoding
  it is the only reason extensions must reach for the engine-level handle. With a
  pass-through, the entire skip-mount / inert-placeholder / two-slot dance disappears and
  the positioned panel becomes a first-class, contract-level feature.

## 7. What shipped for this spike

- `omp/.omp/agent/extensions/panel-shell.js`: `resolvePanelPlacement` (pure gate
  decision), `mountSidePanelOverlay` (two complementary slots + teardown), and
  `presentPositionedPanel` (opt-in presenter that reuses `createPanelShell`, degrades to
  `presentPanel` without a live TUI).
- `omp/.omp/agent/extensions/workflow-cockpit.js`: `/ctx` routes through
  `presentPositionedPanel` only when `OMP_CTX_SIDE_PANEL=1`; otherwise the #27 framed
  panel, untouched.
- `tests/side-panel-placement.test.mjs`: pure-seam coverage of the visible-threshold
  fallback selection (narrow → framed, wide → positioned) and focus/close behavior with
  a stubbed `tui`, plus the safe-degradation gate.
- **Human smoke-test item:** verify the live render at wide and narrow terminal widths
  with `OMP_CTX_SIDE_PANEL=1 omp` → `/ctx` (right-anchored panel when wide, framed
  full-width when narrow, `Esc` returns focus to the editor with no stale overlay).
