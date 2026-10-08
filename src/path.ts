import { isAbsolute, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FolderAlias, PathMode } from "./config.ts";

export interface PathOptions {
  mode?: Exclude<PathMode, "native">;
  icon?: boolean;
  aliasName?: string;
  style?: { normal: (text: string) => string; alias: (text: string) => string; suffix?: (text: string) => string };
}

const clean = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const initial = (text: string) => segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? "";

export function homePath(cwd: string, home: string): string {
  const tail = relative(resolve(home), resolve(cwd));
  if (tail === "") return "~";
  if (tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail)) return `~/${tail.split(sep).join("/")}`;
  return cwd;
}

export function resolveDisplayPath(cwd: string, home: string, aliases: FolderAlias[]): { path: string; aliasName?: string } {
  const matches = aliases.map((alias) => ({ alias, tail: relative(resolve(alias.path), resolve(cwd)) }))
    .filter(({ tail }) => tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail))
    .sort((a, b) => b.alias.path.length - a.alias.path.length);
  const match = matches[0];
  return match
    ? { path: match.alias.name + (match.tail ? `/${match.tail.split(sep).join("/")}` : ""), aliasName: match.alias.name }
    : { path: homePath(cwd, home) };
}

export function displayPath(cwd: string, home: string, aliases: FolderAlias[]): string {
  return resolveDisplayPath(cwd, home, aliases).path;
}

/** Relative and named roots (including ~) have an icon; absolute roots do not. */
export function formatPath(path: string, width: number, options: PathOptions = {}): string {
  if (width <= 0) return "";
  path = clean(path);
  const absolute = isAbsolute(path);
  const icon = absolute || options.icon === false ? "" : "\uf07c ";
  const paint = (text: string, hasRoot = true) => {
    if (!options.style) return text;
    const { normal, alias } = options.style;
    const name = options.aliasName;
    if (!hasRoot || !name || (path !== name && !path.startsWith(name + "/"))) return normal(text);
    const start = icon.length;
    return normal(text.slice(0, start)) + alias(text.slice(start, start + name.length)) + normal(text.slice(start + name.length));
  };
  const full = icon + path;
  if (options.mode === "full") return truncateToWidth(paint(full), width, "…");
  if (options.mode === "auto" && visibleWidth(full) <= width) return paint(full);
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return truncateToWidth(paint(full), width, "…");
  const root = absolute ? "/" : parts.shift()! + "/";
  const leaf = parts.pop()!;
  const shortened = icon + root + [...parts.map(initial), leaf].join("/");
  if (visibleWidth(shortened) <= width) return paint(shortened);
  const collapsed = icon + root + (parts.length ? "…/" : "") + leaf;
  if (visibleWidth(collapsed) <= width) return paint(collapsed);
  // At very small widths preserve the directory name before the root or icon.
  if (visibleWidth(leaf) <= width) return paint(leaf, false);
  return truncateToWidth(paint(leaf, false), width, "…");
}

export function directoryLine(path: string, suffix: string, width: number, options: PathOptions = {}): string {
  if (width <= 0) return "";
  suffix = clean(suffix);
  // Reserve at least half of the line for the path. Trim branch/session first.
  const tail = truncateToWidth(suffix, Math.floor(width / 2), "…");
  const styledTail = options.style?.suffix
    ? truncateToWidth(options.style.suffix(suffix), Math.floor(width / 2), "…")
    : options.style ? options.style.normal(tail) : tail;
  return truncateToWidth(formatPath(path, width - visibleWidth(tail), options) + styledTail, width, "…");
}
