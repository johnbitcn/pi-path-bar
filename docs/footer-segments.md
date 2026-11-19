# Footer segments

Other Pi extensions can add text to the right of the path line. A segment is a status key with the `path-bar:` prefix:

```ts
ctx.ui.setStatus("path-bar:net", theme.fg("dim", "⌁"));
ctx.ui.setStatus("path-bar:net", undefined); // remove it
```

- An id uses `a-z`, `0-9`, `.`, `_`, and `-`, starts with a letter or digit, and is 1 to 32 characters long. Uppercase is not accepted.
- A key without the prefix, or with an invalid id, stays in the status line below the path.
- The text stays on one line: `\r`, `\n`, and `\t` become spaces.
- The extension keeps its own colors. Only the separators are dim.
- Calling `setStatus` with `undefined` removes the segment.

## Order

`resolveOrder()` in `src/segments.ts` builds the row, left to right:

1. Ids from `segments` in the config file, in that order. `clock` is the built-in local time.
2. Registered ids missing from `segments`, sorted by id, inserted left of `clock`.
3. `clock` appended last when the config does not list it.

Configured ids that no extension registered are kept in the config, so uninstalling an extension does not lose the order.

## Dropping & hiding

When the row does not fit, the rightmost segment is dropped, then the row is measured again (in Minimal mode, dropped slots fold into a `+N` badge). Order decides priority: a segment moved to the left survives longer.

Users can press `Space` in **Footer order** to hide any `path-bar:<id>` segment, built-in adapted extension (`ponytail`, `ssh`, `preset`, `usage`, `debug-provider`), or `clock`. Hidden ids are persisted in `hiddenSegments`. In Minimal mode, hidden adapted extensions do not fall back to the unknown-extension row below the bottom border.

## Files

| File | Role |
| --- | --- |
| `src/segments.ts` | Key grammar, three-tier status classification, built-in adapters, `resolveOrder()` |
| `src/minimal.ts` | Minimal border formatters, `+N` slot packing, and `MinimalEditor` |
| `src/index.ts` | Standard footer, Minimal footer, and editor lifecycle |
| `src/settings.ts` | Settings menu and Footer order / visibility screen |
