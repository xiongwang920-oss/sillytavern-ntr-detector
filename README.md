# NTR Content Detector · NTR 内容检测器

A third-party front-end extension for **SillyTavern 1.12+** that detects NTR (netorare) content in character cards, world info, and chat, using your own OpenAI-compatible API. All UI text is in Chinese.

一个适用于 **SillyTavern 1.12+** 的第三方前端扩展，使用你自配的 OpenAI 兼容接口检测角色卡、世界书与聊天中的 NTR 内容。全部界面文案为中文。

---

## English

### Features

- Per-field character card scan; per-entry world info scan; optional chat scan and realtime detection.
- The current character card is detected automatically when it is opened or switched (on by default, can be disabled), so no manual scan is needed.
- Text is split into chunks by paragraph, pre-filtered locally by keywords, then sent to your model for strict JSON output. The pre-filter can be disabled.
- Configurable concurrency, timeout, retries, and cancellation. The scan aborts automatically after 3 consecutive failures and keeps already-completed results.
- The SHA-256 cache key includes text, model, endpoint, prompt, and related parameters; cached under `extension_settings['ntr-detector'].cache`.
- Realtime detection listens to `MESSAGE_RECEIVED` and only inserts a warning bar into the message DOM; the original message is never modified.
- Read-only: only character card, world info, and chat data are read. World info is read via SillyTavern's read-only `/api/worldinfo/get` endpoint; the "locate" button only manipulates the editor UI.

### Installation

1. Copy the whole `ntr-detector` folder into `SillyTavern/public/scripts/extensions/third-party/`, so that the path `SillyTavern/public/scripts/extensions/third-party/ntr-detector/manifest.json` exists.
2. Restart SillyTavern or refresh the browser, then enable "NTR 内容检测器" in the extensions panel.

When installed as a Git repository (via SillyTavern's URL install), the extension updates automatically, because `manifest.json` sets `"auto_update": true`. This requires the machine running SillyTavern to be able to reach GitHub.

### Configuration

Fill in the API Base URL, API Key, and model name, then click "测试连接" (Test connection). The API Base URL is the root address of an OpenAI-compatible endpoint, defaulting to `https://api.openai.com/v1`; the extension sends non-streaming requests to its `/chat/completions`. When accessing a custom endpoint directly from the browser, the server must allow the SillyTavern page's origin via CORS.

### Security & privacy

The API Key is stored in SillyTavern's `extension_settings['ntr-detector']` and may be synced to its local server along with SillyTavern settings. The extension only places the key in the `Authorization` header when requesting the configured API address. Reports do not include the key.

### License

[MIT](LICENSE)

---

## 中文

### 功能

- 角色卡逐字段扫描；世界书逐条目扫描；聊天扫描与实时检测可选。
- 打开或切换角色卡时自动检测该角色卡（默认开启，可关闭），无需手动点击扫描。
- 文本按段落切块，先用本地关键词粗筛，再向自配模型请求严格 JSON。可关闭粗筛。
- 扫描并发、超时、重试与取消均可配置或控制。连续 3 项失败时自动中止，保留已完成结果。
- SHA-256 缓存键包含文本、模型、接口地址、提示词和相关参数；缓存位于 `extension_settings['ntr-detector'].cache`。
- 实时检测监听 `MESSAGE_RECEIVED`，仅在消息 DOM 下插入警告条，不改动原消息。
- 只读取角色卡、世界书和聊天数据。世界书通过 SillyTavern 的只读 `/api/worldinfo/get` 接口读取；「定位」按钮只操作编辑器界面。

### 安装

1. 将整个 `ntr-detector` 文件夹复制到 `SillyTavern/public/scripts/extensions/third-party/`，形成 `SillyTavern/public/scripts/extensions/third-party/ntr-detector/manifest.json`。
2. 重启 SillyTavern 或刷新浏览器，在扩展面板启用「NTR 内容检测器」。

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
ntr-detector/
├── manifest.json
├── index.js
├── style.css
├── LICENSE
└── README.md
```