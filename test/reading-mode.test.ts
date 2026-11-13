import assert from "node:assert/strict";
import test from "node:test";
import { Container, ScrollView, Text, TuiAltScreen, VStack } from "@earendil-works/pi-tui";
import { getScrollViewBox, renderLayoutFrame } from "../node_modules/@earendil-works/pi-tui/dist/layout.js";
import extension, { readingLayout } from "../src/reading-mode.ts";

function setup() {
  const tui = new TuiAltScreen({ columns: 80, rows: 24 } as any);
  tui.requestRender = () => {};
  const events: Record<string, any> = {};
  let command: any;
  let listener: any;
  let marker: any;
  const warnings: string[] = [];
  const ctx: any = { mode: "tui", ui: {
    notify: (message: string) => warnings.push(message),
    setWidget: (_key: string, factory: any) => { marker?.dispose(); marker = factory(tui); },
    onTerminalInput: (handler: any) => { listener = handler; return () => { listener = undefined; }; },
  } };
  extension({ on: (name: string, handler: any) => { events[name] = handler; },
    registerCommand: (name: string, options: any) => { assert.equal(name, "reading-mode"); command = options.handler; },
  } as any);
  events.session_start({}, ctx);
  const inputs: string[] = [];
  const editor = { render: () => ["DRAFT", "INPUT", "INPUT"], invalidate() {}, handleInput: (data: string) => inputs.push(data) };
  const editorContainer = new Container(); editorContainer.addChild(editor);
  const above = new Container(); above.addChild(marker); above.addChild(new Text("WIDGET", 0, 0));
  const footer = new Container(); footer.addChild(new Text("FOOTER", 0, 0));
  const document = new Text(Array.from({ length: 60 }, (_, i) => `TOOL OUTPUT ${i}`).join("\n"), 0, 0);
  const transcript = new ScrollView(document, { primary: true, follow: "end" });
  const dock = new VStack([
    { component: new Text("PENDING", 0, 0), shrink: 1, minSize: 0 },
    { component: new Text("STATUS", 0, 0), shrink: 1, minSize: 0 },
    { component: above, shrink: 1, minSize: 0 },
    { component: editorContainer, shrink: 1, minSize: 3 },
    { component: new Container(), shrink: 1, minSize: 0 },
    { component: footer, shrink: 1, minSize: 0 },
  ]);
  const root = new VStack([
    { component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 },
    { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
  ]);
  tui.setLayoutRoot(root); tui.setFocus(editor);
  const frame = (width = 80, height = 24) => renderLayoutFrame((tui as any).layoutRoot, width, height, () => {});
  return { tui, root, dock, document, transcript, editor, inputs, marker, events, ctx, warnings, frame,
    toggle: () => listener?.("\x1b[27;3u"), command: () => command("", ctx), input: (data: string) => listener?.(data), hasListener: () => !!listener };
}

test("reading mode releases editor/footer space and restores the exact layout, focus and draft", () => {
  const s = setup();
  const before = s.frame();
  s.toggle();
  const reading = s.frame();
  assert.equal(getScrollViewBox(reading, s.transcript)!.rect.height, getScrollViewBox(before, s.transcript)!.rect.height + 4);
  const text = reading.lines.join("\n");
  assert.doesNotMatch(text, /DRAFT|INPUT|FOOTER/);
  for (const keep of ["TOOL OUTPUT", "PENDING", "STATUS", "WIDGET"]) assert.ok(text.includes(keep));
  s.tui.getFocusedComponent()!.handleInput!("oops\r");
  assert.deepEqual(s.inputs, []);
  // Same ScrollView and document survive output, resize and repeated toggles.
  for (const [width, height] of [[20, 12], [120, 40]]) assert.equal(s.frame(width, height).lines.length, height);
  assert.deepEqual(s.input("\x1b[27;3u"), { consume: true });
  assert.equal((s.tui as any).layoutRoot, s.root);
  assert.equal(s.tui.getFocusedComponent(), s.editor);
  assert.match(s.frame().lines.join("\n"), /DRAFT/);
  assert.equal(s.input("\x1bz"), undefined);
  s.toggle(); s.toggle();
  assert.equal((s.tui as any).layoutRoot, s.root);
});

test("Alt+Esc handles extended input without consuming Ctrl+G, double Esc or old shortcuts", () => {
  const s = setup();
  for (const data of ["\x1b", "\x1b\x1b", "\x07", "\x1b[103;5u", "\x1bz", "\x1b[27;5u"]) {
    assert.equal(s.input(data), undefined);
  }
  assert.deepEqual(s.input("\x1b[27;3u"), { consume: true });
  assert.notEqual((s.tui as any).layoutRoot, s.root);
  for (const data of ["\x1b[27;3:2u", "\x1b[27;3:3u"]) {
    assert.deepEqual(s.input(data), { consume: true });
    assert.notEqual((s.tui as any).layoutRoot, s.root);
  }
  assert.deepEqual(s.input("\x1b[27;3;27~"), { consume: true });
  assert.equal((s.tui as any).layoutRoot, s.root);
});

test("slash command bypasses terminal shortcut handling and Esc restores the editor", async () => {
  const s = setup();
  await s.command();
  assert.doesNotMatch(s.frame().lines.join("\n"), /DRAFT|INPUT|FOOTER/);
  s.tui.getFocusedComponent()!.handleInput!("\x1b");
  assert.equal(s.tui.getFocusedComponent(), s.editor);
  s.marker.dispose();
  await s.command();
  assert.match(s.warnings.at(-1)!, /not initialized/);
});

test("scroll position and new tool output survive layout changes", () => {
  const s = setup(); s.frame();
  s.transcript.scrollTo(8);
  s.toggle(); s.frame();
  assert.equal(s.transcript.scrollTop, 8);
  s.transcript.scrollBy(3); s.frame();
  assert.equal(s.transcript.scrollTop, 11);
  s.document.setText(Array.from({ length: 80 }, (_, i) => `NEW TOOL OUTPUT ${i}`).join("\n"));
  assert.match(s.frame().lines.join("\n"), /NEW TOOL OUTPUT/);
  assert.equal(s.transcript.scrollTop, 11);
  s.toggle(); s.frame();
  assert.equal(s.transcript.scrollTop, 11);
});

test("Escape exits; Ctrl+C exits and reaches the original handler", () => {
  const s = setup();
  s.toggle(); s.tui.getFocusedComponent()!.handleInput!("\x1b");
  assert.equal(s.tui.getFocusedComponent(), s.editor);
  s.toggle(); s.tui.getFocusedComponent()!.handleInput!("\x03");
  assert.deepEqual(s.inputs, ["\x03"]);
  assert.equal((s.tui as any).layoutRoot, s.root);
});

for (const cleanup of ["shutdown", "dispose", "session switch"]) {
  test(`${cleanup} restores layout and cleans up or rebinds the input listener`, () => {
    const s = setup(); s.toggle();
    if (cleanup === "shutdown") s.events.session_shutdown();
    else if (cleanup === "dispose") s.marker.dispose();
    else s.events.session_start({}, s.ctx);
    assert.equal((s.tui as any).layoutRoot, s.root);
    assert.equal(s.tui.getFocusedComponent(), s.editor);
    assert.equal(s.hasListener(), cleanup === "session switch");
  });
}

test("unknown layouts, regular mode, dialogs and missing markers fail closed", () => {
  const s = setup();
  s.tui.setFocus(new Text("DIALOG", 0, 0));
  s.toggle(); assert.equal(s.warnings.length, 1);
  assert.equal((s.tui as any).layoutRoot, s.root);
  s.tui.setFocus(s.editor);
  assert.equal(readingLayout(s.tui, new Text("foreign marker")), undefined);
  s.dock.removeChild(s.dock.children[0]);
  s.toggle(); assert.equal(s.warnings.length, 2);
  assert.equal(readingLayout({ mode: "regular" } as any, s.marker), undefined);
});
