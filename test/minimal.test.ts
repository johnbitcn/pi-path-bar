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
import { classifyStatuses } from "../src/segments.ts";
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

  // Explicit Type 2 registration overrides Type 1 adapter with the same id.
  const override = classifyStatuses(new Map([
    ["path-bar:ssh", "SSH!"],
    ["ssh", "SSH: prod:/app"],
  ]));
  assert.equal(override.slots.get("ssh")?.source, "segment");
  assert.equal(override.slots.get("ssh")?.text, "SSH!");
  assert.deepEqual(override.unknown, [["ssh", "SSH: prod:/app"]]);
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
