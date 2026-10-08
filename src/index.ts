import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ConfigStore, defaults, type Config } from "./config.ts";
import { openSettings } from "./settings.ts";
import { gitColor, gitText, watchGit } from "./git.ts";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { directoryLine, resolveDisplayPath } from "./path.ts";

const tokens = (n: number) => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`;

export default function (pi: ExtensionAPI, configFile = join(getAgentDir(), "pi-path-bar.json")) {
  const store = new ConfigStore(configFile, configFile === join(getAgentDir(), "pi-path-bar.json") ? join(getAgentDir(), "pi-show-dir.json") : undefined);
  let config = defaults();
  const load = (ctx: ExtensionContext) => {
    try { config = store.load(); }
    catch (error) { ctx.ui.notify(`Cannot read ${store.file}: ${error instanceof Error ? error.message : String(error)}. The file will not be overwritten.`, "error"); }
  };
  let activeGit: ReturnType<typeof watchGit> | undefined;
  const install = (ctx: ExtensionContext) => {
    activeGit?.dispose();
    activeGit = undefined;
    if (ctx.mode !== "tui") return;
    if (config.mode === "native") { ctx.ui.setFooter(undefined); return; }
    ctx.ui.setFooter((tui, theme, data) => {
      const monitor = config.branch ? watchGit(ctx.sessionManager.getCwd(), () => tui.requestRender()) : undefined;
      activeGit = monitor;
      const unsubscribe = data.onBranchChange(() => { monitor?.refresh(); tui.requestRender(); });
      return {
        dispose() { unsubscribe(); monitor?.dispose(); if (activeGit === monitor) activeGit = undefined; },
        invalidate() {},
        render(width: number): string[] {
          const state = monitor?.value ?? { kind: "none" as const };
          const git = config.branch ? gitText(state, data.getGitBranch() ?? undefined) : "";
          const gitSuffix = git ? ` (${git})` : "";
          const name = config.session ? ctx.sessionManager.getSessionName() : undefined;
          const suffix = `${gitSuffix}${name ? ` • ${name}` : ""}`;
          const display = resolveDisplayPath(ctx.sessionManager.getCwd(), homedir(), config.aliases);
          const lines = [directoryLine(display.path, suffix, width, {
            mode: config.mode === "native" ? "short" : config.mode,
            icon: config.icon,
            aliasName: display.aliasName,
            style: {
              normal: (text) => theme.fg("dim", text),
              alias: (text) => theme.fg("mdLink", text),
              suffix: (text) => theme.fg(gitColor(state), text.slice(0, gitSuffix.length)) + theme.fg("dim", text.slice(gitSuffix.length)),
            },
          })];

          const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
          let hitRate: number | undefined;
          // Include usage before compaction and usage from tools and summaries.
          for (const entry of ctx.sessionManager.getEntries()) {
            const usage = entry.type === "message"
              ? (entry.message.role === "assistant" || entry.message.role === "toolResult" ? entry.message.usage : undefined)
              : (entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary" ? entry.usage : undefined);
            if (!usage) continue;
            totals.input += usage.input ?? 0;
            totals.output += usage.output ?? 0;
            totals.cacheRead += usage.cacheRead ?? 0;
            totals.cacheWrite += usage.cacheWrite ?? 0;
            totals.cost += usage.cost?.total ?? 0;
            if (entry.type === "message" && entry.message.role === "assistant") {
              const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
              hitRate = prompt > 0 ? usage.cacheRead / prompt * 100 : undefined;
            }
          }
          const stats: string[] = [];
          for (const [key, prefix] of [["input", "↑"], ["output", "↓"], ["cacheRead", "R"], ["cacheWrite", "W"]] as const) {
            if (totals[key]) stats.push(`${prefix}${tokens(totals[key])}`);
          }
          if ((totals.cacheRead || totals.cacheWrite) && hitRate !== undefined) stats.push(`CH${hitRate.toFixed(1)}%`);
          const model = ctx.model;
          const subscription = model && (model.provider === "kimi-coding" || ctx.modelRegistry.isUsingOAuth(model));
          if (totals.cost || subscription) stats.push(`$${totals.cost.toFixed(3)}${subscription ? " (sub)" : ""}`);
          const usage = ctx.getContextUsage();
          const percent = usage?.percent;
          const context = `${percent == null ? "?" : percent.toFixed(1) + "%"}/${tokens(usage?.contextWindow ?? model?.contextWindow ?? 0)}`;
          stats.push(percent != null && percent > 70 ? theme.fg(percent > 90 ? "error" : "warning", context) : context);
          const left = truncateToWidth(stats.join(" "), width, "…");
          let right = model?.id ?? "no-model";
          if (model?.reasoning) right += ` • ${pi.getThinkingLevel()}`;
          if (model && data.getAvailableProviderCount() > 1) {
            const provider = `(${model.provider}) ${right}`;
            if (visibleWidth(left) + 2 + visibleWidth(provider) <= width) right = provider;
          }
          const available = width - visibleWidth(left) - 2;
          right = available > 0 ? truncateToWidth(right, available, "…") : "";
          const padding = right ? " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(right))) : "";
          lines.push(theme.fg("dim", left) + theme.fg("dim", padding + right));
          const statuses = [...data.getExtensionStatuses()].sort(([a], [b]) => a.localeCompare(b));
          if (statuses.length) {
            const text = statuses.map(([, value]) => value.replace(/[\r\n\t]/g, " ")).join(" ");
            lines.push(truncateToWidth(text, width, "…"));
          }
          return lines;
        },
      };
    });
  };
  pi.on("session_start", async (_event, ctx) => { load(ctx); install(ctx); });
  pi.on("tool_result", () => { activeGit?.refresh(); });
  pi.on("agent_end", () => { activeGit?.refresh(); });
  pi.on("session_shutdown", () => { activeGit?.dispose(); activeGit = undefined; });
  pi.registerCommand("path-bar", {
    description: "Configure the path bar and manage folder aliases",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("/path-bar requires TUI mode", "error"); return; }
      load(ctx);
      install(ctx);
      const save = (change: (next: Config) => void) => {
        try { config = store.update(change); install(ctx); return true; }
        catch (error) { ctx.ui.notify(`Could not save: ${error instanceof Error ? error.message : String(error)}`, "error"); return false; }
      };
      await openSettings(ctx, () => config, save);
    },
  });
}
