import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitColor, gitText, parseStatus, readGit, readOperation, watchGit, type ReadyGit, type GitState } from "../src/git.ts";

function temporary(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-git-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function command(cwd: string, args: string[], input?: string) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", input, env: { ...process.env, LC_ALL: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } }).trimEnd();
}
function repo(t: { after: (fn: () => void) => void }, commit = true) {
  const dir = temporary(t);
  command(dir, ["init", "-q", "-b", "main"]);
  command(dir, ["config", "user.name", "Test"]);
  command(dir, ["config", "user.email", "test@example.invalid"]);
  if (commit) {
    writeFileSync(join(dir, "tracked"), "initial\n");
    command(dir, ["add", "tracked"]);
    command(dir, ["commit", "-qm", "initial"]);
  }
  return dir;
}
function ready(state: GitState): ReadyGit {
  assert.equal(state.kind, "ready");
  return state as ReadyGit;
}

test("porcelain v2 handles all conflicts, rename source paths and arbitrary filenames", () => {
  const conflicts = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];
  const data = ["# branch.oid abc", "# branch.head main", "# branch.ab +3 -2", "# stash 4",
    ...conflicts.map((xy) => `u ${xy} irrelevant metadata path`),
    "1 M. metadata staged", "1 .M metadata dirty", "1 MM metadata both",
    "2 R. metadata destination", "? rename-source-must-not-count",
    "? odd\n1 M. filename", "? untracked", "! ignored", "",
  ].join("\0");
  const state = parseStatus(data);
  assert.equal(state.conflicted, 7);
  assert.equal(state.staged, 3);
  assert.equal(state.dirty, 2);
  assert.equal(state.untracked, 2);
  assert.equal(gitColor(state), "error");
  assert.equal(gitText(state), " main ⇣2 ⇡3 *4 ~7 +3 !2 ?2");
  assert.throws(() => parseStatus("? no branch header\0"));
});

test("Git colors have correct priority; upstream and stash alone stay blue", () => {
  const clean = parseStatus("# branch.oid abc\0# branch.head main\0");
  assert.equal(gitColor(clean), "mdLink");
  assert.equal(gitColor({ ...clean, ahead: 2, behind: 1, stash: 3 }), "mdLink");
  for (const key of ["staged", "dirty", "untracked"] as const) assert.equal(gitColor({ ...clean, [key]: 1 }), "warning");
  assert.equal(gitColor({ ...clean, staged: 2, conflicted: 1 }), "error");
  assert.equal(gitColor({ ...clean, operation: "rebase", dirty: 2 }), "error");
  assert.equal(gitColor({ kind: "unknown" }), "text");
  assert.equal(gitText({ kind: "none" }), "");
  assert.equal(gitText({ kind: "unknown" }, "main"), " main ?");
  assert.equal(gitText({ kind: "unknown" }), " ?");
});

test("real repository supports unborn branches, clean state and local changes", async (t) => {
  const unborn = repo(t, false);
  assert.equal(ready(await readGit(unborn)).head, "main");
  const dir = repo(t);
  assert.equal(gitColor(await readGit(dir)), "mdLink");
  writeFileSync(join(dir, "tracked"), "edited\n");
  writeFileSync(join(dir, "staged"), "staged\n"); command(dir, ["add", "staged"]);
  writeFileSync(join(dir, "untracked"), "untracked\n");
  const state = ready(await readGit(dir));
  assert.equal(state.staged, 1); assert.equal(state.dirty, 1); assert.equal(state.untracked, 1);
  assert.equal(gitText(state), " main +1 !1 ?1");
  assert.equal(gitColor(state), "warning");
  assert.equal((await readGit(temporary(t))).kind, "none");
  assert.equal((await readGit(join(dir, "nonexistent"))).kind, "unknown");
});

test("all seven real unmerged index states are counted once as conflicts", async (t) => {
  const dir = repo(t);
  const hash = command(dir, ["hash-object", "-w", "--stdin"], "blob\n");
  const stages: Record<string, number[]> = { DD: [1], AU: [2], UD: [1, 2], UA: [3], DU: [1, 3], AA: [2, 3], UU: [1, 2, 3] };
  const input = Object.entries(stages).flatMap(([xy, values]) => {
    writeFileSync(join(dir, xy), "blob\n");
    return values.map((stage) => `100644 ${hash} ${stage}\t${xy}\n`);
  }).join("");
  command(dir, ["update-index", "--index-info"], input);
  const porcelain = command(dir, ["status", "--porcelain=v2", "-z", "--branch"]);
  const observed = porcelain.split("\0").filter((line) => line.startsWith("u ")).map((line) => line.slice(2, 4)).sort();
  assert.deepEqual(observed, Object.keys(stages).sort());
  const state = ready(await readGit(dir));
  assert.equal(state.conflicted, 7); assert.equal(state.staged, 0); assert.equal(state.dirty, 0);
  assert.equal(gitColor(state), "error");
});

test("real repository shows upstream divergence, stash, detached tag and commit", async (t) => {
  const dir = repo(t);
  command(dir, ["checkout", "-qb", "upstream"]);
  writeFileSync(join(dir, "remote"), "remote\n"); command(dir, ["add", "remote"]); command(dir, ["commit", "-qm", "remote"]);
  command(dir, ["checkout", "-q", "main"]);
  writeFileSync(join(dir, "local"), "local\n"); command(dir, ["add", "local"]); command(dir, ["commit", "-qm", "local"]);
  command(dir, ["branch", "--set-upstream-to=upstream"]);
  writeFileSync(join(dir, "tracked"), "stash\n"); command(dir, ["stash", "push", "-q"]);
  const state = ready(await readGit(dir));
  assert.equal(state.ahead, 1); assert.equal(state.behind, 1); assert.equal(state.stash, 1);
  assert.equal(gitColor(state), "mdLink");
  command(dir, ["tag", "v1"]); command(dir, ["checkout", "-q", "--detach"]);
  assert.equal(ready(await readGit(dir)).head, "#v1");
  command(dir, ["tag", "-d", "v1"]);
  assert.match(ready(await readGit(dir)).head, /^@[0-9a-f]{7}$/);
});

test("Git operations and rebase progress are detected, including linked worktrees", async (t) => {
  const dir = repo(t);
  const gitDir = join(dir, ".git");
  for (const [file, operation] of [["MERGE_HEAD", "merge"], ["CHERRY_PICK_HEAD", "cherry-pick"], ["REVERT_HEAD", "revert"], ["BISECT_LOG", "bisect"]]) {
    writeFileSync(join(gitDir, file), "test\n");
    assert.equal(await readOperation(gitDir), operation);
    rmSync(join(gitDir, file));
  }
  const rebase = join(gitDir, "rebase-merge"); mkdirSync(rebase);
  writeFileSync(join(rebase, "interactive"), ""); writeFileSync(join(rebase, "msgnum"), "2\n"); writeFileSync(join(rebase, "end"), "5\n");
  assert.equal(await readOperation(gitDir), "rebase-i 2/5");
  rmSync(rebase, { recursive: true });
  const worktree = join(temporary(t), "linked"); command(dir, ["worktree", "add", "-qb", "linked", worktree]);
  const worktreeGitDir = command(worktree, ["rev-parse", "--absolute-git-dir"]);
  writeFileSync(join(worktreeGitDir, "MERGE_HEAD"), command(dir, ["rev-parse", "HEAD"]));
  const state = ready(await readGit(worktree));
  assert.equal(state.operation, "merge"); assert.equal(gitColor(state), "error");
});

test("watcher serializes refresh and ignores results after disposal", async () => {
  let reads = 0, redraws = 0;
  const resolvers: Array<(state: GitState) => void> = [];
  const watcher = watchGit("/unused", () => redraws++, 60000, async () => {
    reads++; return await new Promise<GitState>((resolve) => resolvers.push(resolve));
  });
  watcher.refresh(); watcher.refresh();
  assert.equal(reads, 1);
  resolvers.shift()!({ kind: "none" });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reads, 2); assert.equal(redraws, 1);
  watcher.dispose();
  resolvers.shift()!(parseStatus("# branch.head main\0"));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(watcher.value.kind, "none"); assert.equal(redraws, 1);
  watcher.refresh(); assert.equal(reads, 2);
});
