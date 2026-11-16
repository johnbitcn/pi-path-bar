import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initTheme } from "@earendil-works/pi-coding-agent";
import extension from "../src/index.ts";
import { ConfigStore, validateConfig } from "../src/config.ts";
import { resolveOrder, segmentEntries } from "../src/segments.ts";
import { openSettings } from "../src/settings.ts";
initTheme("dark", false);

const temporary = (t: { after: (fn: () => void) => void }) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-segments-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("configured order wins and unlisted segments go left of the clock", () => {
  assert.deepEqual(resolveOrder([], ["queue", "net"]), ["net", "queue", "clock"]);
  assert.deepEqual(resolveOrder(["queue", "clock", "net"], ["net", "queue"]), ["queue", "clock", "net"]);
  assert.deepEqual(resolveOrder(["queue"], ["net", "queue"]), ["queue", "net", "clock"]);
  assert.deepEqual(resolveOrder(["gone", "net"], ["net"]), ["net", "clock"]);
  assert.deepEqual(resolveOrder(["net", "net"], ["net"]), ["net", "clock"]);
  assert.deepEqual(resolveOrder([], []), ["clock"]);
});

test("segment entries accept the path-bar prefix only and stay on one line", () => {
  const entries = segmentEntries(new Map([
    ["path-bar:net", "a\nb\tc"],
    ["path-bar:queue", "Q3"],
    ["path-bar:Net", "upper"],
    ["usage", "5h:100% left"],
    ["path-bar:", "empty"],
  ]));
  assert.deepEqual([...entries], [["net", "a b c"], ["queue", "Q3"]]);
});

test("config validates segment ids and removes duplicates", () => {
  assert.deepEqual(validateConfig({ segments: ["net", "net", "clock"] }).segments, ["net", "clock"]);
  for (const segments of ["net", ["Net"], [1], ["bad/id"], ["a b"]]) assert.throws(() => validateConfig({ segments }));
});

async function footer(t: any, segments: string[], statuses: Map<string, string>) {
  const store = new ConfigStore(join(temporary(t), "config.json"));
  store.update((config) => { config.branch = false; config.session = false; config.segments = segments; });
  const handlers: Record<string, any> = {};
  let component: any;
  const ctx: any = {
    mode: "tui",
    getContextUsage: () => undefined,
    sessionManager: { getCwd: () => "/tmp/project", getSessionName: () => undefined, getEntries: () => [] },
    ui: {
      setFooter(factory: any) {
        component = factory?.({ requestRender() {} }, { fg: (_: string, text: string) => text }, {
          onBranchChange: () => () => {},
          getAvailableProviderCount: () => 1,
          getGitBranch: () => null,
          getExtensionStatuses: () => statuses,
        });
      },
      notify(message: string) { assert.fail(message); },
    },
  };
  extension({ on: (name: string, handler: any) => { handlers[name] = handler; }, registerCommand() {}, getThinkingLevel: () => "medium" } as any, store.file);
  t.after(() => handlers.session_shutdown());
  await handlers.session_start({}, ctx);
  return { component, store };
}

test("plugin segments render right of the path and leave the status line", async (t) => {
  const statuses = new Map([["path-bar:net", "⌁"], ["path-bar:queue", "Q3"], ["usage", "5h:100% left"]]);
  const { component } = await footer(t, [], statuses);
  assert.match(component.render(80)[0], /⌁ Q3 \d{2}:\d{2}$/);
  assert.equal(component.render(80)[2], "5h:100% left");

  const configured = await footer(t, ["queue", "clock", "net"], statuses);
  assert.match(configured.component.render(80)[0], /Q3 \d{2}:\d{2} ⌁$/);
  for (let width = 0; width <= 80; width++) {
    for (const line of configured.component.render(width)) assert.ok(visibleWidth(line) <= width);
  }
});

test("narrow terminals drop segments from the right", async (t) => {
  const statuses = new Map([["path-bar:net", "NET"]]);
  // Default order puts the clock nearest the edge, so the clock goes first.
  const { component } = await footer(t, [], statuses);
  assert.match(component.render(80)[0], /NET \d{2}:\d{2}$/);
  assert.match(component.render(9)[0], /NET$/);
  assert.match(component.render(8)[0], /NET$/);
  assert.match(component.render(6)[0], /NET$/);
  assert.ok(!component.render(5)[0].includes("NET"));

  // Moving the clock left of the segment makes the segment drop first.
  const clockFirst = await footer(t, ["clock", "net"], statuses);
  assert.match(clockFirst.component.render(9)[0], /\d{2}:\d{2}$/);
});

test("Footer order moves segments with < > and , . and ignores key releases", async (t) => {
  const store = new ConfigStore(join(temporary(t), "config.json"));
  let config = store.load();
  const statuses = new Map([["path-bar:net", "⌁"], ["path-bar:queue", "Q3"]]);
  const sequence = [
    ["\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\r"], // open Footer order
    ["\x1b[A", "\x1b[A", ">", ",", ">", ">", "\x1b[60;2u", "\x1b[60;2;3u", "\x1b[62;2u", "\x1b"], // move, then close
    ["\x1b"],
  ];
  const seen: string[] = [];
  const ctx: any = { ui: {
    custom: (build: any) => new Promise((done) => {
      const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
      const screen = component.render(60).join("\n");
      if (screen.includes("< / >")) {
        assert.ok(screen.includes("net"));
        assert.ok(screen.includes("queue"));
        seen.push(screen);
      }
      for (const key of sequence.shift()!) component.handleInput(key);
    }),
    notify(message: string, kind: string) { assert.notEqual(kind, "error", message); },
  } };
  await openSettings(ctx, () => config, (change, reinstall) => {
    assert.equal(reinstall, false);
    config = store.update(change);
    return true;
  }, () => statuses);
  assert.deepEqual(store.load().segments, ["queue", "clock", "net"]);
  assert.equal(sequence.length, 0);
  assert.ok(seen.length > 0);
});
