import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>;
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { ConfigStore, defaults, type Config } from "./config.ts";
import { gitColor, gitText, watchGit } from "./git.ts";
import { MinimalEditor, type MinimalBorderTheme, type MinimalEditorSource, type UsageTotals } from "./minimal.ts";
import { directoryLine, resolveDisplayPath } from "./path.ts";
import { CLOCK, SEGMENT_KEY, classifyStatuses, resolveOrder, segmentEntries } from "./segments.ts";
import { openSettings } from "./settings.ts";

const tokens = (n: number) => n < 1000 ? String(n) : n < 1e6 ? `${(n / 1000).toFixed(1)}k` : `${(n / 1e6).toFixed(1)}M`;

interface SessionStats {
  totals: UsageTotals;
  hitRate?: number;
}

interface StatsCache extends SessionStats {
  sessionId?: string;
  leafId?: string | null;
  count: number;
  last: unknown;
}

function createStatsReader() {
  let cache: StatsCache | undefined;
  return (ctx: ExtensionContext): SessionStats => {
    const sm = ctx.sessionManager as ExtensionContext["sessionManager"] & {
      getSessionId?: () => string;
      getLeafId?: () => string | null;
    };
    const entries = sm.getEntries();
    const sessionId = sm.getSessionId?.();
    const leafId = sm.getLeafId?.();
    const last = entries[entries.length - 1];
    if (cache && cache.sessionId === sessionId && cache.leafId === leafId && cache.count === entries.length && cache.last === last) {
      return cache;
    }
    const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    let hitRate: number | undefined;
    // Include usage before compaction and usage from tools and summaries.
    for (const entry of entries) {
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
    cache = { sessionId, leafId, count: entries.length, last, totals, hitRate };
    return cache;
  };
}

export default function (pi: ExtensionAPI, configFile = join(getAgentDir(), "pi-path-bar.json")) {
  const store = new ConfigStore(configFile, configFile === join(getAgentDir(), "pi-path-bar.json") ? join(getAgentDir(), "pi-show-dir.json") : undefined);
  let config = defaults();
  const readStats = createStatsReader();
  const load = (ctx: ExtensionContext) => {
    try { config = store.load(); }
    catch (error) { ctx.ui.notify(`Cannot read ${store.file}: ${error instanceof Error ? error.message : String(error)}. The file will not be overwritten.`, "error"); }
  };
  let activeGit: ReturnType<typeof watchGit> | undefined;
  let disposeFooter: (() => void) | undefined;
  let footerData: ReadonlyFooterDataProvider | undefined;
  let activeTheme: MinimalBorderTheme | undefined;
  let activeEditorFactory: EditorFactory | undefined;
  let activeCtx: ExtensionContext | undefined;

  const restoreEditor = (ctx?: ExtensionContext) => {
    if (!activeEditorFactory) return;
    const target = ctx ?? activeCtx;
    if (target && target.ui.getEditorComponent?.() === activeEditorFactory) {
      target.ui.setEditorComponent?.(undefined);
    }
    activeEditorFactory = undefined;
  };

  const install = (ctx: ExtensionContext) => {
    disposeFooter?.();
    disposeFooter = undefined;
    if (ctx.mode !== "tui") return;
    activeCtx = ctx;

    if (config.minimal) {
      ctx.ui.setFooter((tui, theme, data) => {
        const monitor = config.branch ? watchGit(ctx.sessionManager.getCwd(), () => tui.requestRender()) : undefined;
        activeGit = monitor;
        footerData = data;
        activeTheme = theme;
        const unsubscribe = data.onBranchChange(() => { monitor?.refresh(); tui.requestRender(); });
        let minute = Math.floor(Date.now() / 60_000);
        const timer = setInterval(() => {
          const next = Math.floor(Date.now() / 60_000);
          if (next !== minute) { minute = next; tui.requestRender(); }
        }, 1000);
        timer.unref();
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          clearInterval(timer);
          unsubscribe();
          monitor?.dispose();
          if (activeGit === monitor) activeGit = undefined;
          if (footerData === data) footerData = undefined;
        };
        disposeFooter = dispose;
        return {
          dispose,
          invalidate() {},
          render(width: number): string[] {
            // Minimal mode hides the footer completely unless Type 3 (unknown) extension statuses exist.
            const { unknown } = classifyStatuses(data.getExtensionStatuses());
            if (!unknown.length) return [];
            const text = unknown.map(([, value]) => value).join(" ");
            return [truncateToWidth(text, width, "…")];
          },
        };
      });

      const borderTheme = (): MinimalBorderTheme => activeTheme ?? activeCtx?.ui.theme ?? { fg: (_color, text) => text };
      const source: MinimalEditorSource = {
        getTopInput: (indicator, borderColor) => {
          const current = activeCtx ?? ctx;
          const { totals, hitRate } = readStats(current);
          const model = current.model;
          const subscription = Boolean(model && (model.provider === "kimi-coding" || current.modelRegistry?.isUsingOAuth(model)));
          const { slots, billionContextUsage } = classifyStatuses(footerData?.getExtensionStatuses() ?? new Map());
          return {
            indicator,
            totals,
            billionContextUsage,
            hitRate,
            subscription,
            sessionName: current.sessionManager.getSessionName(),
            showSession: config.session,
            timeFormat: config.timeFormat,
            now: new Date(),
            slots,
            order: config.segments,
            hidden: new Set(config.hiddenSegments),
            theme: borderTheme(),
            borderColor,
          };
        },
        getBottomInput: (borderColor) => {
          const current = activeCtx ?? ctx;
          const display = resolveDisplayPath(current.sessionManager.getCwd(), homedir(), config.aliases);
          const model = current.model;
          const usage = current.getContextUsage();
          return {
            displayPath: display.path,
            aliasName: display.aliasName,
            pathMode: config.mode === "native" ? "short" : config.mode,
            showIcon: config.icon,
            showBranch: config.branch,
            gitState: activeGit?.value ?? { kind: "none" },
            fallbackBranch: footerData?.getGitBranch() ?? undefined,
            modelId: model?.id,
            reasoning: model?.reasoning,
            thinkingLevel: pi.getThinkingLevel(),
            contextPercent: usage?.percent,
            contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
            theme: borderTheme(),
            borderColor,
          };
        },
      };

      if (!activeEditorFactory || ctx.ui.getEditorComponent?.() !== activeEditorFactory) {
        const factory: EditorFactory = (tui, editorTheme, keybindings) => new MinimalEditor(tui, editorTheme, keybindings, source);
        activeEditorFactory = factory;
        ctx.ui.setEditorComponent?.(factory);
      }
      return;
    }

    restoreEditor(ctx);
    if (config.mode === "native") { ctx.ui.setFooter(undefined); return; }
    ctx.ui.setFooter((tui, theme, data) => {
      const monitor = config.branch ? watchGit(ctx.sessionManager.getCwd(), () => tui.requestRender()) : undefined;
      activeGit = monitor;
      footerData = data;
      activeTheme = theme;
      const unsubscribe = data.onBranchChange(() => { monitor?.refresh(); tui.requestRender(); });
      const clock = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: config.timeFormat === "12h" ? "h12" : "h23" });
      let minute = Math.floor(Date.now() / 60_000);
      const timer = setInterval(() => {
        const next = Math.floor(Date.now() / 60_000);
        if (next !== minute) { minute = next; tui.requestRender(); }
      }, 1000);
      timer.unref();
      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        clearInterval(timer);
        unsubscribe();
        monitor?.dispose();
        if (activeGit === monitor) activeGit = undefined;
        if (footerData === data) footerData = undefined;
      };
      disposeFooter = dispose;
      return {
        dispose,
        invalidate() {},
        render(width: number): string[] {
          const state = monitor?.value ?? { kind: "none" as const };
          const git = config.branch ? gitText(state, data.getGitBranch() ?? undefined) : "";
          const gitSuffix = git ? ` (${git})` : "";
          const name = config.session ? ctx.sessionManager.getSessionName() : undefined;
          const suffix = `${gitSuffix}${name ? ` • ${name}` : ""}`;
          const display = resolveDisplayPath(ctx.sessionManager.getCwd(), homedir(), config.aliases);
          const time = theme.fg("dim", clock.format(new Date()));
          const entries = segmentEntries(data.getExtensionStatuses());
          const hidden = new Set(config.hiddenSegments);
          const group = resolveOrder(config.segments, entries.keys()).flatMap((id) => {
            if (hidden.has(id)) return [];
            const text = id === CLOCK ? time : entries.get(id) ?? "";
            return text ? [text] : [];
          });
          // Narrow terminals drop from the right: the segment nearest the edge goes first.
          while (group.length && visibleWidth(group.join(" ")) > width - 3) group.pop();
          const groupText = group.join(theme.fg("dim", " "));
          const groupWidth = visibleWidth(groupText);
          const path = directoryLine(display.path, suffix, group.length ? width - groupWidth - 2 : width, {
            mode: config.mode === "native" ? "short" : config.mode,
            icon: config.icon,
            aliasName: display.aliasName,
            style: {
              normal: (text) => theme.fg("dim", text),
              alias: (text) => theme.fg("mdLink", text),
              suffix: (text) => theme.fg(gitColor(state), text.slice(0, gitSuffix.length)) + theme.fg("dim", text.slice(gitSuffix.length)),
            },
          });
          const lines = [group.length ? path + theme.fg("dim", " ".repeat(width - visibleWidth(path) - groupWidth)) + groupText : path];

          const { totals, hitRate } = readStats(ctx);
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
          const statuses = [...data.getExtensionStatuses()].filter(([key]) => !SEGMENT_KEY.test(key)).sort(([a], [b]) => a.localeCompare(b));
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
  pi.on("session_shutdown", () => { disposeFooter?.(); disposeFooter = undefined; restoreEditor(); activeCtx = undefined; });
  pi.registerCommand("path-bar", {
    description: "Configure the path bar and manage folder aliases",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") { ctx.ui.notify("/path-bar requires TUI mode", "error"); return; }
      load(ctx);
      install(ctx);
      const save = (change: (next: Config) => void, reinstall = true) => {
        try { config = store.update(change); if (reinstall) install(ctx); return true; }
        catch (error) { ctx.ui.notify(`Could not save: ${error instanceof Error ? error.message : String(error)}`, "error"); return false; }
      };
      await openSettings(ctx, () => config, save, () => footerData?.getExtensionStatuses() ?? new Map());
    },
  });
}
