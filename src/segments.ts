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
function preserveColor(original: string, compact: string): string {
  const prefix = LEADING_SGR.exec(original)?.[1];
  return prefix ? `${prefix}${compact}\x1b[0m` : compact;
}

/** Built-in Type 1 adapters that compress known third-party statuses for the top border. */
export const ADAPTED_EXTENSIONS: readonly ExtensionAdapter[] = [
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
 * - Type 2: explicit `path-bar:<id>` segments (highest priority)
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
    if (adapter && !slots.has(adapter.id)) {
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
