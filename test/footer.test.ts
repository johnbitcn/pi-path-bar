import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import extension from "../src/index.ts";
import { initTheme } from "@earendil-works/pi-coding-agent";
initTheme("dark", false);

test("footer preserves statuses, usage and supports restore", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-show-dir-footer-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let start: any;
  let command: any;
  let factory: any;
  let disposed = false;
  const pi: any = {
    on: (name: string, handler: any) => { if (name === "session_start") start = handler; },
    registerCommand: (_name: string, value: any) => { command = value; },
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
  assert.equal(lines[0], "/t/a ( main ?) • session");
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
