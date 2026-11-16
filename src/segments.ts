/** Footer segment ids: a plugin shows up by calling setStatus("path-bar:<id>", text). */
export const SEGMENT_KEY = /^path-bar:([a-z0-9][a-z0-9._-]{0,31})$/;
export const SEGMENT_ID = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export const CLOCK = "clock";

/** Keep every segment on one line; control separators would break the footer layout. */
export const segmentText = (text: string) => text.replace(/[\r\n\t]/g, " ");

export function segmentEntries(statuses: ReadonlyMap<string, string>): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, text] of statuses) {
    const id = SEGMENT_KEY.exec(key)?.[1];
    if (id) entries.set(id, segmentText(text));
  }
  return entries;
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
