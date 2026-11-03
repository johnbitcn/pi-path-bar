import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/index.ts";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/config.ts";
initTheme("dark", false);

test("footer preserves statuses, usage and supports restore", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-footer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let start: any;
  let command: any;
  let factory: any;
  let disposed = false;
  const pi: any = {
    on: (name: string, handler: any) => { if (name === "session_start") start = handler; },
    registerCommand: (name: string, value: any) => { assert.equal(name, "path-bar"); command = value; },
    getThinkingLevel: () => "medium",
  };
  const ctx: any = {
    mode: "tui",
    model: { id: "test-model", provider: "test", contextWindow: 200000, reasoning: true },
    modelRegistry: { isUsingOAuth: () => true },
    getContextUsage: () => ({ percent: 10, contextWindow: 200000 }),
    sessionManager: {
      getCwd: () => "/tmp/a",
      getSessionName: () => "session",
      getEntries: () => [{ type: "message", message: { role: "assistant", usage: {
        input: 100, output: 200, cacheRead: 0, cacheWrite: 0, cost: { total: 0.01 },
      } } }],
    },
    ui: {
      setFooter: (value: any) => { factory = value; }, notify() {},
      custom: (build: any) => new Promise((resolve) => {
        const component = build({ requestRender() {} }, { fg: (_color: string, text: string) => text, bold: (text: string) => text }, {}, resolve);
        // short -> auto -> full -> native; Esc closes the menu.
        component.handleInput("\r"); component.handleInput("\r"); component.handleInput("\r"); component.handleInput("\x1b");
      }),
    },
  };
  extension(pi, join(dir, "config.json"));
  await start({}, ctx);
  const component = factory({ requestRender() {} }, { fg: (_color: string, text: string) => text }, {
    onBranchChange: () => () => { disposed = true; },
    getGitBranch: () => "main",
    getAvailableProviderCount: () => 2,
    getExtensionStatuses: () => new Map([["usage", "5h:100% left"]]),
  });
  const lines = component.render(100);
  assert.match(lines[0], /^\/t\/a \( main \?\) • session +\d{2}:\d{2}$/);
  assert.equal(visibleWidth(lines[0]), 100);
  assert.ok(lines[1].includes("$0.010 (sub)"));
  assert.ok(lines[1].includes("test-model • medium"));
  assert.equal(lines[2], "5h:100% left");
  for (let width = 1; width <= 100; width++) {
    for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
  }
  component.dispose();
  assert.ok(disposed);
  await command.handler("", ctx);
  assert.equal(factory, undefined);
});

for (const timeFormat of ["24h", "12h"] as const) {
  test(`clock is right-aligned, refreshes while idle and cleans up (${timeFormat})`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-clock-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const store = new ConfigStore(join(dir, "config.json"));
    store.update((config) => { config.branch = false; config.timeFormat = timeFormat; });
    const now = new Date(2026, 0, 1, timeFormat === "24h" ? 23 : 11, 59, 58);
    t.mock.timers.enable({ apis: ["Date", "setInterval"], now });
    const handlers: Record<string, any> = {};
    let renders = 0;
    let unsubscribed = 0;
    let component: any;
    const ctx: any = {
      mode: "tui",
      getContextUsage: () => undefined,
      sessionManager: { getCwd: () => "/tmp/中文/project", getSessionName: () => undefined, getEntries: () => [] },
      ui: {
        setFooter(factory: any) {
          component?.dispose();
          component = factory?.({ requestRender() { renders++; } }, { fg: (_: string, text: string) => text }, {
            onBranchChange: () => () => { unsubscribed++; },
            getExtensionStatuses: () => new Map(),
          });
        },
        notify(message: string) { assert.fail(message); },
      },
    };
    extension({ on: (name: string, handler: any) => { handlers[name] = handler; }, registerCommand() {} } as any, store.file);
    t.after(() => handlers.session_shutdown());
    await handlers.session_start({}, ctx);
    const before = timeFormat === "24h" ? "23:59" : "11:59 AM";
    assert.ok(component.render(80)[0].endsWith(before));
    assert.equal(visibleWidth(component.render(80)[0]), 80);
    const narrow = component.render(before.length + 2)[0];
    assert.ok(!narrow.includes(before));
    for (let width = 0; width <= 100; width++) {
      for (const line of component.render(width)) assert.ok(visibleWidth(line) <= width);
    }
    t.mock.timers.tick(1000);
    assert.equal(renders, 0);
    t.mock.timers.tick(1000);
    assert.equal(renders, 1);
    assert.ok(component.render(80)[0].endsWith(timeFormat === "24h" ? "00:00" : "12:00 PM"));
    t.mock.timers.tick(60_000);
    assert.equal(renders, 2);

    // Reinstalling must not leave the previous clock running.
    await handlers.session_start({}, ctx);
    t.mock.timers.tick(60_000);
    assert.equal(renders, 3);
    assert.equal(unsubscribed, 1);
    component.dispose();
    t.mock.timers.tick(60_000);
    assert.equal(renders, 3);
    assert.equal(unsubscribed, 2);
    await handlers.session_start({}, ctx);
    handlers.session_shutdown();
    t.mock.timers.tick(60_000);
    assert.equal(renders, 3);
    assert.equal(unsubscribed, 3);

    // Cover midnight and afternoon without depending on the machine's time zone.
    t.mock.timers.setTime(new Date(2026, 0, 2, 0, 5).getTime());
    assert.ok(component.render(80)[0].endsWith(timeFormat === "24h" ? "00:05" : "12:05 AM"));
    t.mock.timers.setTime(new Date(2026, 0, 2, 13, 5).getTime());
    assert.ok(component.render(80)[0].endsWith(timeFormat === "24h" ? "13:05" : "01:05 PM"));
    await handlers.session_start({}, ctx);
    store.update((config) => { config.mode = "native"; });
    await handlers.session_start({}, ctx);
    assert.equal(component, undefined);
    t.mock.timers.tick(60_000);
    assert.equal(renders, 3);
  });
}
