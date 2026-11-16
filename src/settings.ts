import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, SettingsList, Text, isKeyRelease, matchesKey, parseKey, truncateToWidth, type SettingItem } from "@earendil-works/pi-tui";
import { aliasName, folderPath, setAlias, type Config, type FolderAlias, type PathMode } from "./config.ts";
import { CLOCK, resolveOrder, segmentEntries } from "./segments.ts";

type Save = (change: (config: Config) => void, reinstall?: boolean) => boolean;
const modes: Record<PathMode, string> = { short: "Short", auto: "Auto", full: "Full", native: "Native footer" };
const switches = ["On", "Off"];

/** Keys that move the selected segment: ,< and .> as well as the plain characters. */
const MOVE = /^(?:shift\+)?([<>,.])$/;

async function editOrder(ctx: ExtensionContext, get: () => Config, save: Save, statuses: () => ReadonlyMap<string, string>) {
  const entries = segmentEntries(statuses());
  const visible = new Set([CLOCK, ...entries.keys()]);
  const list = resolveOrder(get().segments, entries.keys());
  const rows = () => list.filter((id) => visible.has(id));
  let cursor = Math.max(0, list.indexOf(CLOCK));
  const swap = (a: string, b: string) => {
    const [i, j] = [list.indexOf(a), list.indexOf(b)];
    [list[i], list[j]] = [list[j], list[i]];
  };
  // Write without reinstalling: the footer re-reads config on its next render, so the order previews live.
  const persist = () => save((config) => { config.segments = list; }, false);
  await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const container = new Container();
    const label = (id: string) => {
      const text = id === CLOCK ? "time" : truncateToWidth(entries.get(id) ?? "", 24, "…");
      return text ? `${id}   ${text}` : id;
    };
    return {
      render: (width: number) => {
        container.clear();
        container.addChild(new Text(theme.fg("accent", theme.bold("Footer order")), 0, 1));
        for (const [index, id] of rows().entries()) {
          const line = (index === cursor ? "▸ " : "  ") + label(id);
          container.addChild(new Text(index === cursor ? theme.fg("accent", line) : line, 1, 0));
        }
        container.addChild(new Text(theme.fg("dim", "< / >  move    enter / esc  close"), 0, 1));
        return container.render(width);
      },
      invalidate: () => container.invalidate(),
      handleInput: (input: string) => {
        if (isKeyRelease(input)) return;
        const items = rows();
        const move = MOVE.exec(parseKey(input) ?? "")?.[1];
        if (matchesKey(input, "up")) cursor = Math.max(0, cursor - 1);
        else if (matchesKey(input, "down")) cursor = Math.min(items.length - 1, cursor + 1);
        else if (move === "<" || move === ",") {
          if (cursor > 0) { swap(items[cursor], items[cursor - 1]); cursor--; persist(); }
        } else if (move === ">" || move === ".") {
          if (cursor < items.length - 1) { swap(items[cursor], items[cursor + 1]); cursor++; persist(); }
        } else if (matchesKey(input, "enter") || matchesKey(input, "escape")) { done(); return; }
        tui.requestRender();
      },
    };
  });
}

async function editAlias(ctx: ExtensionContext, save: Save, previous?: FolderAlias) {
  const pathInput = await ctx.ui.input(previous ? "Folder path (leave blank to keep the current value)" : "Folder path (blank: current directory; or enter an absolute or ~/ path)", previous?.path ?? ctx.sessionManager.getCwd());
  if (pathInput === undefined) return;
  const path = folderPath(pathInput.trim() ? pathInput : previous?.path ?? ctx.sessionManager.getCwd());
  const nameInput = await ctx.ui.input(previous ? "Alias name (leave blank to keep the current value)" : "Alias name", previous?.name ?? "e.g. Projects");
  if (nameInput === undefined) return;
  const name = aliasName(previous && !nameInput.trim() ? previous.name : nameInput);
  if (save((config) => setAlias(config, { path, name }, previous?.path))) ctx.ui.notify("Folder alias saved", "info");
}

export async function openSettings(ctx: ExtensionContext, get: () => Config, save: Save, statuses: () => ReadonlyMap<string, string> = () => new Map()) {
  let selected = "mode";
  while (true) {
    const action = await ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
      const config = get();
      const items: SettingItem[] = [
        { id: "mode", label: "Path display", currentValue: modes[config.mode], values: Object.values(modes), description: "Short: always abbreviate. Auto: abbreviate when needed. Full: never abbreviate." },
        ...([ ["icon", "Folder icon"], ["branch", "Git status"], ["session", "Session name"] ] as const).map(([id, label]) => ({ id, label, currentValue: config[id] ? "On" : "Off", values: switches })),
        { id: "timeFormat", label: "Time format", currentValue: config.timeFormat, values: ["24h", "12h"], description: "Local time at the right of the path line. 12h includes AM/PM. Not shown in Native footer mode." },
        { id: "order", label: "Footer order", currentValue: `${resolveOrder(config.segments, segmentEntries(statuses()).keys()).length} segments`, values: ["Open"], description: "Move extra footer segments. They default to the left of the time." },
        { id: "add", label: "Add folder alias", currentValue: "Open", values: ["Open"], description: "Name any folder. A blank path uses the current directory. Only the display changes." },
        { id: "manage", label: "Manage folder aliases", currentValue: `${config.aliases.length} aliases`, values: ["Open"], description: "Edit a path or name, or delete an alias." },
      ];
      const list = new SettingsList(items, 10, getSettingsListTheme(), (id, value) => {
        selected = id;
        if (id === "add" || id === "manage" || id === "order") { done(id); return; }
        const previous = id === "mode" ? modes[get().mode] : id === "timeFormat" ? get().timeFormat : get()[id as "icon" | "branch" | "session"] ? "On" : "Off";
        const success = save((next) => {
          if (id === "mode") next.mode = (Object.keys(modes) as PathMode[]).find((mode) => modes[mode] === value)!;
          else if (id === "timeFormat") next.timeFormat = value as Config["timeFormat"];
          else next[id as "icon" | "branch" | "session"] = value === "On";
        });
        if (!success) list.updateValue(id, previous);
        tui.requestRender();
      }, () => done(undefined));
      list.selectItem(selected);
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("Path bar settings")), 0, 1));
      container.addChild(list);
      return {
        render: (width: number) => container.render(width),
        invalidate: () => container.invalidate(),
        handleInput: (input: string) => { list.handleInput(input); tui.requestRender(); },
      };
    });
    if (!action) return;
    try {
      if (action === "add") { await editAlias(ctx, save); continue; }
      if (action === "order") { await editOrder(ctx, get, save, statuses); continue; }
      const aliases = get().aliases;
      if (!aliases.length) { ctx.ui.notify("No folder aliases yet. Add one first.", "info"); continue; }
      const labels = aliases.map((alias) => `${alias.name} → ${alias.path}`);
      const choice = await ctx.ui.select("Select a folder alias", labels);
      if (choice === undefined) continue;
      const alias = aliases[labels.indexOf(choice)];
      if (!alias) continue;
      const operation = await ctx.ui.select(`${alias.name} → ${alias.path}`, ["Edit path or name", "Delete alias"]);
      if (operation === "Edit path or name") await editAlias(ctx, save, alias);
      if (operation === "Delete alias" && await ctx.ui.confirm("Delete folder alias", `Delete "${alias.name}"? The actual folder will not be deleted.`)) {
        if (save((config) => { config.aliases = config.aliases.filter((item) => item.path !== alias.path); })) ctx.ui.notify("Folder alias deleted", "info");
      }
    } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
  }
}
