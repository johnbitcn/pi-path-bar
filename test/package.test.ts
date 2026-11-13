import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadExtensions } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js";

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
    "CHANGELOG.md", "LICENSE", "README.md", "README.zh-CN.md", "THIRD_PARTY_NOTICES.md", "package.json",
    "assets/footer-preview.svg", "assets/folder-alias-preview.svg", "assets/git-status-preview.svg",
    "src/config.ts", "src/git.ts", "src/index.ts", "src/path.ts", "src/reading-mode.ts", "src/settings.ts",
  ].sort());
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pack.version, manifest.version);
  const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  assert.equal(changelog.match(/^## \[([^\]]+)\]/m)?.[1], manifest.version);
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.publishConfig.access, "public");
  assert.equal(manifest.publishConfig.registry, "https://registry.npmjs.org/");
  assert.deepEqual(manifest.pi.extensions, ["./src/index.ts", "./src/reading-mode.ts"]);
  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], "*");
  assert.equal(manifest.peerDependencies["@earendil-works/pi-tui"], "*");
  assert.equal(manifest.dependencies, undefined);
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.version, manifest.version);
  assert.equal(lock.packages[""].version, manifest.version);
});

test("package default entries load both the footer and reading-mode commands", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const paths = manifest.pi.extensions.map((file: string) => fileURLToPath(new URL(`../${file}`, import.meta.url)));
  const result = await loadExtensions(paths, root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.extensions.length, 2);
  const commands = result.extensions.flatMap((extension) => [...extension.commands.keys()]).sort();
  assert.deepEqual(commands, ["path-bar", "reading-mode"]);
});

test("README previews use self-contained SVG outlines in both languages", () => {
  const docs = ["README.md", "README.zh-CN.md"].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  for (const name of ["footer-preview", "folder-alias-preview", "git-status-preview"]) {
    const file = `assets/${name}.svg`;
    const svg = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(svg, /<svg[^>]+viewBox=/);
    assert.match(svg, /<title[^>]*>[^<]+<\/title>/);
    assert.match(svg, /<path /);
    assert.doesNotMatch(svg, /<text\b|<script\b|<foreignObject\b|<image\b|@font-face|font-family/i);
    const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const [, target] of svg.matchAll(/\bhref="([^"]+)"/g)) {
      assert.ok(target.startsWith("#") && ids.has(target.slice(1)), `Invalid SVG reference: ${target}`);
    }
    for (const doc of docs) assert.ok(doc.includes(`](${file})`), `Missing preview: ${file}`);
  }
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
