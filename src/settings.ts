import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, SettingsList, Text, type SettingItem } from "@earendil-works/pi-tui";
import { aliasName, folderPath, setAlias, type Config, type FolderAlias, type PathMode } from "./config.ts";

type Save = (change: (config: Config) => void) => boolean;
const modes: Record<PathMode, string> = { short: "简短", auto: "自动", full: "完整", native: "原生底栏" };
const switches = ["开启", "关闭"];

async function editAlias(ctx: ExtensionContext, save: Save, previous?: FolderAlias) {
  const pathInput = await ctx.ui.input(previous ? "文件夹路径（留空保留原路径）" : "文件夹路径（留空使用当前目录，也可输入绝对路径或 ~/ 路径）", previous?.path ?? ctx.sessionManager.getCwd());
  if (pathInput === undefined) return;
  const path = folderPath(pathInput.trim() ? pathInput : previous?.path ?? ctx.sessionManager.getCwd());
  const nameInput = await ctx.ui.input(previous ? "显示名称（留空保留原名称）" : "显示名称", previous?.name ?? "例如 项目");
  if (nameInput === undefined) return;
  const name = aliasName(previous && !nameInput.trim() ? previous.name : nameInput);
  if (save((config) => setAlias(config, { path, name }, previous?.path))) ctx.ui.notify("目录别名已保存", "info");
}

export async function openSettings(ctx: ExtensionContext, get: () => Config, save: Save) {
  let selected = "mode";
  while (true) {
    const action = await ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
      const config = get();
      const items: SettingItem[] = [
        { id: "mode", label: "路径显示", currentValue: modes[config.mode], values: Object.values(modes), description: "简短：始终缩写。自动：宽度不足才缩写。完整：不缩写。" },
        ...([ ["icon", "目录图标"], ["branch", "Git 分支"], ["session", "会话名称"] ] as const).map(([id, label]) => ({ id, label, currentValue: config[id] ? "开启" : "关闭", values: switches })),
        { id: "add", label: "添加目录别名", currentValue: "打开", values: ["打开"], description: "给任意文件夹命名。路径留空使用当前目录，只改变底栏显示。" },
        { id: "manage", label: "管理目录别名", currentValue: `${config.aliases.length} 项`, values: ["打开"], description: "修改路径、名称，或删除别名。" },
      ];
      const list = new SettingsList(items, 10, getSettingsListTheme(), (id, value) => {
        selected = id;
        if (id === "add" || id === "manage") { done(id); return; }
        const previous = id === "mode" ? modes[get().mode] : get()[id as "icon" | "branch" | "session"] ? "开启" : "关闭";
        const success = save((next) => {
          if (id === "mode") next.mode = (Object.keys(modes) as PathMode[]).find((mode) => modes[mode] === value)!;
          else next[id as "icon" | "branch" | "session"] = value === "开启";
        });
        if (!success) list.updateValue(id, previous);
        tui.requestRender();
      }, () => done(undefined));
      list.selectItem(selected);
      const container = new Container();
      container.addChild(new Text(theme.fg("accent", theme.bold("目录显示设置")), 0, 1));
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
      const aliases = get().aliases;
      if (!aliases.length) { ctx.ui.notify("还没有目录别名。请先添加。", "info"); continue; }
      const labels = aliases.map((alias) => `${alias.name} → ${alias.path}`);
      const choice = await ctx.ui.select("选择目录别名", labels);
      if (choice === undefined) continue;
      const alias = aliases[labels.indexOf(choice)];
      if (!alias) continue;
      const operation = await ctx.ui.select(`${alias.name} → ${alias.path}`, ["修改路径或名称", "删除别名"]);
      if (operation === "修改路径或名称") await editAlias(ctx, save, alias);
      if (operation === "删除别名" && await ctx.ui.confirm("删除目录别名", `删除“${alias.name}”？实际文件夹不会被删除。`)) {
        if (save((config) => { config.aliases = config.aliases.filter((item) => item.path !== alias.path); })) ctx.ui.notify("目录别名已删除", "info");
      }
    } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "error"); }
  }
}
