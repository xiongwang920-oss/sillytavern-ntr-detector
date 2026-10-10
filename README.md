# Theseus Artifact · 忒修斯神器

A third-party front-end extension for **SillyTavern 1.12+** that both prevents and detects NTR (netorare) content: it silently injects a built-in "pure love" rule into every generation, and detects NTR content in character cards, world info, and chat using your own OpenAI-compatible API. All UI text is in Chinese.

一个适用于 **SillyTavern 1.12+** 的第三方前端扩展，既能**防止**也能**检测** NTR 内容：每次生成时静默注入内置的「纯爱规则」，并使用你自配的 OpenAI 兼容接口检测角色卡、世界书与聊天中的 NTR 内容。全部界面文案为中文。

> The extension folder is named `忒修斯神器`; because GitHub rejects non-ASCII repository names, the repository itself is named `theseus-artifact`.

---

## English

### Features

- Built-in "pure love" rule (prevention): a hidden rule text is injected into every generation through SillyTavern's extension-prompt API, both after the story string (`IN_PROMPT`) and in-chat at depth 0. It is not shown in the UI and has no toggle. Nothing is written to your character cards or world info; disabling the extension or reloading the page removes it.
- Per-field character card scan; per-entry world info scan; optional chat scan and realtime detection.
- The current character card is detected automatically when it is opened or switched (on by default, can be disabled), so no manual scan is needed.
- The panel can stay in the extensions settings page or be popped out into a floating window; a round floating-ball button minimizes it, and the ball can be dragged too. Hold the window's title bar to drag it anywhere — the position is remembered across reloads and the range is clamped to the viewport, so the window cannot be lost off-screen.
- Gold-on-dark theme with motion: animated progress stripes, floating launcher with a pulsing halo, staggered result cards, pulsing highlights on hits, and hover sheen on buttons. The launcher and panel header use a hand-drawn SVG emblem of Theseus driving a sword through the Minotaur's head. All animation is disabled automatically for users who prefer reduced motion.
- Greeting rewrite: the "开场白改写" card lists every greeting of the current character card (`first_mes` and all `alternate_greetings`) so you can open the editor without scanning first and without a NTR hit; greeting rows in the scan results also carry the "改写 / 抹除开场白" button unconditionally. Inside the editor you can rewrite with your model, strip the quoted evidence locally (only for scanned hits), review the result, and save it back to the character card. Card edits only affect new chats; use "同步到当前聊天" to also write the new greeting into the first message of the current chat. The editor keeps a running log showing which URL each request went to and what the server answered, which makes a failed rewrite easy to diagnose.
- Editor layout: the text area fills all remaining height automatically, so there is nothing to drag and the first line can no longer be pushed out of view. The title bar can be held to drag the dialog (desktop), double-click it to reset the position. On phones the dialog fills the screen, buttons wrap, and the text area gets the maximum available height.
- Text is split into chunks by paragraph, pre-filtered locally by keywords, then sent to your model for strict JSON output. The pre-filter can be disabled.
- Configurable concurrency, timeout, retries, and cancellation. The scan aborts automatically after 3 consecutive failures and keeps already-completed results.
- The SHA-256 cache key includes text, model, endpoint, prompt, and related parameters; cached under `extension_settings['ntr-detector'].cache`.
- Realtime detection listens to `MESSAGE_RECEIVED` and only inserts a warning bar into the message DOM; the original message is never modified.
- Read-only by default: detection only reads character card, world info, and chat data. World info is read via SillyTavern's read-only `/api/worldinfo/get` endpoint, and the "locate" button only manipulates the editor UI. The only write path is the greeting dialog, which calls `/api/characters/edit-attribute` only after you click "保存到角色卡" (save to character card).

### Installation

1. Copy the whole `忒修斯神器` folder into `SillyTavern/public/scripts/extensions/third-party/`, so that the path `SillyTavern/public/scripts/extensions/third-party/忒修斯神器/manifest.json` exists.
2. Restart SillyTavern or refresh the browser, then enable "忒修斯神器" in the extensions panel.

When installed as a Git repository (via SillyTavern's URL install), the extension updates automatically, because `manifest.json` sets `"auto_update": true`. This requires the machine running SillyTavern to be able to reach GitHub. URL install target: `https://github.com/xiongwang920-oss/theseus-artifact`

### Configuration

Fill in the API Base URL, API Key, and model name, then click "测试连接" (Test connection). The API Base URL is the root address of an OpenAI-compatible endpoint, defaulting to `https://api.openai.com/v1`; the extension sends non-streaming requests to its `/chat/completions`. When accessing a custom endpoint directly from the browser, the server must allow the SillyTavern page's origin via CORS.

### Security & privacy

The API Key is stored in SillyTavern's `extension_settings['ntr-detector']` and may be synced to its local server along with SillyTavern settings. The extension only places the key in the `Authorization` header when requesting the configured API address. Reports do not include the key.

### License

[MIT](LICENSE)

---

## 中文

### 功能

- 内置「纯爱规则」（防止）：通过酒馆的扩展提示词接口，把隐藏的规则文本注入每次生成，同时插入故事字符串之后（`IN_PROMPT`）与聊天内 depth 0 两处。规则不在界面展示，也没有开关；不会写入角色卡或世界书，关闭插件或刷新页面即失效。
- 角色卡逐字段扫描；世界书逐条目扫描；聊天扫描与实时检测可选。
- 打开或切换角色卡时自动检测该角色卡（默认开启，可关闭），无需手动点击扫描。
- 面板可停留在扩展设置页，也可弹出为浮窗；点「最小化为悬浮球」会收起成右下角圆形按钮。浮窗按住标题栏即可拖到任意位置，悬浮球也能直接拖动，松手后的位置会记进设置，刷新页面或重开酒馆后仍在原处；拖动范围限制在视口内，不会拖出屏幕找不回来。
- 暗金主题 + 动效：进度条流动条纹、悬浮球轻微浮动与脉冲光环、结果卡片依次滑入、命中项呼吸高亮、按钮悬停扫光。悬浮球与面板标题使用手绘 SVG 徽标——一只手握剑贯穿牛头（忒修斯斩杀弥诺陶洛斯）。系统开启「减少动态效果」时会自动关闭全部动画。
- 开场白改写：面板里的「开场白改写」卡片直接列出当前角色卡的全部开场白（`first_mes` 与所有 `alternate_greetings`），不需要先扫描、也不要求命中 NTR 就能打开改写器；扫描结果里的开场白条目也一律带「改写 / 抹除开场白」按钮。改写器内可用模型「AI 改写」、本地「抹除命中片段」（仅扫描命中的条目可用），确认后保存回角色卡。角色卡的改动只影响新建聊天，若要让当前聊天也变化，可再点「同步到当前聊天」把新开场白写进当前聊天的第一条消息。改写器底部带运行日志，逐步显示请求发往哪个地址、服务端返回了什么状态，便于排查改写失败的原因。
- 改写器适配：文本框自动占满弹窗的剩余高度（无需手动拖拽，也不会再出现首行被顶出可视区的情况）；标题栏可按住拖动，桌面端能把弹窗挪开以查看被挡住的正文，双击标题栏复位；手机端弹窗自动铺满整屏，按钮自动换行，文本框拿到最大可用高度。
- 文本按段落切块，先用本地关键词粗筛，再向自配模型请求严格 JSON。可关闭粗筛。
- 扫描并发、超时、重试与取消均可配置或控制。连续 3 项失败时自动中止，保留已完成结果。
- SHA-256 缓存键包含文本、模型、接口地址、提示词和相关参数；缓存位于 `extension_settings['ntr-detector'].cache`。
- 实时检测监听 `MESSAGE_RECEIVED`，仅在消息 DOM 下插入警告条，不改动原消息。
- 默认只读：检测只读取角色卡、世界书和聊天数据。世界书通过 SillyTavern 的只读 `/api/worldinfo/get` 接口读取；「定位」按钮只操作编辑器界面。唯一的写入路径是开场白弹窗，且只在你点击「保存到角色卡」后才调用 `/api/characters/edit-attribute`。

### 安装

1. 将整个 `忒修斯神器` 文件夹复制到 `SillyTavern/public/scripts/extensions/third-party/`，形成 `SillyTavern/public/scripts/extensions/third-party/忒修斯神器/manifest.json`。
2. 重启 SillyTavern 或刷新浏览器，在扩展面板启用「忒修斯神器」。

当以 Git 仓库方式（酒馆的 URL 安装）安装时，扩展会自动更新，因为 `manifest.json` 中设置了 `"auto_update": true`。这要求运行 SillyTavern 的机器能访问 GitHub。

本仓库不会自动安装到你的 SillyTavern。

### 配置

填写 API Base URL、API Key 和模型名称，点击「测试连接」。API Base URL 是 OpenAI 兼容接口的根地址，默认 `https://api.openai.com/v1`；扩展会向其 `/chat/completions` 发送非流式请求。浏览器直接访问自定义接口时，服务端需要允许 SillyTavern 页面的 CORS 来源。

### 安全与隐私

API Key 保存在 SillyTavern 的 `extension_settings['ntr-detector']` 中，可能随 SillyTavern 的设置同步到其本机服务端；扩展仅在请求配置的 API 地址时把 Key 放入 `Authorization` 请求头。报告不包含 Key。

### 许可证

[MIT](LICENSE)

---

## 目录结构 · Project layout

```text
忒修斯神器/
├── manifest.json
├── index.js
├── style.css
├── LICENSE
└── README.md
```