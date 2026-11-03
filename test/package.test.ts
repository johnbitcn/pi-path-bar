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
  const result = JSON.parse(output);
  const [pack] = Array.isArray(result) ? result : Object.values(result);
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
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});

test("release workflow stages with OIDC and never approves or publishes directly", () => {
  const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /node-version: '24'/);
  assert.match(workflow, /npm install --global npm@11\.15\.0/);
  for (const command of ["npm ci", "npm run check", "npm test", "npm pack --dry-run", "npm stage publish"]) {
    assert.ok(workflow.includes(command), command);
  }
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|npm publish|npm stage (approve|reject)|environment:/);
});
