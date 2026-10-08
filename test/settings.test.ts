import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { ConfigStore } from "../src/config.ts";
import { openSettings } from "../src/settings.ts";
initTheme("dark", false);

test("settings menu adds, edits and deletes an arbitrary folder alias", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-menu-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const folder = join(dir, "arbitrary"); mkdirSync(folder);
  const store = new ConfigStore(join(dir, "config.json"));
  let config = store.load();
  const snapshots: any[] = [];
  const inputs = [folder, "任意目录", "", "新名称"];
  const selects = ["任意目录 → " + folder, "修改路径或名称", "新名称 → " + folder, "删除别名"];
  const keys = [
    ["\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\r"], // Add
    ["\x1b[B", "\r"], // Manage -> edit
    ["\r"], // Manage -> delete
    ["\x1b"],
  ];
  const errors: string[] = [];
  const ctx: any = { sessionManager: { getCwd: () => dir }, ui: {
    custom: (build: any) => new Promise((done) => {
      const component = build({ requestRender() {} }, { fg: (_color: string, text: string) => text, bold: (text: string) => text }, {}, done);
      assert.ok(component.render(80).join("\n").includes("目录显示设置"));
      for (const key of keys.shift()!) component.handleInput(key);
    }),
    input: async () => inputs.shift(),
    select: async (_title: string, choices: string[]) => {
      const choice = selects.shift(); assert.ok(choices.includes(choice!)); return choice;
    },
    confirm: async () => true,
    notify: (message: string, kind: string) => { if (kind === "error") errors.push(message); },
  } };
  await openSettings(ctx, () => config, (change) => {
    config = store.update(change); snapshots.push(config.aliases); return true;
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(snapshots, [[{ path: folder, name: "任意目录" }], [{ path: folder, name: "新名称" }], []]);
  assert.deepEqual(store.load().aliases, []);
  assert.equal(inputs.length + selects.length + keys.length, 0);
});

for (const input of ["", "   ", undefined]) {
  test(`add alias uses current folder for blank input; Esc cancels (${JSON.stringify(input)})`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-current-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const store = new ConfigStore(join(dir, "config.json"));
    let config = store.load();
    let menuCount = 0;
    let inputCount = 0;
    const ctx: any = {
      sessionManager: { getCwd: () => dir },
      ui: {
        custom: (build: any) => new Promise((done) => {
          const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
          const keys = menuCount++ === 0 ? ["\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\r"] : ["\x1b"];
          for (const key of keys) component.handleInput(key);
        }),
        input: async (_title: string, placeholder: string) => {
          if (inputCount++ === 0) { assert.equal(placeholder, dir); return input; }
          return "当前项目";
        },
        notify: (message: string, kind: string) => { assert.notEqual(kind, "error", message); },
      },
    };
    await openSettings(ctx, () => config, (change) => { config = store.update(change); return true; });
    assert.deepEqual(config.aliases, input === undefined ? [] : [{ path: dir, name: "当前项目" }]);
    assert.equal(inputCount, input === undefined ? 1 : 2);
  });
}
