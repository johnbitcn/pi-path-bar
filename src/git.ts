import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface GitCounts { behind: number; ahead: number; stash: number; conflicted: number; staged: number; dirty: number; untracked: number }
export interface ReadyGit extends GitCounts { kind: "ready"; head: string; detached: boolean; oid: string; operation?: string }
export type GitState = ReadyGit | { kind: "none" } | { kind: "unknown" };
export type GitColor = "text" | "mdLink" | "warning" | "error";
const conflicts = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);
const safe = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, "");

/** Parse NUL-delimited porcelain v2 without interpreting filenames as records. */
export function parseStatus(output: string): ReadyGit {
  const result: ReadyGit = { kind: "ready", head: "", detached: false, oid: "", behind: 0, ahead: 0, stash: 0, conflicted: 0, staged: 0, dirty: 0, untracked: 0 };
  const records = output.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.startsWith("# branch.head ")) {
      result.head = record.slice(14); result.detached = result.head === "(detached)";
    } else if (record.startsWith("# branch.oid ")) result.oid = record.slice(13);
    else if (record.startsWith("# branch.ab ")) {
      const counts = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
      if (counts) { result.ahead = Number(counts[1]); result.behind = Number(counts[2]); }
    } else if (record.startsWith("# stash ")) result.stash = Number(record.slice(8)) || 0;
    else if (record.startsWith("? ")) result.untracked++;
    else if (/^[12u] /.test(record)) {
      const xy = record.slice(2, 4);
      if (record[0] === "u" || conflicts.has(xy)) result.conflicted++;
      else {
        if (xy[0] !== ".") result.staged++;
        if (xy[1] !== ".") result.dirty++;
      }
      if (record[0] === "2") i++; // A rename/copy has a separate original-path record.
    }
  }
  if (!result.head) throw new Error("Missing Git branch header");
  return result;
}

export function gitColor(state: GitState): GitColor {
  if (state.kind !== "ready") return "text";
  if (state.operation || state.conflicted) return "error";
  if (state.staged || state.dirty || state.untracked) return "warning";
  return "mdLink";
}

export function gitText(state: GitState, fallbackBranch?: string): string {
  if (state.kind === "none") return "";
  if (state.kind === "unknown") return ` ${fallbackBranch ? safe(fallbackBranch) + " " : ""}?`;
  const parts = [` ${safe(state.head)}`];
  if (state.operation) parts.push(state.operation);
  for (const [key, symbol] of [["behind", "⇣"], ["ahead", "⇡"], ["stash", "*"], ["conflicted", "~"], ["staged", "+"], ["dirty", "!"], ["untracked", "?"]] as const) {
    if (state[key]) parts.push(symbol + state[key]);
  }
  return parts.join(" ");
}

interface CommandResult { stdout: string; stderr: string; code: number }
function git(cwd: string, args: string[], signal?: AbortSignal): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile("git", ["--no-optional-locks", "-C", cwd, ...args], {
      encoding: "utf8", timeout: 3000, maxBuffer: 8 * 1024 * 1024, signal,
      env: { ...process.env, LC_ALL: "C", GIT_TERMINAL_PROMPT: "0" },
    }, (error, stdout, stderr) => resolve({ stdout, stderr, code: error ? (typeof error.code === "number" ? error.code : -1) : 0 }));
  });
}
async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function text(path: string): Promise<string> {
  try { return (await readFile(path, "utf8")).trim(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
export async function readOperation(gitDir: string): Promise<string | undefined> {
  for (const directory of ["rebase-merge", "rebase-apply"]) {
    if (!await exists(join(gitDir, directory))) continue;
    const base = join(gitDir, directory);
    const name = directory === "rebase-merge"
      ? (await exists(join(base, "interactive")) ? "rebase-i" : "rebase-m")
      : await exists(join(base, "rebasing")) ? "rebase" : await exists(join(base, "applying")) ? "am" : "am/rebase";
    const step = await text(join(base, directory === "rebase-merge" ? "msgnum" : "next"));
    const total = await text(join(base, directory === "rebase-merge" ? "end" : "last"));
    return name + (/^\d+$/.test(step) && /^\d+$/.test(total) ? ` ${step}/${total}` : "");
  }
  for (const [file, name] of [["MERGE_HEAD", "merge"], ["CHERRY_PICK_HEAD", "cherry-pick"], ["REVERT_HEAD", "revert"], ["BISECT_LOG", "bisect"]]) {
    if (await exists(join(gitDir, file))) return name;
  }
  // A multi-commit cherry-pick/revert can be between commits with no *_HEAD file.
  if (await exists(join(gitDir, "sequencer"))) {
    const todo = await text(join(gitDir, "sequencer", "todo"));
    return todo.startsWith("revert ") ? "revert" : "cherry-pick";
  }
  return undefined;
}

export async function readGit(cwd: string, signal?: AbortSignal): Promise<GitState> {
  try {
    const directory = await git(cwd, ["rev-parse", "--absolute-git-dir"], signal);
    if (directory.code !== 0) return { kind: directory.stderr.includes("not a git repository") ? "none" : "unknown" };
    const status = await git(cwd, ["status", "--porcelain=v2", "-z", "--branch", "--show-stash", "--untracked-files=normal"], signal);
    if (status.code !== 0) return { kind: "unknown" };
    const result = parseStatus(status.stdout);
    const gitDir = directory.stdout.trimEnd();
    result.operation = await readOperation(gitDir);
    if (result.detached) {
      const tag = await git(cwd, ["describe", "--tags", "--exact-match", "HEAD"], signal);
      result.head = tag.code === 0 ? `#${tag.stdout.trimEnd()}` : `@${result.oid.slice(0, 7)}`;
    }
    return result;
  } catch { return { kind: "unknown" }; }
}

/** One query at a time. Disposal aborts children and suppresses late results. */
export function watchGit(cwd: string, changed: () => void, intervalMs = 5000, read = readGit) {
  let value: GitState = { kind: "unknown" };
  let stopped = false, running = false, queued = false;
  const controller = new AbortController();
  const refresh = async () => {
    if (stopped) return;
    if (running) { queued = true; return; }
    running = true;
    try {
      const next = await read(cwd, controller.signal).catch(() => ({ kind: "unknown" } as GitState));
      if (!stopped && JSON.stringify(next) !== JSON.stringify(value)) { value = next; changed(); }
    } finally {
      running = false;
      if (queued && !stopped) { queued = false; void refresh(); }
    }
  };
  const timer = setInterval(() => { void refresh(); }, intervalMs);
  timer.unref();
  void refresh();
  return {
    get value() { return value; },
    refresh: () => { void refresh(); },
    dispose: () => { stopped = true; clearInterval(timer); controller.abort(); },
  };
}
