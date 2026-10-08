import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { directoryLine, formatPath, homePath } from "../src/path.ts";

const long = "~/Library/CloudStorage/GoogleDrive-zz.john.cn@gmail.com/我的云端硬盘/Projects/fabric-facet";
test("home conversion respects path boundaries", () => {
  assert.equal(homePath("/Users/john", "/Users/john"), "~");
  assert.equal(homePath("/Users/john/Projects/a", "/Users/john"), "~/Projects/a");
  assert.equal(homePath("/Users/johnny/a", "/Users/john"), "/Users/johnny/a");
  assert.equal(homePath("/tmp/a", "/Users/john"), "/tmp/a");
});
test("paths are shortened even in wide terminals", () => {
  assert.equal(formatPath(long, 200), "\uf07c ~/L/C/G/我/P/fabric-facet");
  assert.equal(formatPath("~", 20), "\uf07c ~");
  assert.equal(formatPath("/", 20), "/");
  assert.equal(formatPath("/tmp/a", 20), "/t/a");
  assert.equal(formatPath("workspace/a", 20), "\uf07c workspace/a");
});
test("shortening preserves the leaf and named root", () => {
  assert.equal(formatPath(long, 35), "\uf07c ~/L/C/G/我/P/fabric-facet");
  assert.equal(formatPath(long, 20), "\uf07c ~/…/fabric-facet");
  assert.equal(formatPath(long, 12), "fabric-facet");
  assert.equal(formatPath("/Library/CloudStorage/project", 20), "/L/C/project");
});
test("all lines fit narrow terminals, including Unicode", () => {
  for (const path of [long, "/", "~", "项目/很长很长的目录/最后目录", "~/👨‍👩‍👧‍👦family/ábc/项目", "~/a/" + "x".repeat(200)]) {
    for (let width = 0; width < 150; width++) {
      assert.ok(visibleWidth(formatPath(path, width)) <= width);
      assert.ok(visibleWidth(directoryLine(path, " (long-feature-branch) • session", width)) <= width);
    }
  }
});
test("path and suffix cannot inject terminal controls", () => {
  assert.ok(!directoryLine("~/a\nb\x1b[2J", " (x\ny)", 80).match(/[\x00-\x1f\x7f-\x9f]/));
});
test("branch and session get space on a long path", () => {
  const line = directoryLine(long, " (feature) • session", 60);
  assert.ok(line.includes("fabric-facet"));
  assert.ok(line.endsWith(" (feature) • session"));
});
