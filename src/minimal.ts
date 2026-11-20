import { CustomEditor, type KeybindingsManager, type Theme } from "@earendil-works/pi-coding-agent";
import { sliceByColumn, truncateToWidth, visibleWidth, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import type { Config } from "./config.ts";
import { gitColor, type GitState } from "./git.ts";
import { formatPath, type PathOptions } from "./path.ts";
import { CLOCK, resolveOrder, type SlotEntry } from "./segments.ts";

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface WorkingIndicatorLike {
  readonly kind: string;
  renderInBorder(width: number): string;
  renderSpinnerInBorder(width: number): string;
}

export interface MinimalBorderTheme {
  fg: Theme["fg"];
}

export interface MinimalTopInput {
  indicator?: WorkingIndicatorLike;
  totals: UsageTotals;
  hitRate?: number;
  subscription: boolean;
  sessionName?: string;
  showSession: boolean;
  timeFormat: Config["timeFormat"];
  now: Date;
  slots: ReadonlyMap<string, SlotEntry>;
  order: string[];
  hidden: ReadonlySet<string>;
  theme: MinimalBorderTheme;
  borderColor: (text: string) => string;
}

export interface MinimalBottomInput {
  displayPath: string;
  aliasName?: string;
  pathMode: Exclude<Config["mode"], "native">;
  showIcon: boolean;
  showBranch: boolean;
  gitState: GitState;
  fallbackBranch?: string;
  modelId?: string;
  reasoning?: boolean;
  thinkingLevel?: string;
  contextPercent?: number | null;
  contextWindow: number;
  theme: MinimalBorderTheme;
  borderColor: (text: string) => string;
}

const clean = (value: string) => value.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
const hasAnsi = (value: string) => value.includes("\x1b");
const resetIf = (value: string) => (hasAnsi(value) ? "\x1b[0m" : "");

export function compactTokens(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.round(n)));
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatCostMinimal(cost: number, subscription: boolean): string {
  if (cost <= 0) return subscription ? "sub" : "";
  let text: string;
  if (cost < 0.0005) text = "<$.001";
  else if (cost < 0.01) text = `$.${Math.round(cost * 1000).toString().padStart(3, "0")}`;
  else if (cost < 100) text = `$${cost.toFixed(2)}`;
  else text = `$${Math.round(cost)}`;
  return subscription ? `${text}ˢ` : text;
}

export function formatTimeMinimal(date: Date, timeFormat: "24h" | "12h"): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (timeFormat === "24h") return `${String(hours).padStart(2, "0")}:${minutes}`;
  const suffix = hours >= 12 ? "p" : "a";
  const h12 = hours % 12 || 12;
  return `${h12}:${minutes}${suffix}`;
}

export function shortModelName(id: string | undefined): string {
  if (!id) return "no-model";
  const stripped = clean(id)
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "")
    .replace(/-(?:latest|preview|instruct|chat)$/i, "");

  let match = /^claude-(sonnet|opus|haiku)-(\d+)[.-](\d+)$/i.exec(stripped);
  if (match) {
    const family = match[1].toLowerCase();
    return `${family}-${match[2]}.${match[3]}`;
  }
  match = /^claude-(\d+)[.-](\d+)-(sonnet|opus|haiku)$/i.exec(stripped);
  if (match) {
    const family = match[3].toLowerCase();
    return `${family}-${match[1]}.${match[2]}`;
  }
  match = /^claude-(sonnet|opus|haiku)-(\d+)$/i.exec(stripped);
  if (match) return `${match[1].toLowerCase()}-${match[2]}`;
  match = /^gemini-([\d.]+)-(flash-lite|pro|flash|ultra)(?:-[a-z0-9.]+)?$/i.exec(stripped);
  if (match) {
    const tierMap: Record<string, string> = { "flash-lite": "fl", pro: "p", flash: "f", ultra: "u" };
    const tier = tierMap[match[2].toLowerCase()] ?? match[2][0].toLowerCase();
    return `gem-${match[1]}${tier}`;
  }
  match = /^gpt-([\d.]+)(?:-(codex|mini|nano|turbo))?$/i.exec(stripped);
  if (match) {
    const tierMap: Record<string, string> = { codex: "c", mini: "m", nano: "n", turbo: "t" };
    const tier = match[2] ? tierMap[match[2].toLowerCase()] ?? "" : "";
    return `gpt-${match[1]}${tier}`;
  }
  if (/^deepseek-reasoner$/i.test(stripped)) return "ds-r1";
  if (/^deepseek-chat$/i.test(stripped)) return "ds-chat";
  match = /^deepseek-(.+)$/i.exec(stripped);
  return match ? `ds-${match[1]}` : stripped;
}

export function shortThinking(level: string | undefined): string {
  if (!level || level === "off") return "";
  const map: Record<string, string> = { minimal: "·m", low: "·L", medium: "·M", high: "·H", xhigh: "·X" };
  return map[level] ?? `·${level[0].toUpperCase()}`;
}

export function formatContextMinimal(
  percent: number | null | undefined,
  contextWindow: number,
  includeWindow: boolean,
  theme: MinimalBorderTheme,
): string {
  const glyph = percent == null || percent <= 0 ? "○"
    : percent <= 33 ? "◔"
    : percent <= 66 ? "◐"
    : percent < 90 ? "◕"
    : "●";
  const pct = percent == null ? "?" : `${Math.round(percent)}%`;
  const win = includeWindow && contextWindow > 0 ? `/${compactTokens(contextWindow)}` : "";
  const text = `${glyph}${pct}${win}`;
  if (percent != null && percent > 90) return theme.fg("error", text);
  if (percent != null && percent > 70) return theme.fg("warning", text);
  return theme.fg("dim", text);
}

function shortGitOperation(operation: string): string {
  const rebase = /^(?:rebase-[im]|rebase)(?:\s+(\d+\/\d+))?$/.exec(operation);
  if (rebase) return rebase[1] ? `R${rebase[1]}` : "R";
  if (operation.startsWith("am/rebase")) return "AR";
  if (operation.startsWith("am")) return "AM";
  if (operation === "merge") return "M";
  if (operation === "cherry-pick") return "CP";
  if (operation === "revert") return "RV";
  if (operation === "bisect") return "BS";
  return clean(operation);
}

export function formatGitMinimal(
  state: GitState,
  fallbackBranch: string | undefined,
  detail: "full" | "symbols" | "branch",
): string {
  if (state.kind === "none") return "";
  if (state.kind === "unknown") return fallbackBranch ? `${clean(fallbackBranch)}?` : "?";
  const parts = [`${clean(state.head)}`];
  if (state.operation) parts.push(shortGitOperation(state.operation));
  if (detail !== "branch") {
    let counts = "";
    for (const [key, symbol] of [["behind", "⇣"], ["ahead", "⇡"], ["stash", "*"], ["conflicted", "~"], ["staged", "+"], ["dirty", "!"], ["untracked", "?"]] as const) {
      if (state[key]) counts += detail === "full" ? `${symbol}${state[key]}` : symbol;
    }
    if (counts) parts.push(counts);
  }
  return parts.join(" ");
}

/**
 * Pack right-side slots left-to-right; when overflowing, drop from the right and append `+N`.
 */
export function packRightSlots(
  items: ReadonlyArray<{ id: string; text: string }>,
  maxWidth: number,
  dim: (text: string) => string,
): string {
  if (maxWidth <= 0 || items.length === 0) return "";
  const sep = dim(" ");
  const join = (list: string[]) => list.join(sep);
  const texts = items.map((item) => item.text);
  const full = join(texts);
  if (visibleWidth(full) <= maxWidth) return full;

  for (let keep = texts.length - 1; keep >= 0; keep--) {
    const dropped = texts.length - keep;
    const badge = dim(`+${dropped}`);
    const candidate = keep > 0 ? join([...texts.slice(0, keep), badge]) : badge;
    if (visibleWidth(candidate) <= maxWidth) return candidate;
  }
  return "";
}

/**
 * Overlay centered scroll indicator (` ↑ N more ` / ` ↓ N more `) onto a full-width border line.
 */
export function overlayScrollLabel(
  line: string,
  width: number,
  direction: "↑" | "↓",
  hiddenLineCount: number,
  borderColor: (text: string) => string,
): string {
  if (hiddenLineCount <= 0 || width <= 0) return line;
  const label = ` ${direction} ${hiddenLineCount} more `;
  const labelW = visibleWidth(label);
  if (labelW + 2 > width) {
    const fallback = `─── ${direction} ${hiddenLineCount} more `;
    const remain = width - visibleWidth(fallback);
    if (remain >= 0) return borderColor(fallback + "─".repeat(remain));
    const ellipsis = "…".slice(0, width);
    const keep = Math.max(0, width - visibleWidth(ellipsis));
    return borderColor(sliceByColumn(fallback, 0, keep, true) + ellipsis);
  }
  const start = Math.floor((width - labelW) / 2);
  const rightStart = start + labelW;
  const rightTarget = width - rightStart;

  const leftSlice = sliceByColumn(line, 0, start, true);
  const leftPad = Math.max(0, start - visibleWidth(leftSlice));
  const rightSlice = sliceByColumn(line, rightStart, rightTarget, true);
  const rightPad = Math.max(0, rightTarget - visibleWidth(rightSlice));

  return (
    leftSlice +
    resetIf(leftSlice) +
    (leftPad > 0 ? borderColor("─".repeat(leftPad)) : "") +
    borderColor(label) +
    (rightPad > 0 ? borderColor("─".repeat(rightPad)) : "") +
    rightSlice +
    resetIf(rightSlice)
  );
}

function fillBetween(
  width: number,
  left: string,
  right: string,
  borderColor: (text: string) => string,
): string {
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  const gap = Math.max(0, width - leftW - rightW);
  return `${left}${gap > 0 ? borderColor("─".repeat(gap)) : ""}${right}`;
}

export function renderMinimalTopBorder(input: MinimalTopInput, width: number, hiddenLineCount: number): string {
  if (width <= 0) return "";
  const { borderColor, theme, indicator } = input;
  if (width <= 3) return borderColor("─".repeat(width));

  const dim = (text: string) => theme.fg("dim", text);
  const timeText = dim(formatTimeMinimal(input.now, input.timeFormat));
  const rightItems = resolveOrder(input.order, input.slots.keys()).flatMap((id) => {
    if (input.hidden.has(id)) return [];
    const text = id === CLOCK ? timeText : input.slots.get(id)?.text ?? "";
    return text ? [{ id, text }] : [];
  });

  const makeRightBlock = (maxSlotsWidth: number) => {
    const packed = packRightSlots(rightItems, maxSlotsWidth, dim);
    return packed ? `${borderColor(" ")}${packed}${borderColor(" ──")}` : "";
  };

  let line: string;

  // Rare non-working indicators (retry / compaction / branchSummary) take over the L zone.
  if (indicator && indicator.kind !== "working") {
    const fullStatus = indicator.renderInBorder(Math.max(1, width - 5));
    const statusW = visibleWidth(fullStatus);
    if (statusW > 0 && statusW + 5 <= width) {
      const leftBlock = `${borderColor("── ")}${fullStatus}${borderColor(" ")}`;
      const leftW = 4 + statusW;
      // Leave at least 2 fill chars + right wrapper (" " + " ──" = 4 cols) when right slots exist.
      const maxRightSlots = width - leftW - 2 - 4;
      const rightBlock = maxRightSlots > 0 ? makeRightBlock(maxRightSlots) : "";
      line = fillBetween(width, leftBlock, rightBlock, borderColor);
    } else {
      const spinner = indicator.renderSpinnerInBorder(Math.max(1, width - 4));
      const spinnerW = visibleWidth(spinner);
      if (spinnerW > 0 && spinnerW + 4 <= width) {
        const leftBlock = `${borderColor("── ")}${spinner}${borderColor(" ")}`;
        const maxRightSlots = width - (4 + spinnerW) - 2 - 4;
        const rightBlock = maxRightSlots > 0 ? makeRightBlock(maxRightSlots) : "";
        line = fillBetween(width, leftBlock, rightBlock, borderColor);
      } else {
        line = borderColor("─".repeat(width));
      }
    }
    return overlayScrollLabel(line, width, "↑", hiddenLineCount, borderColor);
  }

  // Scheme B: fixed 5-column W slot when working (degraded spinner) or idle with left telemetry.
  const isWorking = indicator?.kind === "working";
  const spinner = isWorking ? indicator.renderSpinnerInBorder(Math.max(1, width - 4)) : "";
  const spinnerW = visibleWidth(spinner);
  const workingPrefix = isWorking && spinnerW > 0 && spinnerW + 5 <= width
    ? `${borderColor("── ")}${spinner}${borderColor(" ")}`
    : "";

  const tokenParts: string[] = [];
  if (input.totals.input) tokenParts.push(`↑${compactTokens(input.totals.input)}`);
  if (input.totals.output) tokenParts.push(`↓${compactTokens(input.totals.output)}`);
  const tokensText = tokenParts.length ? dim(tokenParts.join(" ")) : "";
  const cacheText = (input.totals.cacheRead || input.totals.cacheWrite) && input.hitRate !== undefined
    ? dim(`c${Math.round(input.hitRate)}%`)
    : "";
  const costRaw = formatCostMinimal(input.totals.cost, input.subscription);
  const costText = costRaw ? dim(costRaw) : "";
  const sessionClean = input.showSession && input.sessionName ? clean(input.sessionName).trim() : "";
  const sessionText = sessionClean ? dim(`·${truncateToWidth(sessionClean, 12, "…")}`) : "";

  const telemetryTiers = [
    [tokensText, cacheText, costText, sessionText],
    [tokensText, cacheText, costText],
    [tokensText, costText],
    [costText],
    [],
  ].map((parts) => parts.filter(Boolean).join(dim(" ")));

  const buildLeftBlock = (telemetry: string): string => {
    if (workingPrefix) {
      return telemetry ? `${workingPrefix}${telemetry}${borderColor(" ")}` : workingPrefix;
    }
    if (!telemetry) return "";
    // Idle with left content uses `──── ` (5 cols) to align identically with `── ⠋ `.
    return `${borderColor("──── ")}${telemetry}${borderColor(" ")}`;
  };

  const fullRightBlock = makeRightBlock(width);
  const fullRightW = visibleWidth(fullRightBlock);
  const minGap = 2;

  let chosenLeft = "";
  let chosenRight = "";

  // First try keeping all right slots intact while progressively trimming left telemetry.
  let matched = false;
  for (const telemetry of telemetryTiers) {
    const leftBlock = buildLeftBlock(telemetry);
    if (visibleWidth(leftBlock) + minGap + fullRightW <= width) {
      chosenLeft = leftBlock;
      chosenRight = fullRightBlock;
      matched = true;
      break;
    }
  }

  // If even empty left telemetry cannot fit full right slots, fold right slots with `+N`.
  if (!matched) {
    const baseLeft = buildLeftBlock("");
    const baseLeftW = visibleWidth(baseLeft);
    const maxRightSlots = width - baseLeftW - minGap - 4;
    chosenLeft = baseLeft;
    chosenRight = maxRightSlots > 0 ? makeRightBlock(maxRightSlots) : "";
    // If after folding right slots there is still room for cost or tokens, re-add highest-priority telemetry.
    const rightW = visibleWidth(chosenRight);
    for (const telemetry of telemetryTiers) {
      if (!telemetry) break;
      const candidate = buildLeftBlock(telemetry);
      if (visibleWidth(candidate) + minGap + rightW <= width) {
        chosenLeft = candidate;
        break;
      }
    }
  }

  line = fillBetween(width, chosenLeft, chosenRight, borderColor);
  return overlayScrollLabel(line, width, "↑", hiddenLineCount, borderColor);
}

export function renderMinimalBottomBorder(input: MinimalBottomInput, width: number, hiddenLineCount: number): string {
  if (width <= 0) return "";
  const { borderColor, theme } = input;
  if (width <= 5) return borderColor("─".repeat(width));

  const dim = (text: string) => theme.fg("dim", text);
  const thinking = input.reasoning ? shortThinking(input.thinkingLevel) : "";
  const thinkingStyled = thinking ? borderColor(thinking) : "";

  const modelName = shortModelName(input.modelId);
  const makeRight = (includeThinking: boolean, includeWindow: boolean, budget = Infinity, minModelWidth = 0): string => {
    const ctx = formatContextMinimal(input.contextPercent, input.contextWindow, includeWindow, theme);
    const level = includeThinking ? thinkingStyled : "";
    const name = !input.modelId && budget !== Infinity ? "?" : modelName;
    const nameWidth = visibleWidth(name);
    const available = budget - visibleWidth(ctx) - visibleWidth(level) - 1;
    if (minModelWidth && available < Math.min(minModelWidth, nameWidth)) return "";
    const tail = nameWidth <= available ? name : sliceByColumn(name, nameWidth - available + 1, available - 1, true);
    if (!tail) return minModelWidth ? "" : ctx;
    return `${dim(nameWidth <= available ? tail : `…${tail}`)}${level}${dim(" ")}${ctx}`;
  };

  const pathStyle: PathOptions["style"] = {
    normal: (text) => theme.fg("dim", text),
    alias: (text) => theme.fg("mdLink", text),
  };

  const leafName = clean(input.displayPath).split("/").filter(Boolean).pop() ?? clean(input.displayPath);
  const minPathWidth = Math.min(Math.max(4, visibleWidth(leafName)), 12);
  const minGap = 2;
  const maxRightContent = width - minGap - minPathWidth - 8; // four frame columns around each block

  const tiers: Array<{
    pathMode: Exclude<Config["mode"], "native">;
    gitDetail: "full" | "symbols" | "branch" | "none";
    compactModel: boolean;
    includeThinking: boolean;
    includeWindow: boolean;
  }> = [
    { pathMode: input.pathMode, gitDetail: "full", compactModel: false, includeThinking: true, includeWindow: true },
    { pathMode: "short", gitDetail: "symbols", compactModel: false, includeThinking: true, includeWindow: true },
    { pathMode: "short", gitDetail: "symbols", compactModel: true, includeThinking: true, includeWindow: false },
    { pathMode: "short", gitDetail: "branch", compactModel: true, includeThinking: true, includeWindow: false },
    { pathMode: "short", gitDetail: "branch", compactModel: true, includeThinking: false, includeWindow: false },
    { pathMode: "short", gitDetail: "none", compactModel: true, includeThinking: false, includeWindow: false },
  ];

  let leftBlock = "";
  let rightBlock = "";

  for (const tier of tiers) {
    const gitRaw = input.showBranch && tier.gitDetail !== "none"
      ? formatGitMinimal(input.gitState, input.fallbackBranch, tier.gitDetail)
      : "";
    const gitStyled = gitRaw ? theme.fg(gitColor(input.gitState), gitRaw) : "";
    const gitW = visibleWidth(gitStyled);
    const gitSpace = gitW ? gitW + 1 : 0;
    const rightBudget = tier.compactModel ? maxRightContent - gitSpace : Infinity;
    let rightContent = makeRight(tier.includeThinking, tier.includeWindow, rightBudget, 6);
    if (!rightContent && tier.gitDetail === "branch" && gitW > 5) {
      rightContent = makeRight(tier.includeThinking, tier.includeWindow, maxRightContent - 6, 6);
    }
    if (!rightContent) continue;
    const rightCandidate = `${borderColor(" ")}${rightContent}${borderColor(" ──")}`;
    const leftBudget = width - visibleWidth(rightCandidate) - minGap - 4;

    if (leftBudget >= minPathWidth + gitSpace) {
      const pathBudget = leftBudget - gitSpace;
      const pathStyled = formatPath(input.displayPath, pathBudget, {
        mode: tier.pathMode,
        icon: input.showIcon,
        aliasName: input.aliasName,
        style: pathStyle,
      });
      const leftContent = gitStyled
        ? (pathStyled ? `${pathStyled}${dim(" ")}${gitStyled}` : gitStyled)
        : pathStyled;
      leftBlock = leftContent ? `${borderColor("── ")}${leftContent}${borderColor(" ")}` : "";
      rightBlock = rightCandidate;
      break;
    }

    // For branch-only tier, allow truncating a very long branch name before dropping git altogether.
    if (tier.gitDetail === "branch" && gitRaw && leftBudget >= minPathWidth + 6) {
      const maxBranch = Math.min(gitW, Math.max(5, Math.floor((leftBudget - minPathWidth - 1))));
      const trimmedGit = theme.fg(gitColor(input.gitState), truncateToWidth(gitRaw, maxBranch, "…"));
      const pathBudget = leftBudget - visibleWidth(trimmedGit) - 1;
      const pathStyled = formatPath(input.displayPath, pathBudget, {
        mode: "short",
        icon: input.showIcon,
        aliasName: input.aliasName,
        style: pathStyle,
      });
      const leftContent = pathStyled ? `${pathStyled}${dim(" ")}${trimmedGit}` : trimmedGit;
      leftBlock = `${borderColor("── ")}${leftContent}${borderColor(" ")}`;
      rightBlock = rightCandidate;
      break;
    }
  }

  // Ultra-narrow fallback: guarantee context% survives first, then model, then leaf directory.
  if (!rightBlock) {
    const compactRight = makeRight(false, false, width - 6);
    const chosenRightContent = visibleWidth(compactRight) + 6 <= width
      ? compactRight
      : truncateToWidth(compactRight, width - 4, "");
    rightBlock = chosenRightContent ? `${borderColor(" ")}${chosenRightContent}${borderColor(" ──")}` : "";
    const rightW = visibleWidth(rightBlock);
    const leftBudget = width - rightW - minGap - 4;
    if (leftBudget >= 2) {
      const pathStyled = formatPath(input.displayPath, leftBudget, {
        mode: "short",
        icon: false,
        aliasName: input.aliasName,
        style: pathStyle,
      });
      if (pathStyled) leftBlock = `${borderColor("── ")}${pathStyled}${borderColor(" ")}`;
    }
  }

  const line = fillBetween(width, leftBlock, rightBlock, borderColor);
  return overlayScrollLabel(line, width, "↓", hiddenLineCount, borderColor);
}

export interface MinimalEditorSource {
  getTopInput(indicator: WorkingIndicatorLike | undefined, borderColor: (text: string) => string): MinimalTopInput;
  getBottomInput(borderColor: (text: string) => string): MinimalBottomInput;
}

export class MinimalEditor extends CustomEditor {
  private readonly source: MinimalEditorSource;
  private indicator?: WorkingIndicatorLike;

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, source: MinimalEditorSource) {
    super(tui, theme, keybindings, { embedWorkingStatus: true });
    this.source = source;
  }

  override setWorkingStatusIndicator(indicator: Parameters<CustomEditor["setWorkingStatusIndicator"]>[0]): void {
    this.indicator = indicator;
    super.setWorkingStatusIndicator(indicator);
  }

  protected override renderTopBorder(width: number, hiddenLineCount: number): string {
    const borderColor = (text: string) => this.borderColor(text);
    return renderMinimalTopBorder(this.source.getTopInput(this.indicator, borderColor), width, hiddenLineCount);
  }

  protected override renderBottomBorder(width: number, hiddenLineCount: number): string {
    const borderColor = (text: string) => this.borderColor(text);
    return renderMinimalBottomBorder(this.source.getBottomInput(borderColor), width, hiddenLineCount);
  }
}
