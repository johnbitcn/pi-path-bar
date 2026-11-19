import { stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";

/** Footer segment ids: a plugin shows up by calling setStatus("path-bar:<id>", text). */
export const SEGMENT_KEY = /^path-bar:([a-z0-9][a-z0-9._-]{0,31})$/;
export const SEGMENT_ID = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export const CLOCK = "clock";

/** Keep every segment on one line; control separators would break the footer layout. */
export const segmentText = (text: string) => text.replace(/[\r\n\t]/g, " ");

export type SlotSource = "segment" | "adapted";
export interface SlotEntry { id: string; text: string; source: SlotSource }
export interface ExtensionAdapter {
  readonly key: string;
  readonly id: string;
  format(text: string): string | undefined;
}
export interface ClassifiedStatuses {
  /** Type 1 (adapted) and Type 2 (path-bar:*) slots before hidden filtering. */
  slots: Map<string, SlotEntry>;
  /** Type 3 (unknown extensions), sorted alphabetically by status key. */
  unknown: Array<[string, string]>;
}

const LEADING_SGR = /^((?:\x1b\[[0-9;]*m)+)/;
const ANSI_TOKEN = /\x1b\[[0-9;]*m/g;
const RESET_SGR = /^\x1b\[(?:0|22|39|22;39|39;22)?m$/;

function extractColorPrefix(segment: string): string | undefined {
  const match = LEADING_SGR.exec(segment.trimStart());
  if (!match) return undefined;
  // Ignore bare reset codes (`\x1b[0m`, `\x1b[39m`, `\x1b[22;39m`, etc.) that carry no foreground color.
  const codes = match[1].match(ANSI_TOKEN) ?? [];
  const active = codes.filter((code) => !RESET_SGR.test(code));
  return active.length ? active.join("") : undefined;
}

function preserveColor(original: string, compact: string): string {
  const prefix = extractColorPrefix(original);
  return prefix ? `${prefix}${compact}\x1b[0m` : compact;
}

const PI_USAGE_SHORT_LABELS: Record<string, string> = {
  "7d-son": "7s",
  "7d-opus": "7o",
  "daily": "1d",
  "weekly": "7d",
  "week": "7d",
  "monthly": "mo",
  "premium": "pm",
  "chat": "ch",
  "comp": "cp",
  "cap": "cap",
  "credits": "cr",
  "extra": "ex",
  "budget": "bg",
  "search": "sr",
  "tools": "tl",
};

function shortResetUnit(rawReset: string): string {
  const trimmed = rawReset.trim();
  if (/^now$/i.test(trimmed)) return "now";
  const unit = /(\d+[dhms])/i.exec(trimmed);
  return unit ? unit[1].toLowerCase() : trimmed;
}

function formatPiUsageStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/^usage unavailable$/i.test(plainAll)) return preserveColor(text, "u?");

  // Split into per-window chunks starting at `<optional-ansi><label>:` so each window keeps its own color.
  const windowHeader = /(?:^|\s)((?:\x1b\[[0-9;]*m)*[^\s\x1b:]+(?:\x1b\[[0-9;]*m)*:)/g;
  const starts: number[] = [];
  for (const match of text.matchAll(windowHeader)) {
    const start = (match.index ?? 0) + (match[0].length - match[1].length);
    starts.push(start);
  }
  if (!starts.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));

  interface ParsedWindow {
    index: number;
    limited: boolean;
    remainingScore: number;
    rendered: string;
  }

  const parsed: ParsedWindow[] = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i], starts[i + 1] ?? text.length).trim();
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const rawLabel = chunk.slice(0, colon);
    const rawRest = chunk.slice(colon + 1);

    const label = stripTerminalSequences(rawLabel).trim();
    const shortLabel = PI_USAGE_SHORT_LABELS[label] ?? label;
    const color = extractColorPrefix(rawRest) ?? extractColorPrefix(rawLabel);

    let restPlain = stripTerminalSequences(rawRest).trim();
    const resetMatch = /\(↺(?:in\s+)?([^)]+)\)/.exec(restPlain);
    const resetUnit = resetMatch ? shortResetUnit(resetMatch[1]) : undefined;
    if (resetMatch) restPlain = restPlain.replace(resetMatch[0], "").trim();

    const hasBang = /(?:^|\s)!(?:\s|$)/.test(restPlain);
    if (hasBang) restPlain = restPlain.replace(/(?:^|\s)!(?:\s|$)/g, " ").trim();

    let value = restPlain
      .replace(/\s+left$/i, "")
      .replace(/\s+used$/i, "")
      .replace(/\$(\d+)\.00\b/g, "$$$1")
      .trim();

    const reached = /^REACHED$/i.test(value);
    if (reached) value = "MAX";

    const pctMatch = /^(\d+(?:\.\d+)?)%$/.exec(value);
    const countMatch = /^(\d+)\/(\d+)$/.exec(value);
    let remainingScore = 100;
    if (pctMatch) remainingScore = Number(pctMatch[1]);
    else if (countMatch && Number(countMatch[2]) > 0) remainingScore = (Number(countMatch[1]) / Number(countMatch[2])) * 100;
    else if (reached) remainingScore = 0;

    const limited = hasBang || reached || remainingScore <= 0;
    const compact = `${shortLabel}:${value}${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`;
    const rendered = color ? `${color}${compact}\x1b[0m` : compact;
    parsed.push({ index: i, limited, remainingScore, rendered });
  }

  if (!parsed.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));
  const chosen = parsed.length <= 2
    ? parsed
    : [...parsed]
        .sort((a, b) => Number(b.limited) - Number(a.limited) || a.remainingScore - b.remainingScore || a.index - b.index)
        .slice(0, 2)
        .sort((a, b) => a.index - b.index);
  return chosen.map((item) => item.rendered).join(" ");
}

function compactDollar(raw: string): string {
  const value = Number(raw.replace(/[$,]/g, ""));
  if (!Number.isFinite(value)) return raw;
  if (value === 0) return "$0";
  if (value >= 10) return `$${Math.round(value)}`;
  if (value >= 0.1) return `$${value.toFixed(1).replace(/\.0$/, "")}`;
  return raw;
}

function formatPiUsageTokenStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/^token tracking unavailable$/i.test(plainAll)) return preserveColor(text, "tok?");

  const segments = text.split(/\s*·\s*/);
  const formatted: string[] = [];
  for (const part of segments) {
    const plain = stripTerminalSequences(part).trim();
    const dollar = /\$[\d.,]+/.exec(plain)?.[0];
    if (!dollar) continue;
    const compact = compactDollar(dollar);
    const color = extractColorPrefix(part);
    formatted.push(color ? `${color}${compact}\x1b[0m` : compact);
  }
  if (!formatted.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));
  return formatted.join("/");
}

/** Built-in Type 1 adapters that compress known third-party statuses for the top border. */
export const ADAPTED_EXTENSIONS: readonly ExtensionAdapter[] = [
  {
    key: "pi-usage",
    id: "pi-usage",
    format: formatPiUsageStatus,
  },
  {
    key: "pi-usage-token-status",
    id: "pi-usage-token-status",
    format: formatPiUsageTokenStatus,
  },
  {
    key: "ssh",
    id: "ssh",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const body = plain.replace(/^ssh:\s*/i, "");
      const remote = body.split(":")[0] ?? body;
      const host = remote.includes("@") ? remote.slice(remote.indexOf("@") + 1) : remote;
      const label = host.trim() || plain;
      return preserveColor(text, truncateToWidth(`ssh:${label}`, 14, "…"));
    },
  },
  {
    key: "preset",
    id: "preset",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const name = plain.replace(/^preset:\s*/i, "").trim();
      return preserveColor(text, truncateToWidth(`P:${name || plain}`, 12, "…"));
    },
  },
  {
    key: "usage",
    id: "usage",
    format(text) {
      const plain = stripTerminalSequences(text).replace(/\bleft\b/gi, "").replace(/\s+/g, " ").trim();
      if (!plain) return undefined;
      return preserveColor(text, truncateToWidth(plain, 14, "…"));
    },
  },
  {
    key: "debug-provider",
    id: "debug-provider",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      return plain ? preserveColor(text, "dbg") : undefined;
    },
  },
  {
    key: "provider-debug",
    id: "debug-provider",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      return plain ? preserveColor(text, "dbg") : undefined;
    },
  },
  {
    key: "ponytail",
    id: "ponytail",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const modeMatch = /\b(ULTRA|FULL|LITE|OFF)\b/i.exec(plain);
      const modeWord = modeMatch?.[1]?.toUpperCase();
      if (modeWord === "OFF") return preserveColor(text, "♘-");
      const level = modeWord
        ? modeWord[0]
        : (/([A-Za-z]+)\s*$/.exec(plain)?.[1]?.[0]?.toUpperCase() ?? "");
      if (!level) return undefined;
      const inactive = /[○◯◌]/.test(plain);
      const active = /[●◉◆✓✔]/.test(plain);
      const horse = active ? "♞" : inactive ? "♘" : "♞";
      return preserveColor(text, `${horse}${level}`);
    },
  },
];

export function segmentEntries(statuses: ReadonlyMap<string, string>): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, text] of statuses) {
    const id = SEGMENT_KEY.exec(key)?.[1];
    if (id) entries.set(id, segmentText(text));
  }
  return entries;
}

/**
 * Split extension statuses into three tiers for Minimal mode:
 * - Type 2: explicit `path-bar:<id>` segments (highest priority; suppresses matching Type 1 key)
 * - Type 1: known third-party statuses compressed by built-in adapters
 * - Type 3: unknown extensions rendered on the auto-hiding line below the bottom border
 */
export function classifyStatuses(
  statuses: ReadonlyMap<string, string>,
  adapters: readonly ExtensionAdapter[] = ADAPTED_EXTENSIONS,
): ClassifiedStatuses {
  const slots = new Map<string, SlotEntry>();
  const remaining: Array<[string, string]> = [];
  for (const [key, raw] of statuses) {
    const text = segmentText(raw);
    const id = SEGMENT_KEY.exec(key)?.[1];
    if (id) {
      slots.set(id, { id, text, source: "segment" });
    } else {
      remaining.push([key, text]);
    }
  }
  const byKey = new Map(adapters.map((adapter) => [adapter.key, adapter]));
  const unknown: Array<[string, string]> = [];
  for (const [key, text] of remaining) {
    const adapter = byKey.get(key);
    if (adapter) {
      // Explicit Type 2 registration wins and suppresses the legacy key so it does not duplicate below.
      if (slots.has(adapter.id)) continue;
      const formatted = adapter.format(text);
      if (formatted) {
        slots.set(adapter.id, { id: adapter.id, text: segmentText(formatted), source: "adapted" });
        continue;
      }
    }
    unknown.push([key, text]);
  }
  unknown.sort(([a], [b]) => a.localeCompare(b));
  return { slots, unknown };
}

/**
 * Left-to-right order of the segments right of the path. The configured order wins; ids that
 * are registered but not configured go left of the clock, sorted by id.
 */
export function resolveOrder(segments: string[], registered: Iterable<string>): string[] {
  const known = new Set([CLOCK, ...registered]);
  const listed = [...new Set(segments)].filter((id) => known.has(id));
  if (!listed.includes(CLOCK)) listed.push(CLOCK);
  const at = listed.indexOf(CLOCK);
  const unknown = [...known].filter((id) => !listed.includes(id)).sort((a, b) => a.localeCompare(b));
  return [...listed.slice(0, at), ...unknown, ...listed.slice(at)];
}
