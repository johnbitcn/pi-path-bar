# pi-path-bar

English | [简体中文](README.zh-CN.md)

A Pi extension for compact directory paths, folder aliases, and theme-aware Git status.

```text
 ~/C/P/demo-app ( main)
 Projects/demo-app ( main +2 !1 ?3)
 demo ( main ⇡1)
```

## Features

- Short, automatic, and full path display modes.
- Display aliases for any folder, without changing actual paths or environment variables.
- Theme-aware alias colors and Tide-style Git status indicators.
- An interactive settings menu with persistent configuration.
- Existing usage statistics, model information, and extension status lines.
- Unicode folder names and aliases.

## Installation

Install from GitHub:

```sh
pi install git:github.com/johnbitcn/pi-path-bar
```

Run `/reload` in an existing Pi session, then open `/path-bar`.

For a single Pi run:

```sh
pi -e git:github.com/johnbitcn/pi-path-bar
```

For local development, run from the project directory:

```sh
pi install "$PWD"
# Or load the extension for one run:
pi -e ./src/index.ts
```

Load only one copy of the extension. Remove an existing local or Git installation before switching sources. Folder icons require a Nerd Font; you can turn them off in settings.

## Settings

Run `/path-bar`. Use the arrow keys to select an item, Enter or Space to change a setting or open an action, and Esc to exit. Changes apply immediately and are saved automatically.

| Setting | Default | Choices |
| --- | --- | --- |
| Path display | Short | Short, Auto, Full, Native footer |
| Folder icon | On | On, Off |
| Git status | On | On, Off |
| Session name | On | On, Off |
| Add folder alias | — | Enter a folder path and a name |
| Manage folder aliases | — | Edit or delete aliases |

**Native footer** restores Pi's built-in footer. Other display settings are retained but do not apply in that mode.

### Path modes

- **Short:** always abbreviate intermediate folders to their first grapheme, including Unicode names.
- **Auto:** show the full path when it fits; otherwise abbreviate it.
- **Full:** do not abbreviate; truncate the line if needed.

Short and Auto collapse intermediate folders to `…` when necessary. At very small widths, the root and icon are dropped before the final folder name is truncated.

The home directory is shown as `~`. Named roots such as `~` and folder aliases receive a folder icon. Absolute paths starting with `/` do not.

## Folder aliases

Choose **Add folder alias** to name any folder. Enter an absolute path or a path starting with `~/`. Leave the path blank and press Enter to use the current directory. The target must exist and be a directory.

For example, name `~/CloudDrive` **Cloud**:

```text
 Cloud
 Cloud/P/demo-app
```

You can also name `~/CloudDrive/Projects/demo-app` **demo**. Then that folder displays as ` demo`, and its child displays as ` demo/src`.

### Matching and editing

- An alias matches its folder and descendants, at directory boundaries.
- If multiple aliases match, the longest path wins. Parent and child aliases are not combined.
- The alias name remains intact when possible. Descendant folders follow the selected path mode.
- Without a match, the extension uses `~` or an absolute path.
- Paths are normalized and `~` is expanded on save. Symbolic links are not resolved.
- Paths and names must be unique. Names cannot be empty, `~`, `.`, or `..`, or contain slashes, backslashes, newlines, or control characters.
- When editing, leave a field blank to keep its existing value. Esc cancels.
- Deleting an alias does not delete the folder. Stored aliases remain available when a drive is disconnected.

Only the matched alias name uses Pi's `mdLink` theme color: brighter blue in the built-in dark theme and darker blue in the light theme. Custom themes control their own link color. The icon, descendant path, and session name use gray; Git uses its status color. Colors follow theme changes.

Aliases affect only the footer. They do not change the working directory, tool paths, or environment variables.

## Git status

Git indicators borrow Tide's notation, but use Pi theme text colors rather than background colors. The extension does not modify fish or Tide.

| State | Theme token | Built-in appearance |
| --- | --- | --- |
| Initial loading or query failure | `text` | Default text color, with `?` |
| Clean working tree | `mdLink` | Blue |
| Staged, unstaged, or untracked changes | `warning` | Yellow |
| Conflicts or an active Git operation | `error` | Red |

Red takes priority over yellow, then blue. Outside a Git repository, Git information is hidden. Alias color is independent of Git status.

```text
 demo ( main ⇣2 ⇡1 *1 ~2 +3 !4 ?5)
```

| Indicator | Meaning |
| --- | --- |
| `⇣N` | N commits behind upstream |
| `⇡N` | N commits ahead of upstream |
| `*N` | N stash entries |
| `~N` | N conflicted files; covers `DD AU UD UA DU AA UU` |
| `+N` | N staged entries |
| `!N` | N unstaged entries |
| `?N` | N untracked entries |

Zero counts are omitted. Untracked directories are grouped using Git's default behavior. Conflicts are not counted again as staged or unstaged changes. Ahead, behind, and stash counts alone do not change the color. Ahead and behind are omitted if no upstream exists.

Active operations include merge, rebase, cherry-pick, revert, and bisect. Rebase progress is shown when available. Detached HEAD displays `#tag` or `@short-commit`. Linked worktrees are supported.

Queries run asynchronously with a timeout. Status refreshes every five seconds, after tool execution or an agent turn, and when the branch changes. Disabling Git status or selecting Native footer stops the extension's queries.

## Configuration

Settings are shared across projects and stored in:

```text
~/.pi/agent/pi-path-bar.json
```

If `PI_CODING_AGENT_DIR` is set, its directory is used instead. The extension never sets or changes that variable.

```json
{
  "mode": "short",
  "icon": true,
  "branch": true,
  "session": true,
  "aliases": [
    { "path": "/home/example/Projects", "name": "Projects" }
  ]
}
```

The `branch` field controls Git status. Settings survive restarts and `/reload`. Opening the menu reloads the file. Saves use a temporary file and atomic replacement. Other running Pi instances must reopen the menu or reload to pick up changes.

If the new file is absent, the extension reads the legacy `pi-show-dir.json`. The next save writes the new file and leaves the old file intact. Invalid configuration is reported and is not overwritten.

## Limitations

- Pi's public API replaces the entire footer. If another extension also calls `setFooter()`, the last one wins.
- The public API does not expose the auto-compaction setting, so the custom footer does not show the native `(auto)` marker.
- This is an unofficial Pi extension. It is not affiliated with or endorsed by Pi or Tide.

## Development

Requires Node.js 22.19 or newer and Git for Git status and integration tests.

```sh
npm install --ignore-scripts
npm test
npx tsc
```
