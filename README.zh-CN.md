# pi-path-bar

[English](README.md) | 简体中文

Pi 底栏扩展。支持简短路径、目录别名和随主题调整的 Git 状态颜色。

```text
 ~/C/P/demo-app ( main)
 Projects/demo-app ( main +2 !1 ?3)
 demo ( main ⇡1)
```

## 功能

- 简短、自动和完整路径显示模式。
- 为任意文件夹设置显示别名，不改变实际路径或环境变量。
- 随主题调整的别名颜色，以及 Tide 风格的 Git 状态标记。
- 路径行右侧显示本机时间，支持 12 小时制和 24 小时制。
- 交互式设置菜单，自动保存配置。
- 保留用量统计、模型信息和其他扩展的状态行。
- 支持中文等 Unicode 目录名和别名。

## 安装

从 npm 安装：

```sh
pi install npm:pi-path-bar
# 或仅在本次启动中使用：
pi -e npm:pi-path-bar
```

也可以从 GitHub 安装 Git 来源：

```sh
pi install git:github.com/johnbitcn/pi-path-bar
```

在已运行的 Pi 中执行 `/reload`，再输入 `/path-bar`。

仅在本次启动中使用：

```sh
pi -e git:github.com/johnbitcn/pi-path-bar
```

本地开发时，在项目目录执行：

```sh
pi install "$PWD"
# 或仅在本次启动中加载扩展：
pi -e ./src/index.ts
```

只加载一份扩展。切换安装来源前，先移除已有的本地或 Git 安装。目录图标需要 Nerd Font；也可在设置中关闭图标。

## 实验性阅读模式

此原型独立加载，不会随底栏扩展自动启用。在本地仓库目录启动：

```sh
pi -e ./src/reading-mode.ts
```

- 在 fullscreen 模式下按 `Alt+Esc`（Mac 上为 Option+Esc），隐藏输入框和底栏，并将空间交给正文。
- 对话、工具输出、扩展组件、状态和待发送消息保留。仍可滚动正文。
- 再按 `Alt+Esc` 或按单次 `Esc` 恢复。输入草稿保留。
- 阅读时不接收编辑和发送输入。`Ctrl+c` 先恢复界面，再交给原输入框处理。
- 如果 `Alt+Esc` 没有反应，执行 `/reading-mode` 可绕过快捷键进入，再按 `Esc` 退出。
- 终端需要发送可区分 Alt 修饰的 Esc 序列（Kitty CSI-u 或 xterm modifyOtherKeys）。不拦截有歧义的传统双 Esc 序列，保留 Pi 的双 Esc 行为。`Ctrl+G` 恢复用于 Pi 的外部编辑器。

原型依赖 Pi 1.5.x 的内部布局结构，不属于稳定的布局 API。结构不匹配时会拒绝启用。切换 TUI 模式后，请执行 `/reload` 再使用。暂不修改 Pi 安装文件，也不自动安装此原型。

## 设置

执行 `/path-bar`。上下键选择，Enter 或空格切换设置或打开操作，Esc 退出。修改立即生效，并自动保存。扩展界面使用英文。

| 设置项 | 默认值 | 可选值 |
| --- | --- | --- |
| Path display（路径显示） | Short | Short、Auto、Full、Native footer |
| Folder icon（目录图标） | On | On、Off |
| Git status（Git 状态） | On | On、Off |
| Session name（会话名称） | On | On、Off |
| Time format（时间格式） | 24h | 24h、12h（带 AM/PM） |
| Add folder alias（添加目录别名） | — | 输入文件夹路径和名称 |
| Manage folder aliases（管理目录别名） | — | 修改或删除别名 |

**Native footer** 恢复 Pi 原生底栏。其他显示设置会保留，但在该模式下不生效。

时间显示在路径行最右侧，使用本机时区。24h 模式显示 `09:05`，12h 模式显示 `09:05 AM`。分钟变化后 1 秒内自动刷新，空闲时也会更新。先为时间预留宽度，再压缩路径。宽度不足以容纳时间和一个路径字符时，隐藏时间。Native footer 模式会停止时间定时器。

### 路径显示模式

- **Short：**始终将中间目录缩写为首个字素，支持中文等 Unicode 名称。
- **Auto：**宽度足够时显示完整路径，否则缩写。
- **Full：**不缩写，超出宽度时截断。

Short 和 Auto 在宽度不足时将中间目录折叠为 `…`。极窄时，先省略起点与图标，再截断最后一级目录名。

主目录显示为 `~`。`~` 和目录别名等命名起点前显示目录图标。以 `/` 开头的绝对路径不显示图标。

## 目录别名

选择 **Add folder alias**，可以给任意文件夹命名。输入绝对路径或 `~/` 开头的路径。路径留空直接按 Enter，则使用当前目录。目标必须存在且为文件夹。

例如，将 `~/CloudDrive` 命名为 **Cloud**：

```text
 Cloud
 Cloud/P/demo-app
```

也可以将 `~/CloudDrive/Projects/demo-app` 命名为 **demo**。该目录显示为 ` demo`，其子目录显示为 ` demo/src`。

### 匹配和编辑规则

- 别名匹配该目录及其子目录，按目录边界匹配。
- 多个别名同时匹配时，使用最长路径。父级和子级别名不会叠加。
- 宽度允许时保留完整别名。其后的目录按所选模式处理。
- 没有匹配时，使用 `~` 或绝对路径。
- 保存时规范化路径并展开 `~`，但不解析符号链接。
- 路径和名称不能重复。名称不能为空、`~`、`.` 或 `..`，不能包含斜杠、反斜杠、换行或控制字符。
- 修改时，字段留空表示保留原值。Esc 取消。
- 删除别名不会删除实际文件夹。磁盘暂时离线时，已有别名仍会保留。

仅命中的别名名称使用 Pi 主题的 `mdLink` 色。内置暗色主题使用较亮的蓝色，亮色主题使用较深的蓝色。自定义主题以其链接色为准。图标、子目录和会话名使用灰色；Git 信息使用状态色。切换主题后颜色同步更新。

别名只影响底栏，不改变工作目录、工具访问路径或环境变量。

## Git 状态

借用 Tide 的标记形式，但使用 Pi 主题文字色，不使用背景色。扩展不会修改 fish 或 Tide。

| 状态 | 主题色 | 内置主题效果 |
| --- | --- | --- |
| 初次读取或查询失败 | `text` | 默认文字色，显示 `?` |
| 工作区干净 | `mdLink` | 蓝色 |
| 有已暂存、未暂存或未跟踪变更 | `warning` | 黄色 |
| 有冲突或正在进行 Git 操作 | `error` | 红色 |

优先级：红色 > 黄色 > 蓝色。不在 Git 仓库时隐藏 Git 信息。目录别名颜色不受 Git 状态影响。

```text
 demo ( main ⇣2 ⇡1 *1 ~2 +3 !4 ?5)
```

| 标记 | 含义 |
| --- | --- |
| `⇣N` | 落后上游 N 个提交 |
| `⇡N` | 领先上游 N 个提交 |
| `*N` | N 条 stash |
| `~N` | N 个冲突文件，覆盖 `DD AU UD UA DU AA UU` |
| `+N` | N 个已暂存条目 |
| `!N` | N 个未暂存条目 |
| `?N` | N 个未跟踪条目 |

数量为零时不显示。未跟踪目录按 Git 默认行为合并为一个条目。冲突文件不重复计入已暂存或未暂存数量。领先、落后和 stash 本身不改变颜色。没有上游时，不显示领先和落后。

显示 merge、rebase、cherry-pick、revert、bisect 等操作。可用时显示 rebase 进度。分离 HEAD 时显示 `#标签` 或 `@提交短哈希`。支持 linked worktree。

查询异步执行，并设有超时。每 5 秒刷新一次，也在工具执行完成、agent 回复完成或分支变化时刷新。关闭 Git 状态或选择 Native footer 后，停止扩展查询。

## 配置

配置在各项目间共用，保存到：

```text
~/.pi/agent/pi-path-bar.json
```

若设置了 `PI_CODING_AGENT_DIR`，则使用该目录。扩展不会设置或修改此变量。

```json
{
  "mode": "short",
  "icon": true,
  "branch": true,
  "session": true,
  "timeFormat": "24h",
  "aliases": [
    { "path": "/home/example/Projects", "name": "Projects" }
  ]
}
```

`branch` 字段控制 Git 状态显示。配置在重启或 `/reload` 后保留。打开菜单时重新读取文件。保存使用临时文件和原子替换。其他已运行的 Pi 实例需要重新打开菜单或重新加载，才能同步修改。

新文件不存在时，会读取旧的 `pi-show-dir.json`。下次保存时写入新文件，并保留旧文件。配置损坏时会提示错误，不会覆盖原文件。

## 限制

- Pi 的公开 API 会替换整个底栏。其他扩展也调用 `setFooter()` 时，最后设置的底栏生效。
- 公开 API 不提供自动压缩开关，因此自定义底栏不显示原生 `(auto)` 标记。
- 这是非官方 Pi 扩展，与 Pi 或 Tide 项目无隶属或背书关系。

## 开发

需要 Node.js 22.19 或更新版本。Git 状态和集成测试需要 Git。

```sh
npm install --ignore-scripts
npm test
npm run check
```

## 许可证与致谢

本项目采用 [MIT 许可证](LICENSE)。Pi 和 Tide 的版权及许可文本见[第三方声明](THIRD_PARTY_NOTICES.md)。发布包不包含宿主依赖或字体文件。

维护者可参阅 [npm 发布指南](https://github.com/johnbitcn/pi-path-bar/blob/main/RELEASING.md)，了解登录、打包检查、发布和验证流程。
