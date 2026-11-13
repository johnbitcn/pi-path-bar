# Changelog

## [0.4.0]

- Reading mode now loads automatically with pi-path-bar. Hide the editor and footer while keeping conversation and tool output visible.
- Toggle with `Alt+Esc` (Option+Esc on Mac) or `/reading-mode`; press `Esc` to restore the interface. Requires Pi 1.5 or later in fullscreen mode and a compatible terminal.
- When upgrading from the standalone version, remove `-e ./src/reading-mode.ts` from your launch command to avoid loading it twice.

## [0.3.0]

- Add an experimental reading mode that hides the editor and footer while keeping conversation and tool output visible. Load it separately with `pi -e ./src/reading-mode.ts`. Use `Alt+Esc` (Option+Esc on Mac) to toggle, or `/reading-mode` to enter. Press `Esc` to restore the interface. Requires fullscreen mode and a compatible terminal.
- Simplify the English and Chinese READMEs and add SVG previews that display without installing a Nerd Font.
- Include this changelog so Pi 1.5 and later can show package update notes on startup.
