import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { ConfigStore } from "../src/config.ts";
import extension from "../src/index.ts";
import {
  MinimalEditor,
  compactTokens,
  formatContextMinimal,
  formatCostMinimal,
  formatGitMinimal,
  formatTimeMinimal,
  overlayScrollLabel,
  packRightSlots,
  renderMinimalBottomBorder,
  renderMinimalTopBorder,
  shortModelName,
  shortThinking,
  type MinimalBottomInput,
  type MinimalTopInput,
} from "../src/minimal.ts";
import { ADAPTED_EXTENSIONS, SEGMENT_ID, classifyStatuses } from "../src/segments.ts";
import { openSettings } from "../src/settings.ts";

initTheme("dark", false);

const plainTheme = { fg: (_color: string, text: string) => text };
const colorTheme = {
  fg: (color: string, text: string) => {
    const code = color === "error" ? "31" : color === "warning" ? "33" : color === "mdLink" ? "34" : "2";
    return `\x1b[${code}m${text}\x1b[0m`;
  },
};
const borderAnsi = (text: string) => `\x1b[36m${text}\x1b[0m`;

function tempDir(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "pi-path-bar-minimal-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("minimal formatters compress models, thinking, context, cost, time and git cleanly", () => {
  assert.equal(shortModelName("claude-sonnet-4-5-20250929"), "sonnet-4.5");
  assert.equal(shortModelName("claude-sonnet-4-5-20250929", true), "s4.5");
  assert.equal(shortModelName("claude-3-7-sonnet-20250219"), "sonnet-3.7");
  assert.equal(shortModelName("claude-opus-4-6", true), "o4.6");
  assert.equal(shortModelName("gemini-2.5-pro-preview"), "gem-2.5p");
  assert.equal(shortModelName("gemini-2.5-flash-lite", true), "g2.5fl");
  assert.equal(shortModelName("gpt-5.2-codex-2026-01-01"), "gpt-5.2c");
  assert.equal(shortModelName("deepseek-reasoner"), "ds-r1");
  assert.equal(shortModelName("my-custom-model-20260101"), "my-custom-model");
  assert.equal(shortModelName(undefined), "no-model");
  assert.equal(shortModelName(undefined, true), "?");

  assert.equal(shortThinking("off"), "");
  assert.equal(shortThinking("minimal"), "·m");
  assert.equal(shortThinking("low"), "·L");
  assert.equal(shortThinking("medium"), "·M");
  assert.equal(shortThinking("high"), "·H");
  assert.equal(shortThinking("xhigh"), "·X");

  assert.equal(compactTokens(850), "850");
  assert.equal(compactTokens(12340), "12k");
  assert.equal(compactTokens(1_000_000), "1M");
  assert.equal(compactTokens(1_250_000), "1.3M");

  assert.equal(formatCostMinimal(0, false), "");
  assert.equal(formatCostMinimal(0, true), "sub");
  assert.equal(formatCostMinimal(0.004, false), "$.004");
  assert.equal(formatCostMinimal(0.123, false), "$0.12");
  assert.equal(formatCostMinimal(0.123, true), "$0.12ˢ");

  assert.equal(formatTimeMinimal(new Date(2026, 0, 1, 14, 5), "24h"), "14:05");
  assert.equal(formatTimeMinimal(new Date(2026, 0, 1, 14, 5), "12h"), "2:05p");
  assert.equal(formatTimeMinimal(new Date(2026, 0, 1, 0, 9), "12h"), "12:09a");

  assert.equal(formatContextMinimal(null, 200_000, true, plainTheme), "○?/200k");
  assert.equal(formatContextMinimal(0, 200_000, false, plainTheme), "○0%");
  assert.equal(formatContextMinimal(20, 200_000, false, plainTheme), "◔20%");
  assert.equal(formatContextMinimal(42.4, 200_000, true, plainTheme), "◐42%/200k");
  assert.equal(formatContextMinimal(78, 200_000, false, colorTheme), "\x1b[33m◕78%\x1b[0m");
  assert.equal(formatContextMinimal(93, 200_000, false, colorTheme), "\x1b[31m●93%\x1b[0m");

  const readyGit = {
    kind: "ready" as const, head: "feat/min", detached: false, oid: "1234567",
    operation: "rebase-i 2/5", behind: 1, ahead: 2, stash: 0, conflicted: 0, staged: 1, dirty: 3, untracked: 2,
  };
  assert.equal(formatGitMinimal(readyGit, undefined, "full"), "feat/min R2/5 ⇣1⇡2+1!3?2");
  assert.equal(formatGitMinimal(readyGit, undefined, "symbols"), "feat/min R2/5 ⇣⇡+!?");
  assert.equal(formatGitMinimal(readyGit, undefined, "branch"), "feat/min R2/5");
  assert.equal(formatGitMinimal({ ...readyGit, operation: "cherry-pick", behind: 0, ahead: 0, staged: 0, dirty: 0, untracked: 0 }, undefined, "full"), "feat/min CP");
  assert.equal(formatGitMinimal({ kind: "none" }, "main", "full"), "");
  assert.equal(formatGitMinimal({ kind: "unknown" }, "main", "full"), "main?");
});

test("classifyStatuses separates Type 2 segments, Type 1 adapted extensions, and Type 3 unknown extensions", () => {
  const result = classifyStatuses(new Map([
    ["path-bar:net", "⌁"],
    ["ssh", "\x1b[36mSSH: alice@prod.example:/srv/app\x1b[0m"],
    ["preset", "preset:fast"],
    ["usage", "5h:98% left"],
    ["debug-provider", "provider debug"],
    ["custom-foo", "Turn 3 running"],
    ["another-ext", "Ready"],
  ]));

  assert.equal(result.slots.get("net")?.source, "segment");
  assert.equal(result.slots.get("net")?.text, "⌁");
  assert.equal(result.slots.get("ssh")?.source, "adapted");
  assert.equal(stripTerminalSequences(result.slots.get("ssh")!.text), "ssh:prod.exam…");
  assert.ok(result.slots.get("ssh")!.text.startsWith("\x1b[36m"));
  assert.equal(result.slots.get("preset")?.text, "P:fast");
  assert.equal(result.slots.get("usage")?.text, "5h:98%");
  assert.equal(result.slots.get("debug-provider")?.text, "dbg");
  assert.deepEqual(result.unknown, [["another-ext", "Ready"], ["custom-foo", "Turn 3 running"]]);

  // Built-in ponytail adapter maps indicator + mode into 2-column chess knight notation.
  for (const [raw, expected] of [
    ["○ 🐴 ponytail: ⚡ FULL", "♘F"],
    ["● 🐴 ponytail: ⚡ FULL", "♞F"],
    ["● 🐴 ponytail: 🔥 ULTRA", "♞U"],
    ["○ 🐴 ponytail: 🪶 LITE", "♘L"],
    ["○ 🐴 ponytail: OFF", "♘-"],
    ["● 🐴 ponytail: OFF", "♘-"],
  ] as const) {
    const classified = classifyStatuses(new Map([["ponytail", raw]]));
    assert.equal(classified.slots.get("ponytail")?.source, "adapted");
    assert.equal(classified.slots.get("ponytail")?.text, expected);
    assert.equal(visibleWidth(classified.slots.get("ponytail")!.text), 2);
    assert.deepEqual(classified.unknown, []);
  }
  const coloredPonytail = classifyStatuses(new Map([["ponytail", "\x1b[32m●\x1b[0m 🐴 ponytail: ⚡ FULL"]]));
  assert.equal(coloredPonytail.slots.get("ponytail")?.text, "\x1b[32m♞F\x1b[0m");

  // Explicit Type 2 registration overrides Type 1 adapter with the same id and suppresses legacy duplicate.
  const override = classifyStatuses(new Map([
    ["path-bar:ssh", "SSH!"],
    ["ssh", "SSH: prod:/app"],
    ["path-bar:pi-usage", "5h:99%"],
    ["pi-usage", "5h:82% left (↺in 2h 15m)"],
  ]));
  assert.equal(override.slots.get("ssh")?.source, "segment");
  assert.equal(override.slots.get("ssh")?.text, "SSH!");
  assert.equal(override.slots.get("pi-usage")?.source, "segment");
  assert.equal(override.slots.get("pi-usage")?.text, "5h:99%");
  assert.deepEqual(override.unknown, []);
});

test("built-in @kaishin/pi-usage adapters apply Strategy A and Scheme T2 with per-window colors", () => {
  // Strategy A: dual window drops reset countdown when not limited and keeps per-window ANSI colors (including \x1b[22;39m).
  const normal = "\x1b[2m5h:\x1b[22;39m\x1b[32m82% left\x1b[39m \x1b[2m(↺in 2h 15m)\x1b[22;39m \x1b[33m7d:\x1b[39m\x1b[33m65% left\x1b[39m \x1b[2m(↺in 4d 3h 12m)\x1b[22;39m";
  const resNormal = classifyStatuses(new Map([["pi-usage", normal]]));
  assert.equal(resNormal.slots.get("pi-usage")?.source, "adapted");
  assert.equal(stripTerminalSequences(resNormal.slots.get("pi-usage")!.text), "5h:82% 7d:65%");
  assert.equal(resNormal.slots.get("pi-usage")!.text, "\x1b[32m5h:82%\x1b[0m \x1b[33m7d:65%\x1b[0m");
  assert.deepEqual(resNormal.unknown, []);

  // Strategy A: limited / 0% window appends single-unit reset countdown.
  const limited = "\x1b[31m5h:\x1b[39m\x1b[31m0% left\x1b[39m\x1b[31m !\x1b[39m \x1b[2m(↺in 2h 15m)\x1b[22;39m \x1b[2m7d:\x1b[22;39m\x1b[32m65% left\x1b[39m \x1b[2m(↺in 4d 3h)\x1b[22;39m";
  const resLimited = classifyStatuses(new Map([["pi-usage", limited]]));
  assert.equal(stripTerminalSequences(resLimited.slots.get("pi-usage")!.text), "5h:0%!↺2h 7d:65%");

  // Strategy A: >2 windows keeps the 2 most urgent windows in original relative order, abbreviates long labels & currency.
  const multi = "premium:293/300 (↺in 12d) chat:10/100 (↺in 5d) extra:$1.25/$10.00 (↺in 3d) cap:REACHED (↺now)";
  const resMulti = classifyStatuses(new Map([["pi-usage", multi]]));
  assert.equal(stripTerminalSequences(resMulti.slots.get("pi-usage")!.text), "ch:10/100 cap:MAX!↺now");

  const currency = classifyStatuses(new Map([["pi-usage", "extra:$1.25/$10.00 (↺in 2d) credits:$4.50 used"]]));
  assert.equal(stripTerminalSequences(currency.slots.get("pi-usage")!.text), "ex:$1.25/$10 cr:$4.50");

  // Strategy A unavailable fallback preserves warning color.
  const unavail = classifyStatuses(new Map([["pi-usage", "\x1b[33musage unavailable\x1b[39m"]]));
  assert.equal(unavail.slots.get("pi-usage")?.text, "\x1b[33mu?\x1b[0m");

  // Scheme T2: pi-usage-token-status compacts 5h/wk/mo costs to slash notation with per-window risk colors.
  const tokenStatus = "\x1b[2m5h:\x1b[22;39m\x1b[36m$1.23\x1b[39m · \x1b[33mwk:\x1b[39m\x1b[36m$4.56\x1b[39m · \x1b[31mmo:\x1b[39m\x1b[36m$12.34\x1b[39m";
  const resToken = classifyStatuses(new Map([["pi-usage-token-status", tokenStatus]]));
  assert.equal(resToken.slots.get("pi-usage-token-status")?.source, "adapted");
  assert.equal(stripTerminalSequences(resToken.slots.get("pi-usage-token-status")!.text), "$1.2/$4.6/$12");
  assert.equal(resToken.slots.get("pi-usage-token-status")!.text, "\x1b[2m$1.2\x1b[0m/\x1b[33m$4.6\x1b[0m/\x1b[31m$12\x1b[0m");

  const tokenUnavail = classifyStatuses(new Map([["pi-usage-token-status", "\x1b[33mtoken tracking unavailable\x1b[39m"]]));
  assert.equal(tokenUnavail.slots.get("pi-usage-token-status")?.text, "\x1b[33mtok?\x1b[0m");
});

test("built-in @narumitw/pi-usage adapter (usage) handles countdowns, static windows, copilot, balances and Type 2 override", () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ["5h:98% left", "5h:98%"],
    ["cmd:50% left", "cmd:50%"],
    ["codex:50% left", "codex:50%"],
    ["\x1b[31m\x1b[39m\x1b[32m5h:98% left\x1b[39m", "\x1b[32m5h:98%\x1b[0m"],
    ["\x1b[31m\x1b[22;39m5h:98% left", "5h:98%"],
    ["codex 89% ↻ 2h30m · 97% ↻ 5d17h", "5h:89% 7d:97%"],
    ["codex fast 0% ↻ 2h30m · 97% ↻ 5d17h", "5h:0%!↺2h 7d:97%"],
    ["codex 0% ↻ 0m · 97% ↻ 5d17h", "5h:0%!↺now 7d:97%"],
    ["codex 0% ↻ < 1m", "5h:0%!↺1m"],
    ["codex (Fast unknown) 89% ↻ 2h30m · 97% ↻ 5d17h", "5h:89% 7d:97%"],
    ["kimi 82% ↻ 2h30m · 65% ↻ 4d12h · mo:90%", "5h:82% 7d:65%"],
    ["cmd 5h:100% · wk:97% · mo:98%", "7d:97% mo:98%"],
    ["minimax cn 5h:unlimited · wk:70%", "5h:∞ 7d:70%"],
    ["zen r:12% · w:45% · m:60%", "7d:45% mo:60%"],
    ["zen 100% ↻ 2h15m · 45% ↻ 4d", "5h:100%!↺2h 7d:45%"],
    ["zen 12% ↻ 2h30m · 45% ↻ 4d · 60% ↻ 18d", "7d:45% mo:60%"],
    ["chatgpt plan 85% ↻ 2h30m 92% ↻ 5d", "5h:85% 7d:92%"],
    ["chatgpt plan 85% 5h 92% wk", "5h:85% 7d:92%"],
    ["copilot 293/300 98% ↻ 12d", "pm:98%"],
    ["copilot chat 0/100 0% +2 over ↻ 5d", "ch:0%!↺5d"],
    ["copilot credits 0/100 0% +5 over ↻ 12d", "cr:0%!↺12d"],
    ["copilot premium unlimited", "pm:∞"],
    ["codex no credits", "cr:0!"],
    ["codex credits unlimited", "cr:∞"],
    ["codex credits available", "cr:ok"],
    ["codex 25 credits", "cr:25"],
    ["deepseek CNY 12.50 · USD 4.20", "¥13/$4.2"],
    ["anthropic $12.50 left", "$13"],
    ["baseten no Model APIs usage", "$0"],
    ["fireworks no rated usage", "$0"],
    ["auth unavailable", "u?"],
    ["selection required", "u?"],
    ["usage err: timeout", "u?"],
    ["chatgpt usage: web only", "u?"],
    ["deepseek balance unavailable", "u?"],
  ];

  for (const [raw, expected] of vectors) {
    const res = classifyStatuses(new Map([["usage", raw]]));
    assert.equal(res.slots.get("usage")?.source, "adapted", raw);
    assert.equal(res.slots.get("usage")?.text, expected, raw);
    assert.deepEqual(res.unknown, [], raw);
  }

  const override = classifyStatuses(new Map([
    ["path-bar:usage", "5h:50%"],
    ["usage", "codex 89% ↻ 2h30m · 97% ↻ 5d17h"],
  ]));
  assert.equal(override.slots.get("usage")?.source, "segment");
  assert.equal(override.slots.get("usage")?.text, "5h:50%");
  assert.deepEqual(override.unknown, []);
});

test("built-in @hk_net/pi-usage-bars adapter compresses progress bars, risk colors, finance mode and Type 2 override", () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ["\x1b[2mClaude usage: loading…\x1b[39m", "\x1b[2mu…\x1b[0m"],
    ["\x1b[33mClaude usage unavailable (HTTP 429)\x1b[39m", "\x1b[33mu?\x1b[0m"],
    [
      "\x1b[2mClaude \x1b[39m\x1b[2mS \x1b[39m\x1b[32m████\x1b[39m\x1b[2m░░░░\x1b[39m \x1b[32m48%\x1b[39m\x1b[2m ⟳ 2h 15m\x1b[39m \x1b[2mW \x1b[39m\x1b[33m██████░░\x1b[39m \x1b[33m75%\x1b[39m\x1b[2m ⟳ 4d 3h\x1b[39m",
      "\x1b[32ms:48%\x1b[0m \x1b[33m7d:75%\x1b[0m",
    ],
    [
      "\x1b[2mZAI Coding Plan (Global) \x1b[39m\x1b[2m5h \x1b[39m\x1b[31m████████\x1b[39m \x1b[31m100%\x1b[39m\x1b[2m ⟳ 2h 15m\x1b[39m \x1b[2mW \x1b[39m\x1b[32m██░░░░░░\x1b[39m \x1b[32m25%\x1b[39m",
      "\x1b[31m5h:100%!↺2h\x1b[0m \x1b[32m7d:25%\x1b[0m",
    ],
    [
      "\x1b[2mClaude \x1b[39m\x1b[2mI \x1b[39m\x1b[32m░░░░░░░░\x1b[39m \x1b[32m<1%\x1b[39m \x1b[2mL \x1b[39m\x1b[31m████████\x1b[39m \x1b[31m100%\x1b[39m\x1b[2m ⟳ <1m\x1b[39m \x1b[2mW \x1b[39m\x1b[33m██████░░\x1b[39m \x1b[33m80%\x1b[39m\x1b[33m stale\x1b[39m",
      "\x1b[31mL:100%!↺1m\x1b[0m \x1b[33m7d:80%\x1b[0m\x1b[33m~\x1b[0m",
    ],
    [
      "\x1b[2mOpenRouter \x1b[39m\x1b[2mCredit balance · $45.00 · Month · $3.20\x1b[39m",
      "\x1b[2m$45/$3.2\x1b[0m",
    ],
    [
      "\x1b[2mDeepSeek \x1b[39m\x1b[2mBalance · $12.34\x1b[39m",
      "\x1b[2m$12\x1b[0m",
    ],
    [
      "\x1b[2mMoonshot/Kimi API (China) \x1b[39m\x1b[2mAvailable balance · CN¥18.50\x1b[39m",
      "\x1b[2m¥19\x1b[0m",
    ],
    [
      "\x1b[2mCustom Provider \x1b[39m\x1b[2mNo balance info\x1b[39m",
      "\x1b[2mu?\x1b[0m",
    ],
  ];

  for (const [raw, expected] of vectors) {
    const res = classifyStatuses(new Map([["@hk_net/pi-usage-bars", raw]]));
    assert.equal(res.slots.get("pi-usage-bars")?.source, "adapted", raw);
    assert.equal(res.slots.get("pi-usage-bars")?.text, expected, raw);
    assert.deepEqual(res.unknown, [], raw);
  }

  const override = classifyStatuses(new Map([
    ["path-bar:pi-usage-bars", "5h:10%"],
    ["@hk_net/pi-usage-bars", "\x1b[2mDeepSeek \x1b[39m\x1b[2mBalance · $12.34\x1b[39m"],
  ]));
  assert.equal(override.slots.get("pi-usage-bars")?.source, "segment");
  assert.equal(override.slots.get("pi-usage-bars")?.text, "5h:10%");
  assert.deepEqual(override.unknown, []);
});

test("built-in @sreetej510/pi-usage & @subaud-tools/pi-usage adapter (provider-usage) handles windows, budgets and Type 2 override", () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ["checking", "u…"],
    ["usage error", "u?"],
    ["usage unavailable", "u?"],
    ["usage rate-limited (5m)", "u!↺5m"],
    ["codex 42% 5h 18% 7d", "5h:42% 7d:18%"],
    ["codex spark 100% 5h 60% 7d (12m old)", "5h:100%! 7d:60%"],
    ["claude 35% 5h 12% 7d", "5h:35% 7d:12%"],
    ["claude 62% $62/$100", "$62/$100"],
    ["claude 100% $100/$100", "$100/$100!"],
    ["claude 62% $62/$100 20% $4/$20 extra", "bg:62% ex:20%"],
    ["claude 100% $100/$100 20% $4/$20 extra", "bg:100%! ex:20%"],
    ["Codex · 5h 100% ↻2h · 7d 18% ↻4d", "5h:100%!↺2h 7d:18%"],
    ["Claude · 5h 35% ↻1h · Sonnet 7d 12% ↻3d", "5h:35% 7s:12%"],
    ["OpenRouter · $12.34/$50", "$12/$50"],
    ["codex no credits", "cr:0!"],
    ["unlimited credits", "cr:∞"],
    ["credits available", "cr:ok"],
    ["25 credits", "cr:25"],
  ];

  for (const [raw, expected] of vectors) {
    const res = classifyStatuses(new Map([["provider-usage", raw]]));
    assert.equal(res.slots.get("provider-usage")?.source, "adapted", raw);
    assert.equal(res.slots.get("provider-usage")?.text, expected, raw);
    assert.deepEqual(res.unknown, [], raw);
  }

  const override = classifyStatuses(new Map([
    ["path-bar:provider-usage", "5h:12%"],
    ["provider-usage", "codex 42% 5h 18% 7d"],
  ]));
  assert.equal(override.slots.get("provider-usage")?.source, "segment");
  assert.equal(override.slots.get("provider-usage")?.text, "5h:12%");
  assert.deepEqual(override.unknown, []);
});

test("built-in @cad0p/pi-usage adapter (00-quota -> quota) keeps 24-bit risk colors, Strategy A and Type 2 override", () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ["\x1b[2mquota …\x1b[39m", "\x1b[2mu…\x1b[0m"],
    ["\x1b[2mquota: no providers configured in Pi\x1b[39m", "\x1b[2mu?\x1b[0m"],
    [
      "\x1b[38;2;217;119;87mClaude:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m12%\x1b[0m  \x1b[38;2;16;163;127mCodex:\x1b[0m\x1b[38;2;210;153;34m◕\x1b[0m \x1b[38;2;210;153;34m78%\x1b[0m  \x1b[38;2;66;133;244mAgy:\x1b[0m\x1b[38;2;248;81;73m●\x1b[0m \x1b[38;2;248;81;73m95%\x1b[0m  \x1b[38;2;122;162;247mAgy C/G:\x1b[0m\x1b[38;2;63;185;80m◔\x1b[0m \x1b[38;2;63;185;80m30%\x1b[0m",
      "\x1b[38;2;210;153;34mCx:78%\x1b[0m \x1b[38;2;248;81;73mAg:95%\x1b[0m",
    ],
    [
      "\x1b[38;2;217;119;87mClaude:\x1b[0m\x1b[38;2;248;81;73m●\x1b[0m \x1b[38;2;248;81;73m100%\x1b[0m  \x1b[38;2;16;163;127mCodex:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m8%\x1b[0m",
      "\x1b[38;2;248;81;73mCl:100%!\x1b[0m \x1b[38;2;63;185;80mCx:8%\x1b[0m",
    ],
    [
      "\x1b[38;2;217;119;87mClaude:\x1b[0m\x1b[31m!\x1b[39m  \x1b[38;2;16;163;127mCodex:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m8%\x1b[0m  \x1b[38;2;0;122;255mOP-Go:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m3%\x1b[0m",
      "\x1b[31mCl:!\x1b[0m \x1b[38;2;63;185;80mCx:8%\x1b[0m",
    ],
    [
      "\x1b[38;2;122;162;247mAgy C/G:\x1b[0m\x1b[38;2;248;81;73m●\x1b[0m \x1b[38;2;248;81;73m85%\x1b[0m  \x1b[38;2;0;122;255mOP-Go:\x1b[0m\x1b[33m~\x1b[39m  \x1b[38;2;255;255;255mGH:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m10%\x1b[0m",
      "\x1b[38;2;248;81;73mAgC:85%\x1b[0m \x1b[33mOG:~\x1b[0m",
    ],
  ];

  for (const [raw, expected] of vectors) {
    const res = classifyStatuses(new Map([["00-quota", raw]]));
    assert.equal(res.slots.get("quota")?.source, "adapted", raw);
    assert.equal(res.slots.get("quota")?.text, expected, raw);
    assert.deepEqual(res.unknown, [], raw);
  }

  const override = classifyStatuses(new Map([
    ["path-bar:quota", "Cl:5%"],
    ["00-quota", "\x1b[38;2;217;119;87mClaude:\x1b[0m\x1b[38;2;63;185;80m○\x1b[0m \x1b[38;2;63;185;80m12%\x1b[0m"],
  ]));
  assert.equal(override.slots.get("quota")?.source, "segment");
  assert.equal(override.slots.get("quota")?.text, "Cl:5%");
  assert.deepEqual(override.unknown, []);

  // Every built-in adapter must expose a unique status key and a valid SEGMENT_ID.
  const keys = new Set<string>();
  for (const adapter of ADAPTED_EXTENSIONS) {
    assert.ok(!keys.has(adapter.key), `duplicate adapter key: ${adapter.key}`);
    keys.add(adapter.key);
    assert.match(adapter.id, SEGMENT_ID, `invalid adapter id: ${adapter.id}`);
  }
});

test("packRightSlots folds overflow slots into +N badge", () => {
  const items = [
    { id: "a", text: "ssh:prod" },
    { id: "b", text: "P:fast" },
    { id: "c", text: "⌁" },
    { id: "clock", text: "14:50" },
  ];
  const dim = (s: string) => s;
  assert.equal(packRightSlots(items, 40, dim), "ssh:prod P:fast ⌁ 14:50");
  assert.equal(packRightSlots(items, 18, dim), "ssh:prod P:fast +2");
  assert.equal(packRightSlots(items, 12, dim), "ssh:prod +3");
  assert.equal(packRightSlots(items, 5, dim), "+4");
  assert.equal(packRightSlots(items, 1, dim), "");
});

test("top border uses Scheme B 5-col zero-jitter W slot, L-zone takeover, hidden clock/slots and S overlay", () => {
  const base: MinimalTopInput = {
    totals: { input: 12_300, output: 4_100, cacheRead: 85_000, cacheWrite: 15_000, cost: 0.123 },
    hitRate: 85.2,
    subscription: false,
    sessionName: "refactor",
    showSession: true,
    timeFormat: "24h",
    now: new Date(2026, 0, 1, 14, 50),
    slots: new Map([
      ["net", { id: "net", text: "⌁", source: "segment" }],
      ["ssh", { id: "ssh", text: "ssh:prod", source: "adapted" }],
    ]),
    order: [],
    hidden: new Set(),
    theme: plainTheme,
    borderColor: (s) => s,
  };

  const idle = renderMinimalTopBorder(base, 80, 0);
  const working = renderMinimalTopBorder({
    ...base,
    indicator: { kind: "working", renderInBorder: () => "⠋ Working", renderSpinnerInBorder: () => "⠋" },
  }, 80, 0);

  assert.equal(visibleWidth(idle), 80);
  assert.equal(visibleWidth(working), 80);
  // Zero-jitter check: telemetry begins at exact column 5 in both idle and working states.
  assert.equal(idle.indexOf("↑12k"), 5);
  assert.equal(working.indexOf("↑12k"), 5);
  assert.ok(idle.startsWith("──── ↑12k"));
  assert.ok(working.startsWith("── ⠋ ↑12k"));
  assert.ok(!working.includes("Working"));
  assert.ok(working.endsWith(" net ssh:prod 14:50 ──") || working.endsWith(" ⌁ ssh:prod 14:50 ──"));

  // Idle with empty telemetry leaves a continuous border without dangling spaces.
  const quiet = renderMinimalTopBorder({
    ...base,
    totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    hitRate: undefined,
    sessionName: undefined,
  }, 80, 0);
  assert.ok(quiet.startsWith("────────"));
  assert.equal(visibleWidth(quiet), 80);

  // Rare non-working indicator (retry) takes over the L zone temporarily.
  const retrying = renderMinimalTopBorder({
    ...base,
    indicator: {
      kind: "retry",
      renderInBorder: () => "⠋ Retrying (3/5) in 30s... (escape to cancel)",
      renderSpinnerInBorder: () => "⠋",
    },
  }, 80, 0);
  assert.equal(visibleWidth(retrying), 80);
  assert.ok(retrying.startsWith("── ⠋ Retrying (3/5) in 30s... (escape to cancel) "));
  assert.ok(!retrying.includes("↑12k"));

  // Hiding clock and ssh removes them from the top-right slot.
  const withHidden = renderMinimalTopBorder({ ...base, hidden: new Set(["clock", "ssh"]) }, 80, 0);
  assert.ok(!withHidden.includes("14:50"));
  assert.ok(!withHidden.includes("ssh:prod"));
  assert.ok(withHidden.endsWith(" ⌁ ──"));

  // Scroll overlay centers cleanly on top border.
  const scrolled = renderMinimalTopBorder(base, 80, 12);
  assert.equal(visibleWidth(scrolled), 80);
  assert.ok(scrolled.includes(" ↑ 12 more "));

  // Width invariant across 0..120 columns (including ANSI colors and scroll overlay).
  for (let width = 0; width <= 120; width++) {
    for (const hiddenLines of [0, 12]) {
      const line = renderMinimalTopBorder({ ...base, theme: colorTheme, borderColor: borderAnsi }, width, hiddenLines);
      assert.equal(visibleWidth(line), width, `top border width=${width} hidden=${hiddenLines}`);
    }
  }
});

test("bottom border shows context window by default, degrades gracefully on narrow widths, and handles CJK S overlay", () => {
  const base: MinimalBottomInput = {
    displayPath: "项目/pi-path-bar",
    aliasName: "项目",
    pathMode: "short",
    showIcon: true,
    showBranch: true,
    gitState: {
      kind: "ready", head: "feat/minimal", detached: false, oid: "1234567",
      behind: 0, ahead: 0, stash: 0, conflicted: 0, staged: 1, dirty: 2, untracked: 0,
    },
    modelId: "claude-sonnet-4-5-20250929",
    reasoning: true,
    thinkingLevel: "high",
    contextPercent: 42.3,
    contextWindow: 200_000,
    theme: plainTheme,
    borderColor: (s) => s,
  };

  const wide = renderMinimalBottomBorder(base, 80, 0);
  assert.equal(visibleWidth(wide), 80);
  assert.ok(wide.includes(" 项目/pi-path-bar feat/minimal +1!2"));
  assert.ok(wide.endsWith(" sonnet-4.5·H ◐42%/200k ──"));

  // Narrow split drops context window and shortens model/git cleanly.
  const narrow = renderMinimalBottomBorder(base, 52, 0);
  assert.equal(visibleWidth(narrow), 52);
  assert.ok(narrow.includes("◐42%"));
  assert.ok(!narrow.includes("/200k"));

  // Scroll overlay across CJK characters preserves exact column width.
  const cjkLine = renderMinimalBottomBorder({ ...base, displayPath: "中文超长别名目录/子目录名称测试项目" }, 46, 8);
  assert.equal(visibleWidth(cjkLine), 46);
  assert.ok(cjkLine.includes(" ↓ 8 more "));

  // Direct overlay test when wide CJK char straddles cut boundary.
  const raw = "─".repeat(12) + "中文中文中文中文中文" + "─".repeat(12);
  const overlaid = overlayScrollLabel(raw, visibleWidth(raw), "↓", 5, borderAnsi);
  assert.equal(visibleWidth(overlaid), visibleWidth(raw));
  assert.ok(stripTerminalSequences(overlaid).includes(" ↓ 5 more "));

  // Width invariant across 0..120 columns (including ANSI colors and scroll overlay).
  for (let width = 0; width <= 120; width++) {
    for (const hiddenLines of [0, 12]) {
      const line = renderMinimalBottomBorder({ ...base, theme: colorTheme, borderColor: borderAnsi }, width, hiddenLines);
      assert.equal(visibleWidth(line), width, `bottom border width=${width} hidden=${hiddenLines}`);
    }
  }
});

test("Minimal mode is enabled by default, hides footer unless Type 3 statuses exist, and restores cleanly on Off", async (t) => {
  const dir = tempDir(t);
  const store = new ConfigStore(join(dir, "config.json"));
  assert.equal(store.load().minimal, true);
  store.update((cfg) => { cfg.branch = false; cfg.hiddenSegments = ["ssh"]; });

  const handlers: Record<string, any> = {};
  let command: any;
  let footerComponent: any;
  let editorFactory: any;
  let statuses = new Map<string, string>([
    ["path-bar:net", "⌁"],
    ["ssh", "SSH: prod:/app"], // Type 1 adapted AND hidden -> must NOT leak to Type 3 footer!
  ]);

  const pi: any = {
    on: (name: string, handler: any) => { handlers[name] = handler; },
    registerCommand: (_name: string, value: any) => { command = value; },
    getThinkingLevel: () => "high",
  };

  const ctx: any = {
    mode: "tui",
    model: { id: "claude-sonnet-4-5-20250929", provider: "anthropic", contextWindow: 200_000, reasoning: true },
    modelRegistry: { isUsingOAuth: () => false },
    getContextUsage: () => ({ percent: 42, contextWindow: 200_000 }),
    sessionManager: {
      getCwd: () => "/tmp/project",
      getSessionName: () => "min-test",
      getEntries: () => [{
        type: "message",
        message: { role: "assistant", usage: { input: 5000, output: 1000, cacheRead: 0, cacheWrite: 0, cost: { total: 0.05 } } },
      }],
    },
    ui: {
      theme: plainTheme,
      setFooter(factory: any) {
        footerComponent?.dispose?.();
        footerComponent = factory?.({ requestRender() {} }, plainTheme, {
          onBranchChange: () => () => {},
          getGitBranch: () => null,
          getAvailableProviderCount: () => 1,
          getExtensionStatuses: () => statuses,
        });
      },
      setEditorComponent(factory: any) { editorFactory = factory; },
      getEditorComponent() { return editorFactory; },
      notify(message: string) { assert.fail(message); },
      custom: (build: any) => new Promise((done) => {
        const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
        // Move to Minimal mode (index 1), toggle Off, then Esc.
        component.handleInput("\x1b[B");
        component.handleInput("\r");
        component.handleInput("\x1b");
      }),
    },
  };

  extension(pi, store.file);
  t.after(() => handlers.session_shutdown());
  await handlers.session_start({}, ctx);

  assert.equal(typeof editorFactory, "function");
  // No Type 3 unknown statuses -> footer returns 0 lines (hidden).
  assert.deepEqual(footerComponent.render(80), []);

  // Instantiate MinimalEditor and verify rendered top/bottom borders.
  const tui: any = { terminal: { rows: 24 }, requestRender() {} };
  const editorTheme: any = { borderColor: (s: string) => s, selectList: {} };
  const editor = editorFactory(tui, editorTheme, { matches: () => false } as any);
  assert.ok(editor instanceof MinimalEditor);

  const lines = editor.render(80);
  assert.equal(visibleWidth(lines[0]), 80);
  assert.equal(visibleWidth(lines[lines.length - 1]), 80);
  assert.ok(lines[0].startsWith("──── ↑5k ↓1k $0.05 ·min-test "));
  assert.ok(!lines[0].includes("ssh:"));
  assert.ok(lines[0].includes("⌁"));
  assert.ok(lines[lines.length - 1].includes("sonnet-4.5·H ◐42%/200k"));

  // Working indicator degrades to 5-col spinner.
  editor.setWorkingStatusIndicator({ kind: "working", renderInBorder: () => "⠋ Working", renderSpinnerInBorder: () => "⠋" } as any);
  const workingLines = editor.render(80);
  assert.ok(workingLines[0].startsWith("── ⠋ ↑5k ↓1k $0.05 ·min-test "));
  assert.equal(workingLines[0].indexOf("↑5k"), lines[0].indexOf("↑5k"));

  // Adding a Type 3 unknown extension status shows exactly 1 line below the bottom border.
  statuses = new Map([...statuses, ["mystery-plugin", "Syncing 2/5"]]);
  assert.deepEqual(footerComponent.render(80), ["Syncing 2/5"]);

  // Removing it hides the footer line again automatically.
  statuses = new Map([["path-bar:net", "⌁"], ["ssh", "SSH: prod:/app"]]);
  assert.deepEqual(footerComponent.render(80), []);

  // Toggling Minimal mode Off via /path-bar restores default editor and standard footer.
  await command.handler("", ctx);
  assert.equal(store.load().minimal, false);
  assert.equal(editorFactory, undefined);
  assert.equal(footerComponent.render(80).length, 3); // standard 2 lines + status line ("SSH: prod:/app")
});

test("Minimal mode overrides native mode while enabled and restores native mode when turned off", async (t) => {
  const dir = tempDir(t);
  const store = new ConfigStore(join(dir, "config.json"));
  store.update((cfg) => { cfg.mode = "native"; cfg.minimal = true; cfg.branch = false; });

  const handlers: Record<string, any> = {};
  let command: any;
  let footerFactory: any = "unset";
  let editorFactory: any;
  const ctx: any = {
    mode: "tui",
    getContextUsage: () => undefined,
    sessionManager: { getCwd: () => "/tmp/project", getSessionName: () => undefined, getEntries: () => [] },
    ui: {
      theme: plainTheme,
      setFooter(factory: any) { footerFactory = factory; },
      setEditorComponent(factory: any) { editorFactory = factory; },
      getEditorComponent() { return editorFactory; },
      notify(message: string) { assert.fail(message); },
      custom: (build: any) => new Promise((done) => {
        const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
        component.handleInput("\x1b[B"); // Minimal mode
        component.handleInput("\r"); // Off
        component.handleInput("\x1b");
      }),
    },
  };

  extension({
    on: (name: string, handler: any) => { handlers[name] = handler; },
    registerCommand: (_name: string, value: any) => { command = value; },
    getThinkingLevel: () => "off",
  } as any, store.file);
  t.after(() => handlers.session_shutdown());
  await handlers.session_start({}, ctx);

  assert.equal(typeof footerFactory, "function");
  assert.equal(typeof editorFactory, "function");

  await command.handler("", ctx);
  assert.equal(store.load().minimal, false);
  assert.equal(store.load().mode, "native");
  assert.equal(footerFactory, undefined);
  assert.equal(editorFactory, undefined);
});

test("disabling Minimal mode does not clobber a third-party custom editor", async (t) => {
  const dir = tempDir(t);
  const store = new ConfigStore(join(dir, "config.json"));
  store.update((cfg) => { cfg.minimal = true; cfg.branch = false; });

  const handlers: Record<string, any> = {};
  let currentEditor: any;
  const thirdPartyEditor = () => ({});

  const ctx: any = {
    mode: "tui",
    getContextUsage: () => undefined,
    sessionManager: { getCwd: () => "/tmp/project", getSessionName: () => undefined, getEntries: () => [] },
    ui: {
      theme: plainTheme,
      setFooter() {},
      setEditorComponent(factory: any) { currentEditor = factory; },
      getEditorComponent() { return currentEditor; },
      notify(message: string) { assert.fail(message); },
    },
  };

  extension({ on: (name: string, handler: any) => { handlers[name] = handler; }, registerCommand() {}, getThinkingLevel: () => "off" } as any, store.file);
  await handlers.session_start({}, ctx);
  assert.equal(typeof currentEditor, "function");

  // Another extension replaces the editor after us.
  currentEditor = thirdPartyEditor;
  handlers.session_shutdown();
  assert.equal(currentEditor, thirdPartyEditor);
});

test("Footer order screen toggles visibility for clock, Type 1 adapted, and Type 2 segments via space", async (t) => {
  const dir = tempDir(t);
  const store = new ConfigStore(join(dir, "config.json"));
  let config = store.load();
  const statuses = new Map([
    ["path-bar:net", "⌁"],
    ["ssh", "SSH: prod:/app"],
    ["unknown-ext", "Do not list"],
  ]);

  // Order starts as: ["net", "ssh", "clock"], cursor starts on "clock" (index 2).
  // Press space (hide clock), up (ssh), space (hide ssh), up (net), space (hide net), space (show net), Esc, Esc.
  const sequence = [
    ["\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\r"], // open Footer order
    [" ", "\x1b[A", " ", "\x1b[A", " ", " ", "\x1b"],
    ["\x1b"],
  ];
  const screens: string[] = [];
  const ctx: any = {
    ui: {
      custom: (build: any) => new Promise((done) => {
        const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
        const screen = component.render(80).join("\n");
        if (screen.includes("space  show/hide")) screens.push(screen);
        for (const key of sequence.shift()!) component.handleInput(key);
      }),
      notify(message: string, kind: string) { assert.notEqual(kind, "error", message); },
    },
  };

  await openSettings(ctx, () => config, (change, reinstall) => {
    assert.equal(reinstall, false);
    config = store.update(change);
    return true;
  }, () => statuses);

  assert.equal(sequence.length, 0);
  assert.ok(screens.length > 0);
  assert.ok(screens[0].includes("ssh"));
  assert.ok(screens[0].includes("(adapted)"));
  assert.ok(!screens[0].includes("unknown-ext"));
  assert.deepEqual(store.load().hiddenSegments.sort(), ["clock", "ssh"]);
});

test("Footer order allows moving clock anywhere across Type 1 and Type 2 slots without losing offline order", async (t) => {
  const dir = tempDir(t);
  const store = new ConfigStore(join(dir, "config.json"));
  // Seed an offline configured segment ("offline") to ensure reordering active items + clock preserves it.
  store.update((cfg) => { cfg.segments = ["offline", "pi-usage", "ponytail", "clock"]; });
  let config = store.load();
  const statuses = new Map([
    ["pi-usage", "5h:82% left (↺in 2h 15m)"],
    ["ponytail", "○ 🐴 ponytail: ⚡ FULL"],
  ]);

  // Visible rows start as: ["pi-usage", "ponytail", "clock"], cursor starts on "clock" (index 2).
  // Move clock left twice (`<`, `<`) so clock becomes first before pi-usage and ponytail.
  const sequence = [
    ["\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\x1b[B", "\r"], // open Footer order
    ["<", "<", "\x1b"],
    ["\x1b"],
  ];
  const ctx: any = {
    ui: {
      custom: (build: any) => new Promise((done) => {
        const component = build({ requestRender() {} }, { fg: (_: string, text: string) => text, bold: (text: string) => text }, {}, done);
        for (const key of sequence.shift()!) component.handleInput(key);
      }),
      notify(message: string, kind: string) { assert.notEqual(kind, "error", message); },
    },
  };

  await openSettings(ctx, () => config, (change, reinstall) => {
    assert.equal(reinstall, false);
    config = store.update(change);
    return true;
  }, () => statuses);

  assert.equal(sequence.length, 0);
  const savedOrder = store.load().segments;
  assert.ok(savedOrder.includes("offline"));
  assert.ok(savedOrder.indexOf("clock") < savedOrder.indexOf("pi-usage"));
  assert.ok(savedOrder.indexOf("pi-usage") < savedOrder.indexOf("ponytail"));

  // Verify Minimal top border renders clock first according to saved order.
  const { slots } = classifyStatuses(statuses);
  const line = renderMinimalTopBorder({
    totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    subscription: false,
    showSession: false,
    timeFormat: "24h",
    now: new Date(2026, 0, 1, 20, 30),
    slots,
    order: savedOrder,
    hidden: new Set(),
    theme: plainTheme,
    borderColor: (s) => s,
  }, 80, 0);
  assert.ok(line.endsWith(" 20:30 5h:82% ♘F ──"), `unexpected line: ${line}`);
});
