import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mountSidePanelOverlay,
  presentPositionedPanel,
  resolvePanelPlacement,
} from "../omp/.omp/agent/extensions/panel-shell.js";

// Records every showOverlay/setFocus call and hands back stub handles that
// remember their hide() count. No real TUI — this is the pure seam the issue
// asks the spike to cover.
function stubTui() {
  const overlays = [];
  const focused = [];
  return {
    overlays,
    focused,
    showOverlay(component, options) {
      const handle = {
        component,
        options,
        hidden: false,
        hideCalls: 0,
        hide() {
          this.hidden = true;
          this.hideCalls += 1;
        },
      };
      overlays.push(handle);
      return handle;
    },
    setFocus(component) {
      focused.push(component);
    },
  };
}

test("resolvePanelPlacement keeps the framed panel authoritative unless opted in", () => {
  // Default / disabled: framed regardless of width.
  assert.equal(resolvePanelPlacement({ width: 200 }), "framed");
  assert.equal(resolvePanelPlacement({ width: 200, enabled: false }), "framed");
  // Enabled: positioned only at/above the breakpoint.
  assert.equal(resolvePanelPlacement({ width: 80, enabled: true }), "framed");
  assert.equal(resolvePanelPlacement({ width: 100, enabled: true }), "positioned");
  assert.equal(resolvePanelPlacement({ width: 140, enabled: true }), "positioned");
});

test("resolvePanelPlacement honors an explicit threshold and the seam boundary", () => {
  // Selection flips exactly at the threshold: threshold-1 -> framed, threshold -> positioned.
  assert.equal(resolvePanelPlacement({ width: 119, threshold: 120, enabled: true }), "framed");
  assert.equal(resolvePanelPlacement({ width: 120, threshold: 120, enabled: true }), "positioned");
});

test("mountSidePanelOverlay mounts complementary framed + floating slots on one component", () => {
  const tui = stubTui();
  const panel = { id: "panel" };
  mountSidePanelOverlay(tui, panel, { threshold: 100 });

  assert.equal(tui.overlays.length, 2, "exactly two overlay slots are mounted");
  const [framed, floating] = tui.overlays;

  // Both slots wrap the SAME shell component (no duplicate component instance).
  assert.equal(framed.component, panel);
  assert.equal(floating.component, panel);

  // Framed slot: bottom-center full width, visible only on narrow terminals.
  assert.equal(framed.options.anchor, "bottom-center");
  assert.equal(framed.options.width, "100%");
  assert.equal(framed.options.margin, 0);
  assert.equal(framed.options.visible(80, 40), true);
  assert.equal(framed.options.visible(120, 40), false);

  // Floating slot: right-anchored percentage width with a minWidth floor,
  // visible only on wide terminals.
  assert.equal(floating.options.anchor, "right-center");
  assert.equal(typeof floating.options.width, "string");
  assert.match(floating.options.width, /%$/u);
  assert.equal(typeof floating.options.minWidth, "number");
  assert.equal(floating.options.visible(80, 40), false);
  assert.equal(floating.options.visible(120, 40), true);
});

test("mountSidePanelOverlay shows exactly one slot at any width (live fallback seam)", () => {
  const tui = stubTui();
  mountSidePanelOverlay(tui, { id: "panel" }, { threshold: 100 });
  const [framed, floating] = tui.overlays;
  for (const width of [1, 40, 99, 100, 101, 240]) {
    const visibleSlots = [framed, floating].filter((slot) => slot.options.visible(width, 40)).length;
    assert.equal(visibleSlots, 1, `width ${width} shows exactly one slot`);
  }
});

test("mountSidePanelOverlay captures focus and tears down both slots with no ghost overlay", () => {
  const tui = stubTui();
  const panel = { id: "panel" };
  const onClose = [];
  const overlay = mountSidePanelOverlay(tui, panel, { threshold: 100, onClose: () => onClose.push("closed") });

  // Focus is captured on the shell component.
  assert.deepEqual(tui.focused, [panel]);

  const [framed, floating] = tui.overlays;
  overlay.close();
  assert.equal(framed.hidden, true, "framed slot removed on close");
  assert.equal(floating.hidden, true, "floating slot removed on close");
  assert.deepEqual(onClose, ["closed"], "onClose runs once");

  // Idempotent: a second close neither re-hides nor re-fires onClose.
  overlay.close();
  assert.equal(framed.hideCalls, 1);
  assert.equal(floating.hideCalls, 1);
  assert.deepEqual(onClose, ["closed"]);
});

test("presentPositionedPanel degrades to the framed fallback without a live TUI", async () => {
  // Under `node --test` the native primitives never resolve, so the positioned
  // presenter must fall back to the authoritative framed path (setWidget),
  // never mount a live ctx.ui.custom overlay. This is the safety gate.
  const widgets = [];
  const customCalls = [];
  const ctx = {
    hasUI: true,
    ui: {
      async setWidget(arg0, arg1, arg2) {
        if (Array.isArray(arg0)) widgets.push({ lines: arg0, options: arg1 });
        else widgets.push({ key: arg0, lines: arg1, options: arg2 });
      },
      custom(factory, options) {
        customCalls.push({ factory, options });
        return Promise.resolve("noop");
      },
      notify() {},
    },
  };

  const result = await presentPositionedPanel(ctx, {
    title: "Workflow Cockpit",
    sections: [{ label: "Context", lines: ["repo: example/repo"] }],
  });

  assert.equal(result, "setWidget");
  assert.equal(customCalls.length, 0, "no live overlay is mounted without primitives");
  const fallback = widgets.find((widget) => Array.isArray(widget.lines));
  assert.ok(fallback, "panel presented through the framed setWidget fallback");
  assert.deepEqual(fallback.options, { placement: "belowEditor" });
  assert.match(fallback.lines.join("\n"), /Workflow Cockpit/u);
  assert.match(fallback.lines.join("\n"), /repo: example\/repo/u);
});
