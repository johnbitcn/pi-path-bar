import { stripTerminalSequences, truncateToWidth } from "@earendil-works/pi-tui";

/** Footer segment ids: a plugin shows up by calling setStatus("path-bar:<id>", text). */
export const SEGMENT_KEY = /^path-bar:([a-z0-9][a-z0-9._-]{0,31})$/;
export const SEGMENT_ID = /^[a-z0-9][a-z0-9._-]{0,31}$/;
export const CLOCK = "clock";

/** Keep every segment on one line; control separators would break the footer layout. */
export const segmentText = (text: string) => text.replace(/[\r\n\t]/g, " ");

export type SlotSource = "segment" | "adapted";
export interface SlotEntry { id: string; text: string; source: SlotSource }
export interface ExtensionAdapter {
  readonly key: string;
  readonly id: string;
  format(text: string): string | undefined;
}
export interface ClassifiedStatuses {
  /** Type 1 (adapted) and Type 2 (path-bar:*) slots before hidden filtering. */
  slots: Map<string, SlotEntry>;
  /** Type 3 (unknown extensions), sorted alphabetically by status key. */
  unknown: Array<[string, string]>;
}

const LEADING_RESET_OR_WS = /^(?:\s|\x1b\[(?:0|22|39|22;39|39;22)?m)+/;
const LEADING_SGR = /^((?:\x1b\[[0-9;]*m)+)/;
const ANSI_TOKEN = /\x1b\[[0-9;]*m/g;
const RESET_SGR = /^\x1b\[(?:0|22|39|22;39|39;22)?m$/;

function extractColorPrefix(segment: string): string | undefined {
  const match = LEADING_SGR.exec(segment.replace(LEADING_RESET_OR_WS, ""));
  if (!match) return undefined;
  // Track active SGR codes sequentially so reset codes (`\x1b[0m`, `\x1b[39m`, `\x1b[22;39m`, etc.) clear prior styles.
  const codes = match[1].match(ANSI_TOKEN) ?? [];
  const active: string[] = [];
  for (const code of codes) {
    if (RESET_SGR.test(code)) active.length = 0;
    else active.push(code);
  }
  return active.length ? active.join("") : undefined;
}

function wrapColor(color: string | undefined, compact: string): string {
  return color ? `${color}${compact}\x1b[0m` : compact;
}

function preserveColor(original: string, compact: string): string {
  return wrapColor(extractColorPrefix(original), compact);
}

interface UrgentItem {
  index: number;
  limited: boolean;
  remainingScore: number;
  rendered: string;
}

function selectUrgent<T extends UrgentItem>(items: readonly T[], limit = 2): T[] {
  if (items.length <= limit) return [...items];
  return [...items]
    .sort((a, b) => Number(b.limited) - Number(a.limited) || a.remainingScore - b.remainingScore || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index);
}

const PI_USAGE_SHORT_LABELS: Record<string, string> = {
  "7d-son": "7s",
  "7d-opus": "7o",
  "daily": "1d",
  "weekly": "7d",
  "week": "7d",
  "wk": "7d",
  "monthly": "mo",
  "month": "mo",
  "premium": "pm",
  "chat": "ch",
  "comp": "cp",
  "cap": "cap",
  "credits": "cr",
  "extra": "ex",
  "budget": "bg",
  "search": "sr",
  "tools": "tl",
};

function shortResetUnit(rawReset: string): string {
  const trimmed = rawReset.trim().replace(/^in\s+/i, "");
  if (/^now$/i.test(trimmed)) return "now";
  const ltMatch = /^<\s*(\d+)([dhms])$/i.exec(trimmed);
  if (ltMatch) return `${Number(ltMatch[1])}${ltMatch[2].toLowerCase()}`;
  const units = [...trimmed.matchAll(/(\d+)([dhms])/gi)];
  if (units.length) {
    const nonZero = units.find((match) => Number(match[1]) > 0);
    if (!nonZero) return "now";
    return `${Number(nonZero[1])}${nonZero[2].toLowerCase()}`;
  }
  return trimmed;
}

function compactCurrency(raw: string, symbolOverride?: string): string {
  const trimmed = raw.trim();
  const symbol = symbolOverride ?? (/^(?:CNY|CN¥|RMB|¥)/i.test(trimmed) ? "¥" : "$");
  const numeric = trimmed.replace(/^(?:USD|US\$|CNY|CN¥|RMB|\$|¥)\s*/i, "").replace(/,/g, "");
  const value = Number(numeric);
  if (!Number.isFinite(value)) return trimmed;
  if (value === 0) return `${symbol}0`;
  if (Math.abs(value) >= 10) return `${symbol}${Math.round(value)}`;
  if (Math.abs(value) >= 0.1) return `${symbol}${value.toFixed(1).replace(/\.0$/, "")}`;
  return `${symbol}${numeric}`;
}

function formatCreditsFallback(plain: string): string | undefined {
  if (/^no credits$/i.test(plain)) return "cr:0!";
  if (/^(?:credits unlimited|unlimited credits)$/i.test(plain)) return "cr:∞";
  if (/^credits available$/i.test(plain)) return "cr:ok";
  const count = /^(\d+(?:\.\d+)?)\s+credits$/i.exec(plain);
  if (count) return `cr:${count[1]}`;
  return undefined;
}

function formatPiUsageStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/^usage unavailable$/i.test(plainAll)) return preserveColor(text, "u?");

  // Split into per-window chunks starting at `<optional-ansi><label>:` so each window keeps its own color.
  const windowHeader = /(?:^|\s)((?:\x1b\[[0-9;]*m)*[^\s\x1b:]+(?:\x1b\[[0-9;]*m)*:)/g;
  const starts: number[] = [];
  for (const match of text.matchAll(windowHeader)) {
    const start = (match.index ?? 0) + (match[0].length - match[1].length);
    starts.push(start);
  }
  if (!starts.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));

  const parsed: UrgentItem[] = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i], starts[i + 1] ?? text.length).trim();
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const rawLabel = chunk.slice(0, colon);
    const rawRest = chunk.slice(colon + 1);

    const label = stripTerminalSequences(rawLabel).trim();
    const shortLabel = PI_USAGE_SHORT_LABELS[label.toLowerCase()] ?? label;
    const color = extractColorPrefix(rawRest) ?? extractColorPrefix(rawLabel);

    let restPlain = stripTerminalSequences(rawRest).trim();
    const resetMatch = /\(↺(?:in\s+)?([^)]+)\)/.exec(restPlain);
    const resetUnit = resetMatch ? shortResetUnit(resetMatch[1]) : undefined;
    if (resetMatch) restPlain = restPlain.replace(resetMatch[0], "").trim();

    const hasBang = /(?:^|\s)!(?:\s|$)/.test(restPlain);
    if (hasBang) restPlain = restPlain.replace(/(?:^|\s)!(?:\s|$)/g, " ").trim();

    let value = restPlain
      .replace(/\s+left$/i, "")
      .replace(/\s+used$/i, "")
      .replace(/\$(\d+)\.00\b/g, "$$$1")
      .trim();

    const reached = /^REACHED$/i.test(value);
    if (reached) value = "MAX";

    const pctMatch = /^(\d+(?:\.\d+)?)%$/.exec(value);
    const countMatch = /^(\d+)\/(\d+)$/.exec(value);
    let remainingScore = 100;
    if (pctMatch) remainingScore = Number(pctMatch[1]);
    else if (countMatch && Number(countMatch[2]) > 0) remainingScore = (Number(countMatch[1]) / Number(countMatch[2])) * 100;
    else if (reached) remainingScore = 0;

    const limited = hasBang || reached || remainingScore <= 0;
    const compact = `${shortLabel}:${value}${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`;
    parsed.push({ index: i, limited, remainingScore, rendered: wrapColor(color, compact) });
  }

  if (!parsed.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));
  return selectUrgent(parsed).map((item) => item.rendered).join(" ");
}

function formatPiUsageTokenStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/^token tracking unavailable$/i.test(plainAll)) return preserveColor(text, "tok?");

  const segments = text.split(/\s*·\s*/);
  const formatted: string[] = [];
  for (const part of segments) {
    const plain = stripTerminalSequences(part).trim();
    const dollar = /\$[\d.,]+/.exec(plain)?.[0];
    if (!dollar) continue;
    const compact = compactCurrency(dollar, "$");
    formatted.push(wrapColor(extractColorPrefix(part), compact));
  }
  if (!formatted.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));
  return formatted.join("/");
}

const NARUMI_UNAVAILABLE =
  /^(?:auth unavailable|selection required|usage err:.*|usage unavailable|chatgpt usage: web only|.+ (?:usage|API|balance|credits) unavailable)$/i;

const NARUMI_PROVIDERS =
  /^(codex|chatgpt(?:\s+plan)?|minimax(?:\s+(?:cn|global|intl))?|cmd|kimi|zai|zen|copilot|anthropic|openrouter|vercel|baseten|deepseek|fireworks|moonshot)\s+/i;

const NARUMI_SHORT_LABELS: Record<string, string> = {
  ...PI_USAGE_SHORT_LABELS,
  "w": "7d",
  "m": "mo",
  "r": "5h",
};

const NARUMI_COPILOT_LABELS: Record<string, string> = {
  "premium": "pm",
  "chat": "ch",
  "credits": "cr",
};

const CURRENCY_AMOUNT = /(?:CN¥|CNY|RMB|USD|US\$|\$|¥)\s*[\d.,]+/gi;

function inferCountdownLabel(index: number, rawReset: string): string {
  const days = /(\d+)d/i.exec(rawReset);
  if (index === 0 && days) return Number(days[1]) > 7 ? "mo" : "7d";
  if (index === 1 && days && Number(days[1]) > 7) return "mo";
  return (["5h", "7d", "mo"] as const)[index] ?? `w${index + 1}`;
}

function formatNarumiCopilot(body: string): string | undefined {
  const subMatch = /^(premium|chat|credits)\b\s*/i.exec(body);
  const shortLabel = NARUMI_COPILOT_LABELS[(subMatch?.[1] ?? "premium").toLowerCase()] ?? "pm";
  const rest = subMatch ? body.slice(subMatch[0].length).trim() : body.trim();
  if (/^unlimited\b/i.test(rest)) return `${shortLabel}:∞`;

  const pctMatch = /(\d+(?:\.\d+)?)%/.exec(rest);
  if (!pctMatch) return undefined;
  const pct = Number(pctMatch[1]);
  const hasOver = /\+\s*\d+(?:\.\d+)?\s*over\b/i.test(rest);
  const resetMatch = /[↻↺⟳]\s*(.+)$/.exec(rest);
  const resetUnit = resetMatch ? shortResetUnit(resetMatch[1]) : undefined;
  const limited = pct <= 0 || hasOver;
  return `${shortLabel}:${pctMatch[1]}%${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`;
}

function formatUsageStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (NARUMI_UNAVAILABLE.test(plainAll)) return preserveColor(text, "u?");

  const providerMatch = NARUMI_PROVIDERS.exec(plainAll);
  if (!providerMatch && !plainAll.includes("·") && /^[^\s:]+:/.test(plainAll)) {
    return formatPiUsageStatus(text);
  }

  const provider = providerMatch ? providerMatch[1].toLowerCase().split(/\s+/)[0] : undefined;
  let body = providerMatch ? plainAll.slice(providerMatch[0].length).trim() : plainAll;
  if (provider === "codex") {
    // Strip optional Codex variant suffixes such as `(Fast unknown)` or `fast` without eating `no credits`.
    body = body
      .replace(/^\([^)]+\)\s+/, "")
      .replace(/^(?!(?:no\s+credits|credits\b))[a-z][a-z0-9_-]*\s+(?=(?:\d+(?:\.\d+)?%|\S+:|\d+(?:\.\d+)?\s+credits\b|no\s+credits\b|credits\b))/i, "")
      .trim();
  }

  if (provider === "copilot") {
    const copilot = formatNarumiCopilot(body);
    if (copilot) return preserveColor(text, copilot);
  }

  const credits = formatCreditsFallback(body);
  if (credits) return preserveColor(text, credits);

  if (/^no (?:Model APIs|rated) usage$/i.test(body)) return preserveColor(text, "$0");

  const isUsed = provider === "zen";
  const parsed: UrgentItem[] = [];
  const pushWindow = (label: string, valueText: string, pct: number | undefined, rawReset: string | undefined, index: number) => {
    const shortLabel = NARUMI_SHORT_LABELS[label.toLowerCase()] ?? label;
    const isUnlimited = /^unlimited$/i.test(valueText);
    const displayValue = isUnlimited ? "∞" : valueText;
    const remainingScore = isUnlimited
      ? 101
      : pct === undefined
        ? 100
        : isUsed
          ? 100 - pct
          : pct;
    const limited = pct !== undefined && (isUsed ? pct >= 100 : pct <= 0);
    const resetUnit = rawReset ? shortResetUnit(rawReset) : undefined;
    const rendered = `${shortLabel}:${displayValue}${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`;
    parsed.push({ index, limited, remainingScore, rendered });
  };

  if (body.includes("·")) {
    const parts = body.split(/\s*·\s*/).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const labeled = /^([^\s:]+):\s*(unlimited|\d+(?:\.\d+)?%)(?:\s*[↻↺⟳]\s*(.+))?$/i.exec(part);
      if (labeled) {
        const val = labeled[2];
        const pct = val.endsWith("%") ? Number(val.slice(0, -1)) : undefined;
        pushWindow(labeled[1], val, pct, labeled[3], i);
        continue;
      }
      const countdown = /^(\d+(?:\.\d+)?)%\s*[↻↺⟳]\s*(.+)$/.exec(part);
      if (countdown) {
        pushWindow(inferCountdownLabel(i, countdown[2]), `${countdown[1]}%`, Number(countdown[1]), countdown[2], i);
      }
    }
  } else {
    const labeled = /^([^\s:]+):\s*(unlimited|\d+(?:\.\d+)?%)(?:\s*[↻↺⟳]\s*(.+))?$/i.exec(body);
    if (labeled) {
      const val = labeled[2];
      const pct = val.endsWith("%") ? Number(val.slice(0, -1)) : undefined;
      pushWindow(labeled[1], val, pct, labeled[3], 0);
    } else {
      const countdowns = [...body.matchAll(/(\d+(?:\.\d+)?)%\s*[↻↺⟳]\s*(<\s*\d+[dhms]|now|[^\s·]+)/gi)];
      if (countdowns.length) {
        for (let i = 0; i < countdowns.length; i++) {
          const match = countdowns[i];
          pushWindow(inferCountdownLabel(i, match[2]), `${match[1]}%`, Number(match[1]), match[2], i);
        }
      } else {
        const valueLabels = [...body.matchAll(/(\d+(?:\.\d+)?)%\s+([a-z0-9_-]+)/gi)];
        for (let i = 0; i < valueLabels.length; i++) {
          const match = valueLabels[i];
          pushWindow(match[2], `${match[1]}%`, Number(match[1]), undefined, i);
        }
      }
    }
  }

  if (parsed.length) {
    return preserveColor(text, selectUrgent(parsed).map((item) => item.rendered).join(" "));
  }

  const currencies = [...body.matchAll(CURRENCY_AMOUNT)].map((match) => compactCurrency(match[0]));
  if (currencies.length) {
    return preserveColor(text, currencies.join("/"));
  }

  const fallback = plainAll.replace(/\bleft\b/gi, "").replace(/\s+/g, " ").trim();
  return fallback ? preserveColor(text, truncateToWidth(fallback, 14, "…")) : undefined;
}

const USAGE_BARS_SHORT_LABELS: Record<string, string> = {
  "5h": "5h",
  "S": "s",
  "I": "i",
  "L": "L",
  "W": "7d",
};

const USAGE_BAR_LANE =
  /(?:^|\s|\x1b\[[0-9;]*m)(5h|[SILW])(?:\x1b\[[0-9;]*m|\s)+[█░](?:[█░]|\x1b\[[0-9;]*m)*\s+((?:\x1b\[[0-9;]*m)*(?:<1|\d+(?:\.\d+)?)%)/g;

const ANSI_OR_CURRENCY = /\x1b\[[0-9;]*m|(?:CN¥|CNY|RMB|USD|US\$|\$|¥)\s*[\d.,]+/gi;

function formatUsageBarsStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/\busage:\s*loading/i.test(plainAll)) return preserveColor(text, "u…");
  if (/\busage unavailable\b/i.test(plainAll)) return preserveColor(text, "u?");

  if (/[█░]/.test(plainAll)) {
    const matches = [...text.matchAll(USAGE_BAR_LANE)];
    const parsed: UrgentItem[] = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const rawPrefix = match[1];
      const rawPct = match[2];
      const shortLabel = USAGE_BARS_SHORT_LABELS[rawPrefix] ?? rawPrefix;
      const pctPlain = stripTerminalSequences(rawPct).trim();
      const pctNum = pctPlain === "<1%" ? 0.5 : Number(pctPlain.slice(0, -1));
      const color = extractColorPrefix(rawPct);

      const tailStart = (match.index ?? 0) + match[0].length;
      const tailEnd = matches[i + 1]?.index ?? text.length;
      const tailPlain = stripTerminalSequences(text.slice(tailStart, tailEnd));
      const resetMatch = /[⟳↻↺]\s*(<\s*\d+[dhms]|now|(?:\d+[dhms]\s*)+)/i.exec(tailPlain);
      const resetUnit = resetMatch ? shortResetUnit(resetMatch[1]) : undefined;

      const limited = pctNum >= 100;
      const compact = `${shortLabel}:${pctPlain}${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`;
      parsed.push({ index: i, limited, remainingScore: 100 - pctNum, rendered: wrapColor(color, compact) });
    }
    if (parsed.length) {
      let rendered = selectUrgent(parsed).map((item) => item.rendered).join(" ");
      const staleMatch = /((?:\x1b\[[0-9;]*m)*)\s*((?:\x1b\[[0-9;]*m)*)\bstale\b(?:\x1b\[[0-9;]*m)*\s*$/i.exec(text);
      if (staleMatch) {
        const staleColor = extractColorPrefix(`${staleMatch[1]}${staleMatch[2]}`);
        rendered += wrapColor(staleColor, "~");
      }
      return rendered;
    }
  }

  // Finance-only mode: extract currency amounts while tracking active ANSI color spans.
  const activeSgr: string[] = [];
  const amounts: Array<{ compact: string; color: string | undefined }> = [];
  for (const match of text.matchAll(ANSI_OR_CURRENCY)) {
    const token = match[0];
    if (token.startsWith("\x1b[")) {
      if (RESET_SGR.test(token)) activeSgr.length = 0;
      else activeSgr.push(token);
      continue;
    }
    amounts.push({
      compact: compactCurrency(token),
      color: activeSgr.length ? activeSgr.join("") : undefined,
    });
  }
  if (!amounts.length) return preserveColor(text, "u?");
  const firstColor = amounts[0].color;
  if (amounts.every((item) => item.color === firstColor)) {
    return wrapColor(firstColor, amounts.map((item) => item.compact).join("/"));
  }
  return amounts.map((item) => wrapColor(item.color, item.compact)).join("/");
}

function shortModelWindowLabel(model: string | undefined, rawLabel: string): string {
  const normalized = PI_USAGE_SHORT_LABELS[rawLabel.toLowerCase()] ?? rawLabel.toLowerCase();
  if (model && normalized === "7d") {
    const m = model.toLowerCase();
    if (m === "sonnet") return "7s";
    if (m === "opus") return "7o";
    if (m === "haiku") return "7h";
  }
  return normalized;
}

function formatProviderUsageStatus(text: string): string | undefined {
  const rawPlain = stripTerminalSequences(text).trim();
  if (!rawPlain) return undefined;
  const plain = rawPlain.replace(/\s*\([^)]*\bold\)$/i, "").trim();
  if (!plain) return undefined;

  if (/^checking$/i.test(plain)) return preserveColor(text, "u…");
  const rateLimited = /^usage rate-limited\s*\(([^)]+)\)$/i.exec(plain);
  if (rateLimited) return preserveColor(text, `u!↺${shortResetUnit(rateLimited[1])}`);
  if (/^usage (?:unavailable|error)$/i.test(plain)) return preserveColor(text, "u?");

  const withoutProvider = plain.replace(/^(?:codex|claude|anthropic|openai)\b\s*/i, "").trim();
  const credits = formatCreditsFallback(withoutProvider);
  if (credits) return preserveColor(text, credits);

  // Anthropic enterprise / extra spend budgets: `<pct>% $used/$limit [extra]`.
  const budgetMatches = [...plain.matchAll(/(\d+(?:\.\d+)?)%\s+(\$[\d.,]+)\/(\$[\d.,]+)(?:\s+(extra))?/gi)];
  if (budgetMatches.length === 1) {
    const [, pct, used, limit] = budgetMatches[0];
    const limited = Number(pct) >= 100;
    return preserveColor(text, `${compactCurrency(used, "$")}/${compactCurrency(limit, "$")}${limited ? "!" : ""}`);
  }
  if (budgetMatches.length >= 2) {
    const parsed: UrgentItem[] = budgetMatches.map((match, index) => {
      const pctNum = Number(match[1]);
      const limited = pctNum >= 100;
      const label = match[4] ? "ex" : index === 0 ? "bg" : "ex";
      return {
        index,
        limited,
        remainingScore: 100 - pctNum,
        rendered: `${label}:${match[1]}%${limited ? "!" : ""}`,
      };
    });
    return preserveColor(text, selectUrgent(parsed).map((item) => item.rendered).join(" "));
  }

  // OpenRouter / spend pair without percentage (e.g. `OpenRouter · $12.34/$50`).
  const spendPair = /(\$[\d.,]+)\/(\$[\d.,]+)/.exec(plain);
  if (spendPair && !plain.includes("%")) {
    return preserveColor(text, `${compactCurrency(spendPair[1], "$")}/${compactCurrency(spendPair[2], "$")}`);
  }

  const parsed: UrgentItem[] = [];
  if (plain.includes("·")) {
    const parts = plain.split(/\s*·\s*/).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const match = /^(?:(sonnet|opus|haiku)\s+)?([a-z0-9_-]+)\s+(\d+(?:\.\d+)?)%(?:\s*[↻↺⟳]\s*(.+))?$/i.exec(parts[i].trim());
      if (!match) continue;
      const label = shortModelWindowLabel(match[1], match[2]);
      const pctNum = Number(match[3]);
      const limited = pctNum >= 100;
      const resetUnit = match[4] ? shortResetUnit(match[4]) : undefined;
      parsed.push({
        index: parsed.length,
        limited,
        remainingScore: 100 - pctNum,
        rendered: `${label}:${match[3]}%${limited ? "!" : ""}${limited && resetUnit ? `↺${resetUnit}` : ""}`,
      });
    }
  } else {
    for (const match of plain.matchAll(/(\d+(?:\.\d+)?)%\s+([a-z0-9_-]+)/gi)) {
      const pctNum = Number(match[1]);
      const limited = pctNum >= 100;
      const label = PI_USAGE_SHORT_LABELS[match[2].toLowerCase()] ?? match[2].toLowerCase();
      parsed.push({
        index: parsed.length,
        limited,
        remainingScore: 100 - pctNum,
        rendered: `${label}:${match[1]}%${limited ? "!" : ""}`,
      });
    }
  }

  if (parsed.length) {
    return preserveColor(text, selectUrgent(parsed).map((item) => item.rendered).join(" "));
  }

  return preserveColor(text, truncateToWidth(plain, 14, "…"));
}

const QUOTA_SHORT_LABELS: Record<string, string> = {
  "claude": "Cl",
  "codex": "Cx",
  "agy": "Ag",
  "agy c/g": "AgC",
  "op-go": "OG",
  "gh": "GH",
};

function formatQuotaStatus(text: string): string | undefined {
  const plainAll = stripTerminalSequences(text).trim();
  if (!plainAll) return undefined;
  if (/^quota\s*(?:…|\.\.\.)$/i.test(plainAll)) return preserveColor(text, "u…");
  if (/^quota:\s*no providers/i.test(plainAll)) return preserveColor(text, "u?");

  const chunks = text.trim().split(/ {2,}/);
  const parsed: UrgentItem[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const colon = chunk.indexOf(":");
    if (colon === -1) continue;
    const rawLabel = chunk.slice(0, colon);
    const rawRest = chunk.slice(colon + 1);
    const label = stripTerminalSequences(rawLabel).trim();
    if (!label) continue;
    const shortLabel = QUOTA_SHORT_LABELS[label.toLowerCase()] ?? label.slice(0, 3);
    const color = extractColorPrefix(rawRest);
    const valuePlain = stripTerminalSequences(rawRest).trim().replace(/^[○◔◕●]\s*/, "").trim();

    const pctMatch = /^(\d+(?:\.\d+)?)%$/.exec(valuePlain);
    if (pctMatch) {
      const pctNum = Number(pctMatch[1]);
      const limited = pctNum >= 100;
      const compact = `${shortLabel}:${pctMatch[1]}%${limited ? "!" : ""}`;
      parsed.push({ index: i, limited, remainingScore: 100 - pctNum, rendered: wrapColor(color, compact) });
      continue;
    }
    if (/^[!…]$/.test(valuePlain)) {
      parsed.push({ index: i, limited: true, remainingScore: 0, rendered: wrapColor(color, `${shortLabel}:${valuePlain}`) });
      continue;
    }
    if (/^[~?·]$/.test(valuePlain)) {
      parsed.push({ index: i, limited: false, remainingScore: 50, rendered: wrapColor(color, `${shortLabel}:${valuePlain}`) });
    }
  }

  if (!parsed.length) return preserveColor(text, truncateToWidth(plainAll, 14, "…"));
  return selectUrgent(parsed).map((item) => item.rendered).join(" ");
}

/** Built-in Type 1 adapters that compress known third-party statuses for the top border. */
export const ADAPTED_EXTENSIONS: readonly ExtensionAdapter[] = [
  {
    key: "pi-usage",
    id: "pi-usage",
    format: formatPiUsageStatus,
  },
  {
    key: "pi-usage-token-status",
    id: "pi-usage-token-status",
    format: formatPiUsageTokenStatus,
  },
  {
    key: "usage",
    id: "usage",
    format: formatUsageStatus,
  },
  {
    key: "@hk_net/pi-usage-bars",
    id: "pi-usage-bars",
    format: formatUsageBarsStatus,
  },
  {
    key: "provider-usage",
    id: "provider-usage",
    format: formatProviderUsageStatus,
  },
  {
    key: "00-quota",
    id: "quota",
    format: formatQuotaStatus,
  },
  {
    key: "ssh",
    id: "ssh",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const body = plain.replace(/^ssh:\s*/i, "");
      const remote = body.split(":")[0] ?? body;
      const host = remote.includes("@") ? remote.slice(remote.indexOf("@") + 1) : remote;
      const label = host.trim() || plain;
      return preserveColor(text, truncateToWidth(`ssh:${label}`, 14, "…"));
    },
  },
  {
    key: "preset",
    id: "preset",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const name = plain.replace(/^preset:\s*/i, "").trim();
      return preserveColor(text, truncateToWidth(`P:${name || plain}`, 12, "…"));
    },
  },
  {
    key: "debug-provider",
    id: "debug-provider",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      return plain ? preserveColor(text, "dbg") : undefined;
    },
  },
  {
    key: "provider-debug",
    id: "debug-provider",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      return plain ? preserveColor(text, "dbg") : undefined;
    },
  },
  {
    key: "ponytail",
    id: "ponytail",
    format(text) {
      const plain = stripTerminalSequences(text).trim();
      if (!plain) return undefined;
      const modeMatch = /\b(ULTRA|FULL|LITE|OFF)\b/i.exec(plain);
      const modeWord = modeMatch?.[1]?.toUpperCase();
      if (modeWord === "OFF") return preserveColor(text, "♘-");
      const level = modeWord
        ? modeWord[0]
        : (/([A-Za-z]+)\s*$/.exec(plain)?.[1]?.[0]?.toUpperCase() ?? "");
      if (!level) return undefined;
      const inactive = /[○◯◌]/.test(plain);
      const active = /[●◉◆✓✔]/.test(plain);
      const horse = active ? "♞" : inactive ? "♘" : "♞";
      return preserveColor(text, `${horse}${level}`);
    },
  },
];

export function segmentEntries(statuses: ReadonlyMap<string, string>): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, text] of statuses) {
    const id = SEGMENT_KEY.exec(key)?.[1];
    if (id) entries.set(id, segmentText(text));
  }
  return entries;
}

/**
 * Split extension statuses into three tiers for Minimal mode:
 * - Type 2: explicit `path-bar:<id>` segments (highest priority; suppresses matching Type 1 key)
 * - Type 1: known third-party statuses compressed by built-in adapters
 * - Type 3: unknown extensions rendered on the auto-hiding line below the bottom border
 */
export function classifyStatuses(
  statuses: ReadonlyMap<string, string>,
  adapters: readonly ExtensionAdapter[] = ADAPTED_EXTENSIONS,
): ClassifiedStatuses {
  const slots = new Map<string, SlotEntry>();
  const remaining: Array<[string, string]> = [];
  for (const [key, raw] of statuses) {
    const text = segmentText(raw);
    const id = SEGMENT_KEY.exec(key)?.[1];
    if (id) {
      slots.set(id, { id, text, source: "segment" });
    } else {
      remaining.push([key, text]);
    }
  }
  const byKey = new Map(adapters.map((adapter) => [adapter.key, adapter]));
  const unknown: Array<[string, string]> = [];
  for (const [key, text] of remaining) {
    const adapter = byKey.get(key);
    if (adapter) {
      // Explicit Type 2 registration wins and suppresses the legacy key so it does not duplicate below.
      if (slots.has(adapter.id)) continue;
      const formatted = adapter.format(text);
      if (formatted) {
        slots.set(adapter.id, { id: adapter.id, text: segmentText(formatted), source: "adapted" });
        continue;
      }
    }
    unknown.push([key, text]);
  }
  unknown.sort(([a], [b]) => a.localeCompare(b));
  return { slots, unknown };
}

/**
 * Left-to-right order of the segments right of the path. The configured order wins; ids that
 * are registered but not configured go left of the clock, sorted by id.
 */
export function resolveOrder(segments: string[], registered: Iterable<string>): string[] {
  const known = new Set([CLOCK, ...registered]);
  const listed = [...new Set(segments)].filter((id) => known.has(id));
  if (!listed.includes(CLOCK)) listed.push(CLOCK);
  const at = listed.indexOf(CLOCK);
  const unknown = [...known].filter((id) => !listed.includes(id)).sort((a, b) => a.localeCompare(b));
  return [...listed.slice(0, at), ...unknown, ...listed.slice(at)];
}
