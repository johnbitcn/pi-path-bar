import { isAbsolute, relative, resolve, sep } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FolderAlias, PathMode } from "./config.ts";

export interface PathOptions { mode?: Exclude<PathMode, "native">; icon?: boolean }

const clean = (text: string) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const initial = (text: string) => segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? "";

export function homePath(cwd: string, home: string): string {
  const tail = relative(resolve(home), resolve(cwd));
  if (tail === "") return "~";
  if (tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail)) return `~/${tail.split(sep).join("/")}`;
  return cwd;
}

export function displayPath(cwd: string, home: string, aliases: FolderAlias[]): string {
  const matches = aliases.map((alias) => ({ alias, tail: relative(resolve(alias.path), resolve(cwd)) }))
    .filter(({ tail }) => tail !== ".." && !tail.startsWith(`..${sep}`) && !isAbsolute(tail))
    .sort((a, b) => b.alias.path.length - a.alias.path.length);
  const match = matches[0];
  return match ? match.alias.name + (match.tail ? `/${match.tail.split(sep).join("/")}` : "") : homePath(cwd, home);
}

/** Relative and named roots (including ~) have an icon; absolute roots do not. */
export function formatPath(path: string, width: number, options: PathOptions = {}): string {
  if (width <= 0) return "";
  path = clean(path);
  const absolute = isAbsolute(path);
  const icon = absolute || options.icon === false ? "" : "\uf07c ";
  const full = icon + path;
  if (options.mode === "full") return truncateToWidth(full, width, "…");
  if (options.mode === "auto" && visibleWidth(full) <= width) return full;
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 2) return truncateToWidth(full, width, "…");
  const root = absolute ? "/" : parts.shift()! + "/";
  const leaf = parts.pop()!;
  const shortened = icon + root + [...parts.map(initial), leaf].join("/");
  if (visibleWidth(shortened) <= width) return shortened;
  const collapsed = icon + root + (parts.length ? "…/" : "") + leaf;
  if (visibleWidth(collapsed) <= width) return collapsed;
  // At very small widths preserve the directory name before the root or icon.
  if (visibleWidth(leaf) <= width) return leaf;
  return truncateToWidth(leaf, width, "…");
}

export function directoryLine(path: string, suffix: string, width: number, options: PathOptions = {}): string {
  if (width <= 0) return "";
  suffix = clean(suffix);
  // Reserve at least half of the line for the path. Trim branch/session first.
  const tail = truncateToWidth(suffix, Math.floor(width / 2), "…");
  return truncateToWidth(formatPath(path, width - visibleWidth(tail), options) + tail, width, "…");
}
