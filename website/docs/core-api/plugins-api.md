---
sidebar_label: 'Plugins SDK'
sidebar_position: 40
---

# 🧩 Plugins SDK

`plugins/pkg` 是项目内用于编写 **Bot Service（插件）** 的 Go SDK（Go module：`mew/plugins`）。

SDK 采用**门面模式（Facade Pattern）**，将底层实现（`api`, `runtime`, `state`, `x` 等子包）封装在统一入口中。推荐开发者仅引入门面包：

```go
import sdk "mew/plugins/pkg"
```

---

## 🚀 快速入门

### 最小可运行服务

SDK 推荐使用 `sdk.RunServiceWithSignals` 作为入口。它会自动处理信号监听（SIGINT/SIGTERM）、`.env` 加载、配置同步和优雅退出。

```go title="main.go"
package main

import (
  "context"
  "log"

  sdk "mew/plugins/pkg"
)

// Runner 对应单个 Bot 实例的运行逻辑
type Runner struct {
  botID       string
  botName     string
  accessToken string
  rawConfig   string
  cfg         sdk.RuntimeConfig
}

// Run 是 Bot 的主循环
func (r *Runner) Run(ctx context.Context) error {
  log.Printf("[runner] start bot=%s name=%s", r.botID, r.botName)
  <-ctx.Done() // 等待上下文取消（服务停止或配置重载）
  return ctx.Err()
}

func main() {
  // 启动服务
  _ = sdk.RunServiceWithSignals(sdk.ServiceOptions{
    LogPrefix: "[my-bot]",
    // NewRunner 工厂函数：每当有新 Bot 分配给此服务时调用
    NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
      return &Runner{
        botID: botID, botName: botName,
        accessToken: accessToken,
        rawConfig: rawConfig,
        cfg: cfg,
      }, nil
    },
  })
}
```

---

## ⚙️ 服务架构与生命周期

### 启动选项

`RunService` / `RunServiceWithSignals` 的核心配置结构体：

| 字段 | 说明 |
| :--- | :--- |
| **`NewRunner`** | **(必填)** Bot 实例工厂函数。 |
| `LogPrefix` | 日志前缀（默认 `[bot]`）。 |
| `ServiceType` | 服务类型标识（留空则自动推导）。 |
| `ServerName/Icon/Description` | 注册到后端用于前端展示的名称、图标与描述。 |
| `ConfigTemplate` | 用于前端创建 Bot 时的配置模板提示。 |
| `DisableDotEnv` | 是否禁用 `.env` 自动加载。 |
| `DisableInitialSync` | 是否禁用启动时的首次同步。 |
| `SyncInterval` | 配置同步周期（覆盖环境变量）。 |

### ServiceType 推导规则

若未显式指定 `ServiceOptions.ServiceType`，SDK 会根据入口文件位置自动推导：
1. **默认**：取调用方源文件所在的目录名。
2. **新布局**：若入口在 `plugins/cmd/(fetchers|agents)/<serviceType>/main.go`，则使用目录名 `<serviceType>`。
3. **兼容旧布局**：若入口在 `plugins/cmd/(fetchers|agents)/<name>.go`，则使用文件名 `<name>`。

`sdk.LoadRuntimeConfig(serviceType)` 会校验 `serviceType` 非空，且不能是保留值 `pkg`。

### BotManager（热重载管理）

SDK 内部通过 `BotManager` 管理多 Bot 实例。其核心逻辑 `SyncOnce(ctx)` 流程如下：
1. **注册**：向后端注册 `serviceType` 信息（含 `serverName/icon/description/configTemplate`）。
2. **拉取**：获取当前分配给该服务的 Bot 列表（`BootstrapBots`）。
3. **比对**：基于 `bot.Config` 的 SHA-256 哈希判断配置变更。
4. **重载**：
   - 配置变更：取消旧 Runner 的 `ctx` -> 启动新 Runner。
   - Bot 删除：停止对应 Runner。

---

## 🔧 配置与环境变量

### 运行时配置

通过 `sdk.LoadRuntimeConfig(serviceType)` 加载：

- **`MEW_ADMIN_SECRET`**：(必填) 管理员密钥。
- **`MEW_API_BASE`**：API 地址。若为空则依次尝试 `MEW_URL + "/api"` 或 `http://localhost:3000/api`。
- **`MEW_CONFIG_SYNC_INTERVAL_SECONDS`**：配置同步间隔（默认 60秒）。

### .env 加载机制

启动函数默认调用 `sdk.LoadDotEnvFromCaller(...)`，从调用栈位置向上查找并加载 `.env.local` 或 `.env`。

:::info 禁用 .env
设置环境变量 `MEW_DOTENV` 为 `0`, `false`, `off` 或 `no` 可强制跳过加载。
:::

---

## 📡 Webhook：消息与文件

### 发送消息

支持结构体参数或 Raw JSON（带重试）：

- **`sdk.PostWebhook`**：传入 `sdk.WebhookPayload` 结构体。
- **`sdk.PostWebhookJSONWithRetry`**：传入 JSON 数据，失败时指数退避重试。

**Loopback 重写**：若 Webhook URL 指向 `localhost/127.0.0.1`，SDK 会自动将其改写为 `MEW_API_BASE` 的 host，以解决容器化部署时的网络问题。

```go
payload := sdk.WebhookPayload{
  Content: "hello from plugin",
}
// 参数：ctx, httpClient, apiBase, webhookURL, payload, maxRetries
_ = sdk.PostWebhook(ctx, nil, cfg.APIBase, webhookURL, payload, 3)
```

### 文件上传

SDK 会按条件选择上传策略：
- 当文件大小可确定且 `<= 8MB` 时，优先尝试 **预签名 PUT 直传**（`/presign`）。
- 预签名不可用/失败时，自动回退到 Multipart Upload（`/upload`）。

- **`sdk.UploadWebhookBytes`** / **`sdk.UploadWebhookReader`**：直接上传内存数据或流。
- **`sdk.UploadRemoteToWebhook`**：下载远程 URL 并转存。
- **`sdk.UploadRemoteToWebhookCached`**：带缓存的转存（基于 `sdk.MediaCache` 接口）。

:::tip 图片下载增强
下载远程图片时，若直接下载失败，SDK 可能会尝试使用 `wsrv.nl` 作为代理进行兜底。
:::

### DEV_MODE（调试模式）

开启方式：环境变量 `DEV_MODE` 设为 `1`, `true`, `on` 等。

- **Webhook**：请求不发送，改为落盘记录请求内容。
- **Upload**：文件保存到本地目录（默认 `StateBaseDir()/dev`），返回假的本地 Key。

---

## 🔐 鉴权与 API 交互

### Bot Session

用于需要保持登录状态或自动刷新 Token 的场景：

```go
// 推荐使用 NewMewUserHTTPClient 以支持 CookieJar
hc, _ := sdk.NewMewUserHTTPClient()
sess := sdk.NewBotSession(cfg.APIBase, accessToken, hc)

// 获取 User 实体
me, _ := sess.User(ctx)
// 获取自动注入 Authorization Header 的 Client
client := sess.HTTPClient()
```

### User Token 辅助能力

用于以“用户/机器人”身份调用 Mew 核心 API：

- **`sdk.LoginBot` / `sdk.Refresh`**：登录与 Token 刷新。
- **`sdk.FetchDMChannels`**：获取私信频道列表。
- **`sdk.FetchChannelMessages` / `sdk.SearchChannelMessages`**：拉取或搜索历史消息。
- **`sdk.NewDMChannelCache`**：DM 频道的本地缓存封装。

---

## 🛠️ 底层工具与持久化

### HTTP Client 与 代理

使用 `sdk.NewHTTPClient(opts)` 创建客户端：

- **User-Agent**：默认剥离 UA 以避免被拦截；可用 `sdk.RandomBrowserUserAgent()` 生成伪造 UA。
- **代理策略**：由 `opts.Mode` 或环境变量 `MEW_API_PROXY` 控制（默认 `direct`）：
  - `direct`：直连（不走系统代理）
  - `env`：使用 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`
  - `proxy`：优先走内置代理池，再回退到环境代理（若存在）和直连

可用环境变量：
- `MEW_API_PROXY=direct|env|proxy`
- `PROXY_LIST_URLS`：在 `proxy` 模式下提供代理列表源

如需显式指定单个代理 URL，可通过 `sdk.NewHTTPClient(sdk.HTTPClientOptions{Mode: "proxy", Proxy: "<proxy-url>"})` 提供。

### State：本地持久化

数据默认存储在系统用户缓存目录下的 `/mew` 目录（如 Windows `%LOCALAPPDATA%/mew`）。

- **路径获取**：`sdk.BotStateDir(...)` / `sdk.TaskStateFile(...)`
- **JSON 读写**：`sdk.LoadJSONFile[T]`, `sdk.SaveJSONFile`
- **任务状态管理**：
  ```go
  // 基于 identity 的哈希生成唯一文件名 task-<idx>-<shortHash>.json
  store := sdk.OpenTaskState[MyData](serviceType, botID, taskIndex, "unique-id")
  data, err := store.Load()
  err := store.Save(newData)
  ```

### 通用工具函数

- **并发控制**：`sdk.NewGroup(ctx)`（基于 `syncx.Group`）。
- **定时任务**：`sdk.RunInterval(ctx, interval, immediate, fn)`。
- **配置解析**：`sdk.DecodeTasks[T](rawConfig)` 支持解析单个对象或数组。
- **HTML/文本**：`sdk.CleanText`, `sdk.FirstImageURLFromHTML`。
- **数据结构**：`sdk.NewSeenSet(max)`（定长去重集合）。
