# pi-path-bar

English | [简体中文](README.zh-CN.md)

A Pi extension for a compact footer and focused reading. Shows paths, folder aliases, Git status, and local time. Keeps usage statistics, model information, and other extension status lines.

![Path bar examples with compact paths, aliases and Git status](assets/footer-preview.svg)

## Installation

```sh
pi install npm:pi-path-bar
```

Or install from GitHub:

```sh
pi install git:github.com/johnbitcn/pi-path-bar
```

In an existing Pi session, run `/reload`, then `/path-bar` to open settings.

Load only one copy of the extension. Folder icons require a Nerd Font, or you can turn them off in settings.

## Settings

Run `/path-bar`. Use the arrow keys to select an item, Enter or Space to change it, and Esc to exit. Changes apply immediately and are saved automatically. The menu uses English.

| Setting | Default | Choices |
| --- | --- | --- |
| Path display | Short | Short, Auto, Full, Native footer |
| Minimal mode | On | On, Off |
| Folder icon | On | On, Off |
| Git status | On | On, Off |
| Session name | On | On, Off |
| Time format | 24h | 24h, 12h (AM/PM) |
| Footer order | — | Reorder or hide segments and clock |
| Add folder alias | — | Enter a folder path and a name |
| Manage folder aliases | — | Edit or delete aliases |

- **Short:** abbreviate intermediate folders and keep the final folder name.
- **Auto:** show the full path when space allows; otherwise abbreviate it.
- **Full:** do not abbreviate; truncate if needed.
- **Native footer:** restore Pi's built-in footer without losing your settings.

Local time appears at the right of the path line. The home directory is shown as `~`. Unicode folder names are supported.

## Minimal mode

**Minimal mode** is enabled by default. It hides the footer rows and moves compact status onto the top and bottom borders of the editor. Turn it off in `/path-bar` to restore the multi-line footer (or Native footer).

- **Top border (left):** fixed 5-column spinner slot while running (zero-jitter alignment with idle), followed by compact token usage, cache hit rate, cost, and session name. Rare long notices (retry, compaction, branch summary) temporarily take over this area.
- **Top border (right):** registered `path-bar:*` segments (highest priority), built-in adapted extensions (`pi-usage`, `pi-usage-token-status`, `ponytail`, `ssh`, `preset`, `usage`, `debug-provider`), and local time (`clock`, reorderable). Overflowing slots fold into a `+N` badge.
- **Bottom border (left):** compact path (with aliases) and Git status.
- **Bottom border (right):** shortened model name, thinking level, and context usage (`◐42%/200k`, dropping `/200k` on narrow screens).
- **Unknown extensions:** other extension statuses appear on a single line below the bottom border only when active, and hide automatically when empty.

## Footer order

Other Pi extensions can show extra text at the right of the path line (or top-right border in Minimal mode). New segments appear left of the time.

Choose **Footer order** in `/path-bar` to set order and visibility. Use `up` / `down` to select an item, `<` / `>` (or `,` / `.`) to move it, `Space` to show or hide it (including `clock`, registered `path-bar:*` segments, and built-in adapted extensions), and `Enter` or `Esc` to close.

Move a segment left to keep it visible on narrow terminals: they drop segments from the right (folding into `+N` in Minimal mode). Order is stored in `segments` and hidden items in `hiddenSegments` in the config file.

Extension authors: see [footer segments](https://github.com/johnbitcn/pi-path-bar/blob/main/docs/footer-segments.md).

## Folder aliases

Choose **Add folder alias**, then enter a folder path and a display name. Use an absolute path or `~/`, or leave the path blank for the current directory.

For example, name `~/CloudDrive/Projects/demo-app` **demo**:

![Folder alias shown as demo and demo/src](assets/folder-alias-preview.svg)

- An alias applies to its folder and descendants. If several aliases match, the longest path wins.
- Use **Manage folder aliases** to edit or delete them. Leave a field blank to keep its value; Esc cancels.
- Aliases change only the display name. Deleting an alias does not delete the folder.

## Git status

![Git status: main, behind 2, ahead 1, stash 1, conflicts 2, staged 3, unstaged 4, untracked 5](assets/git-status-preview.svg)

| Indicator | Meaning |
| --- | --- |
| `⇣N` / `⇡N` | N commits behind / ahead of upstream |
| `*N` | N stash entries |
| `~N` | N conflicted files |
| `+N` | N staged entries |
| `!N` | N unstaged entries |
| `?N` | N untracked entries |

In the default themes, blue means clean, yellow means changes, and red means conflicts or an active Git operation. Colors follow your theme. Git information is hidden outside a repository.

## Reading mode

Loaded automatically with the extension. Enter with the shortcut or command.

- **`Alt+Esc`** (Mac: **`Option+Esc`**): hide the editor and footer. Conversation and tool output remain available for scrolling.
- **A single `Esc`** or **`Alt+Esc`** again: restore the interface and keep your draft.
- You can also enter with **`/reading-mode`**.

Requires Pi 1.5 or later in fullscreen mode. Use the command if the shortcut does not respond. Run `/reload` after switching TUI modes.

When upgrading from the standalone version, remove the `-e ./src/reading-mode.ts` launch argument to avoid loading it twice.

## Notes

- Settings are shared across projects and saved automatically. The default file is `~/.pi/agent/pi-path-bar.json`.
- Avoid enabling multiple footer-replacement extensions at once; they can override each other.
- The custom footer does not show the native `(auto)` marker.

## License

[MIT](LICENSE). See [Third-party notices](THIRD_PARTY_NOTICES.md) for related copyright and license texts. This unofficial extension is not affiliated with or endorsed by Pi or Tide.
