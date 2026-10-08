import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

test("npm package contains only runtime sources, bilingual docs and license notices", () => {
  const args = ["pack", "--dry-run", "--ignore-scripts", "--json"];
  const npmCli = process.env.npm_execpath;
  const output = npmCli
    ? execFileSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: "utf8", timeout: 30000 })
    : execFileSync("npm", args, { cwd: root, encoding: "utf8", timeout: 30000 });
  const [pack] = JSON.parse(output);
  assert.equal(pack.name, "pi-path-bar");
  assert.deepEqual(pack.bundled, []);
  assert.deepEqual(pack.files.map((file: { path: string }) => file.path).sort(), [
    "LICENSE", "README.md", "README.zh-CN.md", "THIRD_PARTY_NOTICES.md", "package.json",
    "src/config.ts", "src/git.ts", "src/index.ts", "src/path.ts", "src/settings.ts",
  ].sort());
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.publishConfig.registry, "https://registry.npmjs.org/");
  assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], "*");
  assert.equal(manifest.peerDependencies["@earendil-works/pi-tui"], "*");
  assert.equal(manifest.dependencies, undefined);
});
