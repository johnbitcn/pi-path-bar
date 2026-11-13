import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, isKeyRelease, isKeyRepeat, matchesKey, parseKey, ScrollView, TuiAltScreen, VStack, type Component, type TUI } from "@earendil-works/pi-tui";

// shortcut: depends on Pi 1.5.x's private layoutRoot and dock order; replace when Pi exposes a layout API.
export function readingLayout(tui: TUI, marker: Component): { original: Component; reading: Component } | undefined {
  if (!(tui instanceof TuiAltScreen) || tui.hasOverlay()) return;
  const root = (tui as unknown as { layoutRoot?: unknown }).layoutRoot;
  if (!(root instanceof VStack) || root.children.length !== 2) return;
  const [transcript, dock] = root.children;
  if (!(transcript instanceof ScrollView) || !(dock instanceof VStack) || dock.children.length !== 6) return;
  const [pending, status, above, editor, below, footer] = dock.children;
  if (!(above instanceof Container) || !above.children.includes(marker) ||
      !(editor instanceof Container) || !editor.children.includes(tui.getFocusedComponent()!) ||
      !(footer instanceof Container)) return;
  return {
    original: root,
    reading: new VStack([
      { component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
      { component: new VStack([pending, status, above, below].map((component) => ({ component, shrink: 1, minSize: 0 }))),
        basis: "auto", grow: 0, shrink: 1, minSize: 1 },
    ]),
  };
}

/** Experimental opt-in extension: pi -e ./src/reading-mode.ts */
export default function (pi: ExtensionAPI) {
  let tui: TUI | undefined;
  let marker: Component | undefined;
  let restore: (() => void) | undefined;
  let unsubscribeInput: (() => void) | undefined;
  const cleanup = () => { exit(); unsubscribeInput?.(); unsubscribeInput = undefined; };
  const exit = () => { restore?.(); restore = undefined; };
  const toggle = (ctx: ExtensionContext) => {
    if (restore) { exit(); return; }
    if (ctx.mode !== "tui") { ctx.ui.notify("Reading mode requires TUI mode.", "warning"); return; }
    if (!tui || !marker) { ctx.ui.notify("Reading mode is not initialized. Run /reload and try again.", "warning"); return; }
    const layout = readingLayout(tui, marker);
    if (!layout || !(tui instanceof TuiAltScreen)) {
      ctx.ui.notify("Reading mode requires the supported fullscreen layout and an active editor.", "warning");
      return;
    }
    const renderer = tui;
    const focus = renderer.getFocusedComponent();
    const guard: Component = { render: () => [], invalidate() {}, handleInput(data) {
      if (matchesKey(data, "escape")) exit();
      else if (matchesKey(data, "ctrl+c")) { exit(); focus?.handleInput?.(data); }
    } };
    restore = () => {
      renderer.setLayoutRoot(layout.original);
      if (renderer.getFocusedComponent() === guard) renderer.setFocus(focus);
      renderer.requestRender();
    };
    renderer.setLayoutRoot(layout.reading);
    renderer.setFocus(guard);
    renderer.requestRender();
  };
  pi.registerCommand("reading-mode", { description: "Toggle reading mode (experimental); Esc restores the editor", handler: async (_args, ctx) => toggle(ctx) });
  pi.on("session_start", (_event, ctx) => {
    cleanup();
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget("pi-path-bar:reading-mode", (renderer) => {
      tui = renderer;
      const component = { render: () => [], invalidate() {}, dispose() { cleanup(); tui = undefined; marker = undefined; } };
      marker = component;
      return component;
    });
    // Pi 1.5.x matchesKey rejects modified Escape; leave ambiguous double-Esc input untouched.
    unsubscribeInput = ctx.ui.onTerminalInput((data) => {
      if (parseKey(data) !== "alt+escape") return undefined;
      if (!isKeyRelease(data) && !isKeyRepeat(data)) toggle(ctx);
      return { consume: true };
    });
  });
  pi.on("session_shutdown", cleanup);
}
