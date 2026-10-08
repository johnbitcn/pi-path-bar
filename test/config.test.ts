import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore, aliasName, defaults, folderPath, setAlias, validateConfig } from "../src/config.ts";
import { displayPath, formatPath } from "../src/path.ts";

function temporary(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "pi-show-dir-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("aliases use directory boundaries and longest matching prefix", () => {
  const aliases = [{ path: "/Users/john/Projects", name: "项目" }, { path: "/Users/john/Projects/fabric-facet", name: "facet" }];
  assert.equal(displayPath("/Users/john/Projects", "/Users/john", aliases), "项目");
  assert.equal(displayPath("/Users/john/Projects/fabric-facet/src/components", "/Users/john", aliases), "facet/src/components");
  assert.equal(displayPath("/Users/john/Projects-other/a", "/Users/john", aliases), "~/Projects-other/a");
  assert.equal(formatPath("facet/src/components", 100), "\uf07c facet/s/components");
  assert.equal(displayPath("/tmp/project", "/Users/john", [{ path: "/", name: "根" }]), "根/tmp/project");
});
test("path validation accepts arbitrary folders and expands home", (t) => {
  const dir = temporary(t);
  mkdirSync(join(dir, "other"));
  assert.equal(folderPath("~/other/", dir), join(dir, "other"));
  assert.equal(folderPath(join(dir, "other")), join(dir, "other"));
  assert.throws(() => folderPath("relative"));
  assert.throws(() => folderPath(join(dir, "missing")));
  const file = join(dir, "file"); writeFileSync(file, "test");
  assert.throws(() => folderPath(file));
});
test("invalid and duplicate alias names are rejected", () => {
  for (const name of ["", " ", "~", ".", "..", "a/b", "a\\b", "a\nb", "a\x1bb"]) assert.throws(() => aliasName(name));
  assert.equal(aliasName(" 云盘 "), "云盘");
  const config = defaults();
  setAlias(config, { path: "/tmp/a", name: "a" });
  assert.throws(() => setAlias(config, { path: "/tmp/a", name: "b" }));
  assert.throws(() => setAlias(config, { path: "/tmp/b", name: "a" }));
  setAlias(config, { path: "/tmp/b", name: "b" }, "/tmp/a");
  assert.deepEqual(config.aliases, [{ path: "/tmp/b", name: "b" }]);
});
test("config persists settings and aliases and reads latest saved changes", (t) => {
  const file = join(temporary(t), "nested", "config.json");
  const first = new ConfigStore(file), second = new ConfigStore(file);
  assert.deepEqual(first.load(), defaults());
  first.update((config) => { config.mode = "full"; });
  second.update((config) => { config.icon = false; setAlias(config, { path: "/tmp/a", name: "项目" }); });
  assert.equal(first.load().mode, "full");
  assert.equal(first.load().icon, false);
  assert.deepEqual(first.load().aliases, [{ path: "/tmp/a", name: "项目" }]);
  first.update((config) => { config.aliases = []; });
  assert.deepEqual(second.load().aliases, []);
});
test("invalid config is not overwritten and missing drives keep their aliases", (t) => {
  const file = join(temporary(t), "config.json");
  writeFileSync(file, "{invalid");
  const store = new ConfigStore(file);
  assert.throws(() => store.update((config) => { config.mode = "auto"; }));
  assert.equal(readFileSync(file, "utf8"), "{invalid");
  assert.throws(() => validateConfig({ mode: "invalid" }));
  assert.throws(() => validateConfig({ icon: "false" }));
  assert.throws(() => validateConfig({ aliases: [{ path: "relative", name: "a" }] }));
  assert.equal(validateConfig({ aliases: [{ path: "/a/disconnected/drive", name: "盘" }] }).aliases.length, 1);
});
test("auto/full modes and icon switches", () => {
  assert.equal(formatPath("~/Library/Projects/project", 100, { mode: "auto" }), "\uf07c ~/Library/Projects/project");
  assert.equal(formatPath("~/Library/Projects/project", 20, { mode: "auto" }), "\uf07c ~/L/P/project");
  assert.equal(formatPath("~/Library/Projects/project", 100, { mode: "full", icon: false }), "~/Library/Projects/project");
  assert.equal(formatPath("~/Library/Projects/project", 100, { icon: false }), "~/L/P/project");
});
