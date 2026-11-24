# Footer segments

Other Pi extensions can add text to the right of the path line. A segment is a status key with the `path-bar:` prefix:

```ts
ctx.ui.setStatus("path-bar:net", theme.fg("dim", "⌁"));
ctx.ui.setStatus("path-bar:net", undefined); // remove it
```

- An id uses `a-z`, `0-9`, `.`, `_`, and `-`, starts with a letter or digit, and is 1 to 32 characters long. Uppercase is not accepted.
- Unrecognized keys and invalid ids stay in the status line below the path. In Minimal mode, recognized `billion-context` usage moves to the upper-left telemetry block rather than a segment on the right.
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

Users can press `Space` in **Footer order** to hide any `path-bar:<id>` segment, built-in adapted extension (`pi-usage`, `pi-usage-token-status`, `usage`, `pi-usage-bars`, `provider-usage`, `quota`, `ponytail`, `ssh`, `preset`, `debug-provider`), or `clock`, and use `<` / `>` (or `,` / `.`) to move any item including `clock` to any position. Explicit `path-bar:<id>` registrations always take precedence over built-in adapters with the same id and suppress the legacy key so it is not duplicated below the bottom border (for example, `path-bar:pi-usage-bars` overrides `@hk_net/pi-usage-bars`, and `path-bar:quota` overrides `00-quota`). Hidden ids are persisted in `hiddenSegments`; in Minimal mode, hidden adapted extensions do not fall back to the unknown-extension row.

Built-in usage adapters cover `@kaishin/pi-usage` (`pi-usage`, `pi-usage-token-status`), `@narumitw/pi-usage` (`usage`), `@hk_net/pi-usage-bars` (`pi-usage-bars`), `@sreetej510/pi-usage` / `@subaud-tools/pi-usage` (`provider-usage`), and `@cad0p/pi-usage` (`quota`). `@tmustier/pi-usage-extension` only opens a `/usage` dialog and does not call `setStatus`, so no adapter is needed.

## Files

| File | Role |
| --- | --- |
| `src/segments.ts` | Key grammar, three-tier status classification, built-in adapters, `resolveOrder()` |
| `src/minimal.ts` | Minimal border formatters, `+N` slot packing, and `MinimalEditor` |
| `src/index.ts` | Standard footer, Minimal footer, and editor lifecycle |
| `src/settings.ts` | Settings menu and Footer order / visibility screen |
