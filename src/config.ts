import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type PathMode = "short" | "auto" | "full" | "native";
export interface FolderAlias { path: string; name: string }
export interface Config {
  mode: PathMode;
  icon: boolean;
  branch: boolean;
  session: boolean;
  aliases: FolderAlias[];
}
export const defaults = (): Config => ({ mode: "short", icon: true, branch: true, session: true, aliases: [] });

export function aliasName(value: string): string {
  const name = value.trim();
  if (!name || name === "~" || name === "." || name === ".." || /[/\\\x00-\x1f\x7f-\x9f]/u.test(value)) {
    throw new Error("Enter a nonempty name other than '~', '.', or '..'. Do not use slashes, backslashes, newlines, or control characters.");
  }
  return name;
}

export function folderPath(value: string, home = homedir()): string {
  const input = value.trim();
  if (!input || /[\x00-\x1f\x7f-\x9f]/u.test(input)) throw new Error("Enter a valid folder path.");
  const expanded = input === "~" ? home : input.startsWith("~/") ? join(home, input.slice(2)) : input;
  if (!isAbsolute(expanded)) throw new Error("Use an absolute path or a path starting with ~/.");
  const path = resolve(expanded);
  try {
    if (!statSync(path).isDirectory()) throw new Error();
  } catch { throw new Error("The folder does not exist, or the path is not a directory."); }
  return path;
}

export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The configuration must be a JSON object.");
  const data = value as Record<string, unknown>;
  const config = defaults();
  if (data.mode !== undefined) {
    if (!["short", "auto", "full", "native"].includes(data.mode as string)) throw new Error("Invalid path display mode.");
    config.mode = data.mode as PathMode;
  }
  for (const key of ["icon", "branch", "session"] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== "boolean") throw new Error(`${key} must be a boolean.`);
    config[key] = data[key];
  }
  if (data.aliases !== undefined) {
    if (!Array.isArray(data.aliases)) throw new Error("aliases must be an array.");
    const paths = new Set<string>();
    const names = new Set<string>();
    config.aliases = data.aliases.map((item: unknown) => {
      const alias = item as FolderAlias | undefined;
      if (!alias || typeof alias.path !== "string" || !isAbsolute(alias.path) || /[\x00-\x1f\x7f-\x9f]/u.test(alias.path) || typeof alias.name !== "string") {
        throw new Error("Invalid folder alias format.");
      }
      const path = resolve(alias.path);
      const name = aliasName(alias.name);
      if (paths.has(path) || names.has(name)) throw new Error("Folder paths and alias names must be unique.");
      paths.add(path); names.add(name);
      // Do not stat stored paths: a disconnected drive should not invalidate all settings.
      return { path, name };
    });
  }
  return config;
}

export class ConfigStore {
  readonly file: string;
  readonly legacyFile?: string;
  constructor(file: string, legacyFile?: string) { this.file = file; this.legacyFile = legacyFile; }
  load(): Config {
    let text: string;
    try { text = readFileSync(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.legacyFile ? new ConfigStore(this.legacyFile).load() : defaults();
      }
      throw error;
    }
    return validateConfig(JSON.parse(text));
  }
  update(change: (config: Config) => void): Config {
    // Read the latest disk state before each edit; preserve unrelated changes from other panes.
    const config = this.load();
    change(config);
    const next = validateConfig(config);
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      renameSync(temporary, this.file);
    } finally { rmSync(temporary, { force: true }); }
    return next;
  }
}

export function setAlias(config: Config, alias: FolderAlias, previousPath?: string): void {
  if (config.aliases.some((item) => item.path !== previousPath && (item.path === alias.path || item.name === alias.name))) {
    throw new Error("This path or name already has an alias. Edit it in Manage folder aliases.");
  }
  config.aliases = config.aliases.filter((item) => item.path !== previousPath);
  config.aliases.push(alias);
}
