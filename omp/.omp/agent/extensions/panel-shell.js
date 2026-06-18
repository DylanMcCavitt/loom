// Shared native panel shell for OMP extension overlays.
//
// Wraps OMP 16.0.5's documented panel primitives — `framedBlock` /
// `renderOutputBlock` (themed bordered block) plus `ScrollView` (bounded
// scrollable body with its own offset/scrollbar/handleScrollKey) — into one
// small module so `/ctx`, `/diff`, and future panels stop hand-drawing borders
// with string concatenation. The frame looks like Pi's own tool-output blocks.
//
// Runtime constraint: the native primitives resolve only inside OMP's jiti
// runtime (their package `exports` map to `.ts` sources). Plain `node --test`
// cannot import them. Therefore this module NEVER statically imports
// `@oh-my-pi/*`. Primitives are either injected (`createPanelShell(deps, ...)`)
// for tests/consumers, or resolved lazily at runtime inside `presentPanel`.

const ACTIVE_PANELS = new WeakMap();

// Default footer hint shown when a consumer does not supply its own.
const DEFAULT_KEY_HINTS = "↑↓/jk scroll · PgUp/PgDn page · g/G top/end · Esc close";
// Fallback panel height used only when neither an explicit height nor a TTY row
// count is available (e.g. piped output, tests). Not a body-slicing constant:
// ScrollView owns the windowing; this only bounds the height budget.
const FALLBACK_ROWS = 24;

// Vim-style and byte aliases mapped onto the canonical CSI sequences that
// ScrollView.handleScrollKey understands. Mirrors the `isKey` byte sequences
// used by the existing extensions so every panel shares scroll semantics.
const SCROLL_ALIASES = {
  k: "\u001b[A", // up
  j: "\u001b[B", // down
  b: "\u001b[5~", // pageup
  " ": "\u001b[6~", // pagedown (space)
  g: "\u001b[H", // home
  G: "\u001b[F", // end
};

function toLines(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value.map((line) => String(line)) : [String(value)];
}

function isCloseKey(data) {
  return data === "\u001b" || data === "esc" || data === "\u001b[27u" || data === "\u0003";
}

function normalizeScrollKey(data) {
  return Object.prototype.hasOwnProperty.call(SCROLL_ALIASES, data) ? SCROLL_ALIASES[data] : data;
}

function styleWith(theme, token, text) {
  if (typeof theme?.fg === "function") {
    try {
      return theme.fg(token, text);
    } catch {
      return text;
    }
  }
  return text;
}

function safeNumber(fn, fallback = 0) {
  try {
    const value = fn();
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

// Pure, dependency-injected OMP Component. `deps` carries the native primitives
// (real ones at runtime, stubs in tests); `options` describes the content.
//
//   deps    = { framedBlock, renderOutputBlock, ScrollView, getSelectListTheme? }
//   options = { title, keyHints?, theme, tui, done, height?,
//               sections: Array<{ label?, lines: string[] }> | (innerWidth) => Array,
//               onInput?(data, controller): boolean }
//
// `sections` may be a static array or a width-aware builder rebuilt per render
// (and on `controller.refresh()`). `onInput` runs before the default scroll/close
// handling; a truthy return suppresses the default for that key, letting a
// consumer (e.g. /diff) own keys like [ ] { } n p. `controller` exposes
// { refresh, scrollTo, setSections, requestRender, close, scrollView, width }.
class PanelShell {
  constructor(deps, options = {}) {
    this.deps = deps || {};
    this.theme = options.theme;
    this.tui = options.tui;
    this.done = options.done;
    this.title = options.title ?? "";
    // Static array or width-aware `(innerWidth) => sections` builder.
    this.sectionsSource = options.sections;
    this.onInput = typeof options.onInput === "function" ? options.onInput : undefined;
    this.closed = false;

    this.selectList = this.#resolveSelectListTheme();
    this.hintLines = toLines(options.keyHints ?? DEFAULT_KEY_HINTS).map((line) => styleWith(this.theme, "dim", line));

    // Height budget is width-independent: ScrollView owns the windowing.
    const availableRows = Number.isFinite(options.height) ? Math.trunc(options.height) : process.stdout?.rows ?? FALLBACK_ROWS;
    const chrome = 1 /* top bar */ + (this.hintLines.length ? 1 /* divider */ + this.hintLines.length : 0) + 1 /* bottom bar */;
    this.maxBody = Math.max(1, availableRows - chrome);

    // Provisional inner width for the initial body; corrected on first render.
    this.lastInnerWidth = Math.max(1, (process.stdout?.columns ?? 80) - 2);
    this.sections = this.#resolveSections(this.lastInnerWidth);
    this.body = this.#buildBodyFrom(this.sections);
    this.bodyHeight = Math.min(this.body.length, this.maxBody);

    this.scrollView = new this.deps.ScrollView(this.body, {
      height: this.bodyHeight,
      scrollbar: "auto",
      theme: {
        track: (text) => styleWith(this.theme, "borderMuted", text),
        thumb: (text) => styleWith(this.theme, "accent", text),
      },
    });

    this.controller = this.#createController();

    this.frame =
      typeof this.deps.framedBlock === "function"
        ? this.deps.framedBlock(this.theme, (width) => this.#buildBlock(width))
        : {
            render: (width) => this.deps.renderOutputBlock(this.#buildBlock(width), this.theme),
            invalidate: () => {},
          };
  }

  #resolveSelectListTheme() {
    if (typeof this.deps.getSelectListTheme !== "function") return undefined;
    try {
      return this.deps.getSelectListTheme();
    } catch {
      return undefined;
    }
  }

  #accent(text) {
    if (typeof this.selectList?.selectedText === "function") {
      try {
        return this.selectList.selectedText(text);
      } catch {
        // fall through to theme token
      }
    }
    return styleWith(this.theme, "accent", text);
  }

  // Resolve the section source (static array or width-aware builder) to an array.
  #resolveSections(innerWidth) {
    const source = this.sectionsSource;
    const sections = typeof source === "function" ? source(innerWidth) : source;
    return Array.isArray(sections) ? sections : [];
  }

  // Flatten the logical sections into a single body buffer fed to ScrollView.
  // Section labels become themed accent rows; a blank row separates sections so
  // the windowed body stays readable without box-art dividers.
  #buildBodyFrom(sections) {
    const body = [];
    for (const section of sections) {
      if (!section) continue;
      const lines = toLines(section.lines);
      if (!section.label && !lines.length) continue;
      if (body.length) body.push("");
      if (section.label) body.push(this.#accent(String(section.label)));
      for (const line of lines) body.push(String(line));
    }
    return body;
  }

  // Re-resolve the section source at `innerWidth` and sync the ScrollView. Used
  // for width changes (render) and consumer-driven content changes (refresh).
  #rebuild(innerWidth) {
    this.lastInnerWidth = innerWidth;
    this.sections = this.#resolveSections(innerWidth);
    this.body = this.#buildBodyFrom(this.sections);
    this.bodyHeight = Math.min(this.body.length, this.maxBody);
    this.scrollView.setLines?.(this.body);
    this.scrollView.setHeight?.(this.bodyHeight);
  }

  // Rebuild only when a width-aware builder sees a new width; otherwise just
  // track the latest width. Static arrays never change with width.
  #syncBody(innerWidth) {
    if (typeof this.sectionsSource === "function" && innerWidth !== this.lastInnerWidth) {
      this.#rebuild(innerWidth);
      return;
    }
    this.lastInnerWidth = innerWidth;
  }

  // Controller handed to `onInput` so consumers can drive the shell.
  #createController() {
    const shell = this;
    return {
      refresh() {
        shell.#rebuild(shell.lastInnerWidth);
        shell.frame?.invalidate?.();
        shell.#requestRender();
      },
      scrollTo(line) {
        shell.scrollView.setScrollOffset?.(line);
        shell.frame?.invalidate?.();
        shell.#requestRender();
      },
      setSections(sectionsOrFn) {
        shell.sectionsSource = sectionsOrFn;
        shell.#rebuild(shell.lastInnerWidth);
        shell.frame?.invalidate?.();
        shell.#requestRender();
      },
      requestRender() {
        shell.#requestRender();
      },
      close(result = "closed") {
        shell.close(result);
      },
      get scrollView() {
        return shell.scrollView;
      },
      get width() {
        return shell.lastInnerWidth;
      },
    };
  }

  #buildBlock(width) {
    const inner = Math.max(1, Math.trunc(width) - 2);
    this.#syncBody(inner);
    const bodyLines = this.scrollView.render(inner);
    const offset = safeNumber(() => this.scrollView.getScrollOffset?.() ?? 0);
    const maxScroll = safeNumber(() => this.scrollView.getMaxScrollOffset?.() ?? 0);
    const total = this.body.length;
    const headerMeta =
      maxScroll > 0 ? `${Math.min(total, offset + 1)}-${Math.min(total, offset + this.bodyHeight)}/${total}` : undefined;
    const sections = [{ lines: bodyLines }];
    if (this.hintLines.length) sections.push({ separator: true, lines: this.hintLines });
    return { header: this.title, headerMeta, width, sections };
  }

  #requestRender() {
    try {
      this.tui?.requestRender?.();
    } catch {
      // best-effort; rendering will catch up on the next frame
    }
  }

  close(result = "closed") {
    if (this.closed) return;
    this.closed = true;
    this.invalidate();
    this.done?.(result);
  }

  handleInput(data) {
    if (this.closed) return;
    if (typeof this.onInput === "function") {
      let suppressed = false;
      try {
        suppressed = Boolean(this.onInput(data, this.controller));
      } catch {
        suppressed = false;
      }
      if (suppressed) return;
    }
    if (isCloseKey(data)) {
      this.close("closed");
      return;
    }
    let handled = false;
    try {
      handled = Boolean(this.scrollView.handleScrollKey?.(normalizeScrollKey(data)));
    } catch {
      handled = false;
    }
    if (handled) {
      this.frame?.invalidate?.();
      this.#requestRender();
    }
  }

  render(width) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 80));
    return this.frame?.render?.(safeWidth) ?? [];
  }

  invalidate() {
    this.frame?.invalidate?.();
  }

  dispose() {
    this.closed = true;
    this.invalidate();
  }
}

// Factory: build a panel-shell Component from injected native primitives.
function createPanelShell(deps, options = {}) {
  return new PanelShell(deps, options);
}

// Pure plain-text projection of a panel, used for the non-TUI fallback widget.
function panelFallbackLines({ title, sections = [] } = {}) {
  const resolved = typeof sections === "function" ? sections(Math.max(1, (process.stdout?.columns ?? 80) - 2)) : sections;
  const list = Array.isArray(resolved) ? resolved : [];
  const lines = [];
  if (title) lines.push(String(title));
  let renderedSections = 0;
  for (const section of list) {
    if (!section) continue;
    const sectionLines = toLines(section.lines);
    if (!section.label && !sectionLines.length) continue;
    if (renderedSections > 0) lines.push("");
    if (section.label) lines.push(String(section.label));
    for (const line of sectionLines) lines.push(String(line));
    renderedSections += 1;
  }
  return lines;
}

async function importFirst(...specifiers) {
  for (const specifier of specifiers) {
    try {
      return await import(specifier);
    } catch {
      // try the next candidate specifier
    }
  }
  return null;
}

// Module-level cache so the dynamic imports run at most once per process.
let cachedPrimitives;

// Lazily resolve native primitives. The dynamic imports live here — never at
// module top — so plain-node tests can import this file cleanly. Returns null
// when the primitives cannot be resolved (e.g. outside the jiti runtime).
async function resolvePanelPrimitives() {
  if (cachedPrimitives) return cachedPrimitives;
  try {
    const [tuiModule, piTuiModule] = await Promise.all([
      importFirst("@oh-my-pi/pi-coding-agent/tui", "@oh-my-pi/pi-coding-agent"),
      importFirst("@oh-my-pi/pi-tui", "@oh-my-pi/pi-tui/components/scroll-view"),
    ]);
    const framedBlock = tuiModule?.framedBlock;
    const renderOutputBlock = tuiModule?.renderOutputBlock;
    const ScrollView = piTuiModule?.ScrollView;
    if (typeof framedBlock !== "function" || typeof ScrollView !== "function") return null;
    let getSelectListTheme;
    const agentModule = await importFirst("@oh-my-pi/pi-coding-agent");
    if (typeof agentModule?.getSelectListTheme === "function") getSelectListTheme = agentModule.getSelectListTheme;
    cachedPrimitives = { framedBlock, renderOutputBlock, ScrollView, getSelectListTheme };
    return cachedPrimitives;
  } catch {
    return null;
  }
}

// Hide/replace the panel currently mounted on this ctx.ui (no stacking).
function closeActivePanel(ctx, result = "replaced") {
  const ui = ctx?.ui;
  if (!ui) return;
  const active = ACTIVE_PANELS.get(ui);
  if (!active) return;
  ACTIVE_PANELS.delete(ui);
  active.close?.(result);
}

// Single-call overlay presenter. Resolves native primitives lazily, mounts the
// panel via `ctx.ui.custom(..., { overlay: true })` when a TUI is available, and
// otherwise degrades to a `belowEditor` widget. Never throws when UI or
// primitives are unavailable.
async function presentPanel(ctx, { title, sections = [], keyHints, onInput } = {}) {
  closeActivePanel(ctx);
  const ui = ctx?.ui;
  if (!ui) return "none";

  const primitives = await resolvePanelPrimitives();
  if (ctx?.hasUI !== false && typeof ui.custom === "function" && primitives) {
    let component = null;
    try {
      const promise = ui.custom(
        (tui, theme, _keybindings, done) => {
          component = createPanelShell(primitives, { title, sections, keyHints, onInput, theme, tui, done });
          ACTIVE_PANELS.set(ui, component);
          return component;
        },
        { overlay: true },
      );
      Promise.resolve(promise)
        .then(() => {
          if (component && ACTIVE_PANELS.get(ui) === component) ACTIVE_PANELS.delete(ui);
        })
        .catch((error) => {
          if (component && ACTIVE_PANELS.get(ui) === component) ACTIVE_PANELS.delete(ui);
          ui.notify?.(`Panel failed: ${error.message}`, "error");
        });
      return "custom";
    } catch (error) {
      ui.notify?.(`Panel unavailable: ${error.message}`, "error");
    }
  }

  if (typeof ui.setWidget === "function") {
    await ui.setWidget(panelFallbackLines({ title, sections }), { placement: "belowEditor" });
    return "setWidget";
  }
  return "none";
}

// === Gated positioned side-panel (issue #29 spike) ===
//
// OMP 16.0.5's `ctx.ui.custom(factory, { overlay })` hardcodes a bottom-center,
// full-width overlay and ignores any positioning options (see
// `pi-coding-agent` `extension-ui-controller.ts#showHookCustom`). The factory
// DOES receive the real `tui: TUI` handle, whose `showOverlay(component,
// OverlayOptions)` (`pi-tui` `tui.ts`) supports anchored/percentage placement
// and a per-render `visible(termW, termH)` predicate. The presenter below
// obtains that handle through the factory and drives `showOverlay` directly,
// mounting the SAME shell component as two complementary slots — a framed
// full-width slot for narrow terminals and a right-anchored floating slot for
// wide ones — so exactly one is visible at any width and the panel flips live
// on resize. This is lower-level than the documented extension contract, so it
// stays OPT-IN: `presentPanel` (framed full-width) remains the authoritative
// default. See docs/spikes/floating-side-panel.md.

// Terminal width (columns) at/above which the floating side panel is used.
const SIDE_PANEL_BREAKPOINT = 100;
// Floating-slot width: percentage of terminal width, floored by `minWidth`.
const SIDE_PANEL_WIDTH = "42%";
const SIDE_PANEL_MIN_WIDTH = 56;

// Pure placement decision for the gated side panel. Returns "positioned" only
// when the path is enabled AND the terminal is at least `threshold` columns
// wide; otherwise "framed" (the authoritative default). Width falls back to the
// live terminal column count when not supplied.
function resolvePanelPlacement({ width, threshold = SIDE_PANEL_BREAKPOINT, enabled = false } = {}) {
  if (!enabled) return "framed";
  const cols = Number.isFinite(width) ? width : process.stdout?.columns ?? 0;
  return cols >= threshold ? "positioned" : "framed";
}

// Mount one shell `panel` as two complementary `tui.showOverlay` slots. The
// framed slot covers narrow terminals (`w < threshold`, bottom-center, full
// width — identical geometry to `presentPanel`); the floating slot covers wide
// terminals (`w >= threshold`, right-anchored, percentage width). Their
// `visible` predicates are mutually exclusive, so the shell renders into a
// single active slot and the engine flips it on resize. Returns a `close()`
// that removes BOTH slots (no ghost overlay) and runs `onClose`. Focus is
// captured by `showOverlay` (preFocus) and restored by `hide()`.
function mountSidePanelOverlay(tui, panel, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : SIDE_PANEL_BREAKPOINT;
  const width = options.width ?? SIDE_PANEL_WIDTH;
  const minWidth = Number.isFinite(options.minWidth) ? options.minWidth : SIDE_PANEL_MIN_WIDTH;
  const anchor = options.anchor ?? "right-center";

  const framedHandle = tui.showOverlay(panel, {
    anchor: "bottom-center",
    width: "100%",
    maxHeight: "100%",
    margin: 0,
    visible: (w) => w < threshold,
  });
  const floatingHandle = tui.showOverlay(panel, {
    anchor,
    width,
    minWidth,
    maxHeight: "100%",
    visible: (w) => w >= threshold,
  });
  // showOverlay already focuses the visible slot; this is a harmless belt for
  // TUIs whose showOverlay defers focus, and the seam tests assert it.
  tui.setFocus?.(panel);

  let closed = false;
  return {
    framedHandle,
    floatingHandle,
    close() {
      if (closed) return;
      closed = true;
      // Remove both slots so no ghost overlay survives; the hide() focus-restore
      // chain lands on the editor (each slot's preFocus) once both are gone.
      floatingHandle?.hide?.();
      framedHandle?.hide?.();
      try {
        options.onClose?.();
      } catch {
        // teardown is best-effort
      }
    },
  };
}

// Opt-in positioned presenter (issue #29). Obtains the real `tui` through
// `ctx.ui.custom`'s factory, self-manages a positioned overlay via
// `mountSidePanelOverlay`, and resolves the custom promise immediately so the
// framework never mounts its hardcoded bottom-full overlay. Degrades to the
// authoritative framed presenter when no UI / TUI / primitives are available,
// or when the running TUI lacks `showOverlay`.
async function presentPositionedPanel(ctx, { title, sections = [], keyHints, onInput, threshold } = {}) {
  closeActivePanel(ctx);
  const ui = ctx?.ui;
  if (!ui) return "none";

  const primitives = await resolvePanelPrimitives();
  if (ctx?.hasUI !== false && typeof ui.custom === "function" && primitives) {
    try {
      const promise = ui.custom(
        (tui, theme, _keybindings, done) => {
          // No positioning API on this TUI: behave exactly like presentPanel —
          // return the panel so the framework overlays it bottom-full (framed).
          if (typeof tui?.showOverlay !== "function") {
            const framed = createPanelShell(primitives, { title, sections, keyHints, onInput, theme, tui, done });
            ACTIVE_PANELS.set(ui, framed);
            return framed;
          }
          let overlay;
          const panel = createPanelShell(primitives, {
            title,
            sections,
            keyHints,
            onInput,
            theme,
            tui,
            done: () => overlay?.close?.(),
          });
          overlay = mountSidePanelOverlay(tui, panel, {
            threshold,
            onClose: () => {
              if (ACTIVE_PANELS.get(ui) === activeRef) ACTIVE_PANELS.delete(ui);
            },
          });
          const activeRef = { close: () => panel.close("closed") };
          ACTIVE_PANELS.set(ui, activeRef);
          // Resolve the custom promise now and skip the framework's hardcoded
          // bottom-full mount: with `closed` already set, the post-factory step
          // only calls dispose() on the returned component. Return an inert
          // placeholder so dispose() never touches the live `panel`.
          done("opened");
          return { render: () => [], dispose: () => {} };
        },
        { overlay: true },
      );
      Promise.resolve(promise).catch((error) => {
        ui.notify?.(`Side panel failed: ${error.message}`, "error");
      });
      return "custom-positioned";
    } catch (error) {
      ui.notify?.(`Side panel unavailable: ${error.message}`, "error");
    }
  }

  // No live TUI/primitives (piped output, tests): authoritative framed path.
  return presentPanel(ctx, { title, sections, keyHints, onInput });
}

export {
  closeActivePanel,
  createPanelShell,
  mountSidePanelOverlay,
  panelFallbackLines,
  presentPanel,
  presentPositionedPanel,
  resolvePanelPlacement,
  resolvePanelPrimitives,
};
