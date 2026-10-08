import assert from "node:assert/strict";
import test from "node:test";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { directoryLine, resolveDisplayPath } from "../src/path.ts";

const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const normal = (text: string) => `\x1b[90m${text}\x1b[39m`;

test("only the matched alias is styled and theme changes are reflected", () => {
  initTheme("dark", false);
  const display = resolveDisplayPath("/Projects/fabric-facet/src/components", "/Users/john", [{ path: "/Projects", name: "项目" }, { path: "/Projects/fabric-facet", name: "facet" }]);
  const options = { aliasName: display.aliasName, style: { normal, alias: (text: string) => getMarkdownTheme().link(text) } };
  const render = () => directoryLine(display.path, " (main)", 80, options);
  const dark = render();
  assert.equal(plain(dark), "\uf07c facet/s/components (main)");
  assert.ok(dark.includes(getMarkdownTheme().link("facet")));
  assert.ok(dark.includes(normal("/s/components")));
  assert.ok(dark.endsWith(normal(" (main)")));
  initTheme("light", false);
  const light = render();
  assert.ok(light.includes(getMarkdownTheme().link("facet")));
  assert.notEqual(light, dark);
  assert.equal(plain(light), plain(dark));
});

test("ordinary roots and leaves that merely resemble aliases are not highlighted", () => {
  const painted: string[] = [];
  const style = { normal, alias: (text: string) => { painted.push(text); return `\x1b[34m${text}\x1b[39m`; } };
  directoryLine("~/Projects/facet", "", 80, { style });
  assert.deepEqual(painted, []);
  const line = directoryLine("facet/long-directory/facet", "", 5, { aliasName: "facet", style });
  assert.equal(plain(line), "facet");
  assert.deepEqual(painted, []);
  const exact = directoryLine("facet", "", 80, { aliasName: "facet", style });
  assert.equal(plain(exact), "\uf07c facet");
  assert.deepEqual(painted, ["facet"]);
});

test("colored Unicode paths respect width across modes and icon settings", () => {
  initTheme("dark", false);
  for (const mode of ["short", "auto", "full"] as const) {
    for (const icon of [true, false]) {
      for (let width = 0; width < 100; width++) {
        const line = directoryLine("云盘/Projects/最后目录", " (feature) • session", width, {
          mode, icon, aliasName: "云盘", style: { normal, alias: (text) => getMarkdownTheme().link(text) },
        });
        assert.ok(visibleWidth(line) <= width);
        assert.equal(plain(line), plain(directoryLine("云盘/Projects/最后目录", " (feature) • session", width, { mode, icon })));
      }
    }
  }
});
