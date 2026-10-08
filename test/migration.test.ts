import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "../src/config.ts";

test("renamed config preserves legacy aliases, prefers new config and protects malformed files", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-migration-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const legacy = join(dir, "pi-show-dir.json");
  const current = join(dir, "pi-path-bar.json");
  const original = JSON.stringify({ mode: "auto", aliases: [{ path: "/Projects", name: "项目" }] });
  writeFileSync(legacy, original);
  const store = new ConfigStore(current, legacy);
  assert.equal(store.load().mode, "auto");
  store.update((config) => { config.mode = "full"; });
  assert.equal(store.load().mode, "full");
  assert.deepEqual(store.load().aliases, [{ path: "/Projects", name: "项目" }]);
  assert.equal(readFileSync(legacy, "utf8"), original);
  writeFileSync(current, "invalid");
  assert.throws(() => store.update((config) => { config.mode = "short"; }));
  assert.equal(readFileSync(current, "utf8"), "invalid");
  rmSync(current);
  writeFileSync(legacy, "invalid legacy");
  assert.throws(() => store.load());
});
