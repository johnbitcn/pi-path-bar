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
    throw new Error("名称不能为空，也不能是 ~、.、.. 或包含斜杠、换行、控制字符。");
  }
  return name;
}

export function folderPath(value: string, home = homedir()): string {
  const input = value.trim();
  if (!input || /[\x00-\x1f\x7f-\x9f]/u.test(input)) throw new Error("请输入有效的文件夹路径。");
  const expanded = input === "~" ? home : input.startsWith("~/") ? join(home, input.slice(2)) : input;
  if (!isAbsolute(expanded)) throw new Error("请使用绝对路径或 ~/ 开头的路径。");
  const path = resolve(expanded);
  try {
    if (!statSync(path).isDirectory()) throw new Error();
  } catch { throw new Error("文件夹不存在，或该路径不是文件夹。"); }
  return path;
}

export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("配置必须是 JSON 对象。");
  const data = value as Record<string, unknown>;
  const config = defaults();
  if (data.mode !== undefined) {
    if (!["short", "auto", "full", "native"].includes(data.mode as string)) throw new Error("路径显示模式无效。");
    config.mode = data.mode as PathMode;
  }
  for (const key of ["icon", "branch", "session"] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== "boolean") throw new Error(`${key} 必须是布尔值。`);
    config[key] = data[key];
  }
  if (data.aliases !== undefined) {
    if (!Array.isArray(data.aliases)) throw new Error("aliases 必须是数组。");
    const paths = new Set<string>();
    const names = new Set<string>();
    config.aliases = data.aliases.map((item: unknown) => {
      const alias = item as FolderAlias | undefined;
      if (!alias || typeof alias.path !== "string" || !isAbsolute(alias.path) || /[\x00-\x1f\x7f-\x9f]/u.test(alias.path) || typeof alias.name !== "string") {
        throw new Error("目录别名格式无效。");
      }
      const path = resolve(alias.path);
      const name = aliasName(alias.name);
      if (paths.has(path) || names.has(name)) throw new Error("目录路径和别名名称不能重复。");
      paths.add(path); names.add(name);
      // Do not stat stored paths: a disconnected drive should not invalidate all settings.
      return { path, name };
    });
  }
  return config;
}

export class ConfigStore {
  readonly file: string;
  constructor(file: string) { this.file = file; }
  load(): Config {
    let text: string;
    try { text = readFileSync(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults();
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
    throw new Error("该路径或名称已有别名。请在“管理目录别名”中修改。");
  }
  config.aliases = config.aliases.filter((item) => item.path !== previousPath);
  config.aliases.push(alias);
}
