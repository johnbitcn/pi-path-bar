# Changelog

## [0.5.2]

- In Minimal mode, `billion-context` subagent token usage appears next to session usage on the top border. It no longer repeats below the editor and is hidden when space is tight.

## [0.5.1]

- Adapted for Pi 1.6.0.

## [0.5.0]

- **Minimal mode (enabled by default):** Reclaim vertical space by removing the multi-line footer and placing your path, Git status, usage, model, context, and local time cleanly on the editor's top and bottom borders. Built for small screens and narrow splits, with automatic progressive compacting, `+N` overflow folding, and jitter-free running status. Turn it off anytime in `/path-bar` to use the classic multi-line footer or Pi's native footer.
- **Reorder and hide items:** Open **Footer order** in `/path-bar` to move right-side items (including the clock and other extensions) or press `Space` to hide what you do not need.
- **Cleaner extension coexistence:** Popular usage and status extensions stay compact on the top border automatically; other extension messages appear below only while active and hide when empty.
- **Updated preview and docs:** Refreshed the package preview and READMEs around Minimal mode and Reading mode.
- **Tip:** Want another extension adapted for `pi-path-bar`? Feel free to [open an issue](https://github.com/johnbitcn/pi-path-bar/issues), or ask your AI assistant to add `pi-path-bar` registration to your extension using the [footer segments guide](https://github.com/johnbitcn/pi-path-bar/blob/main/docs/footer-segments.md).

## [0.4.2]

- Add a Pi Plugins preview image and the `pi.image` metadata for the package listing.
- Include PNG and standalone SVG preview assets showing the compact footer, folder aliases, Git status, and reading mode shortcut.

## [0.4.0]

- Reading mode now loads automatically with pi-path-bar. Hide the editor and footer while keeping conversation and tool output visible.
- Toggle with `Alt+Esc` (Option+Esc on Mac) or `/reading-mode`; press `Esc` to restore the interface. Requires Pi 1.5 or later in fullscreen mode and a compatible terminal.
- When upgrading from the standalone version, remove `-e ./src/reading-mode.ts` from your launch command to avoid loading it twice.

## [0.3.0]

- Add an experimental reading mode that hides the editor and footer while keeping conversation and tool output visible. Load it separately with `pi -e ./src/reading-mode.ts`. Use `Alt+Esc` (Option+Esc on Mac) to toggle, or `/reading-mode` to enter. Press `Esc` to restore the interface. Requires fullscreen mode and a compatible terminal.
- Simplify the English and Chinese READMEs and add SVG previews that display without installing a Nerd Font.
- Include this changelog so Pi 1.5 and later can show package update notes on startup.
