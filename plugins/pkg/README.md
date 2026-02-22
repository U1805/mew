# Bot SDK（plugins/pkg）

这是一套用于快速编写 Bot Service 的最小 SDK（Go module）。推荐只 import `mew/plugins/pkg`（门面包），内部实现按职责拆分到子包，便于后续扩展/维护。

## 提供的能力

- `.env.local/.env` 加载：`sdk.LoadDotEnv(logPrefix)`
- 运行时配置解析：`sdk.LoadRuntimeConfig(serviceType)`（serviceType 推荐用 `sdk.ServiceTypeFromCaller()` 自动获取）
- 后端 bootstrap client：`sdk.NewMewClient(apiBase, adminSecret)`（始终直连）
- 通用 BotManager（热重载）：`sdk.NewBotManager(client, serviceType, logPrefix, factory)`
- 标准 Service 主循环（可选）：`sdk.RunServiceWithSignals(sdk.ServiceOptions{...})`
- goroutine 组管理（可选）：`g := sdk.NewGroup(ctx); g.Go(...); g.Stop()`
- 基于 webhook url 的文件上传（S3 存储）：`sdk.UploadWebhookReader(...)` / `sdk.UploadWebhookBytes(...)`
- 在满足条件时（例如 `UploadBytes` 已知大小且 ≤ 8MB），SDK 会优先走 **预签名 PUT 直传**（`/api/webhooks/:id/:token/presign`），失败时自动回退到旧的 multipart 上传（`.../upload`）。
- 测试模式（DEV_MODE）：不发 webhook、不上传文件，保存所有请求到本地目录（见下）

## 包结构

- `mew/plugins/pkg`：门面（对外稳定 API）
- `mew/plugins/pkg/api`：通信层（通用 types + 错误定义）
- `mew/plugins/pkg/api/client`：后端 REST client（Admin bootstrap / service-type register）
- `mew/plugins/pkg/api/auth`：登录 / refresh / 自动带 Token 的 RoundTripper
- `mew/plugins/pkg/api/messages`：消息相关 API
- `mew/plugins/pkg/api/gateway`：长连接相关（infra presence）
- `mew/plugins/pkg/api/gateway/socketio`：socket.io gateway client
- `mew/plugins/pkg/api/webhook`：webhook post + 文件上传（S3 存储）
- `mew/plugins/pkg/runtime`：运行层（dotenv/config/service 主循环/BotManager/session/cache）
- `mew/plugins/pkg/state`：持久层（本地 state 文件路径 + JSON 读写 + seen/media cache）
- `mew/plugins/pkg/x`：扩展层（`httpx`/`llm`/`devmode`/`htmlutil`/`timeutil`/`callerx`/`misc`/`ptr`/`syncx` 等）


## Runner 接口

每个插件只需要实现：

- `type Runner interface { Run(ctx context.Context) error }`

并提供 `RunnerFactory`：

- `func(botID, botName, accessToken, rawConfig string) (sdk.Runner, error)`

`BotManager` 会按 `bot.Config` 的 hash 判断是否需要重载，并在配置变更/删除时取消 `ctx` 触发优雅退出。

## 推荐写法（main）

```go
func main() {
  _ = sdk.RunServiceWithSignals(sdk.ServiceOptions{
    LogPrefix: "[my-bot]",
    // ServiceType 默认从插件目录名推导，也可以手动覆盖：
    // ServiceType: "my-service-type",
    // 注册到 MEW 后台的展示信息（可选）：
    // ServerName: "我的 Bot（中文名）",
    // Icon: "https://example.com/icon.png",
    // Description: "一句话描述（可多行）",
    // ConfigTemplate: `[{"interval":300,"webhook":"..."}]`,
    NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
      return NewMyRunner(botID, botName, accessToken, rawConfig, cfg)
    },
  })
}
```

`ServerName/Icon/Description/ConfigTemplate` 会在服务端 `POST /api/infra/service-types/register` 时上报，
用于前端展示和创建 Bot 时的配置模板提示。

## `.env` 约定

见 `plugins/README.md` 的“通用环境变量”和“.env.local/.env 加载规则”。

## 测试模式（DEV_MODE）

当 `DEV_MODE=true`（也支持 `1/yes/on`）时：

- `sdk.PostWebhook(...)` / `sdk.PostWebhookJSONWithRetry(...)` 不会真的发送 HTTP 请求，而是把请求内容保存为 JSON 文件
- `sdk.UploadWebhookReader(...)` / `sdk.UploadWebhookBytes(...)` 不会真的上传（S3），而是把文件内容保存到本地，并返回一个 `Attachment.Key`（用于插件侧查看结果）

保存目录：

- 默认：`sdk.DevModeDir()`（即 `MEW_DEV_DIR` 或 `StateBaseDir()/dev`）
- webhook 记录：`{DevModeDir}/webhook/post/<serviceType>-<timestamp>-<rand>.json`
- upload 记录：`{DevModeDir}/webhook/upload/<serviceType>-<timestamp>-<rand>.json`
- upload 数据：`{DevModeDir}/webhook/upload/<serviceType>-<timestamp>-<rand>-<filename>`

## 请求代理（可选）

`sdk.NewHTTPClient` 支持三种模式：

- `Mode: "direct"`：显式直连（默认）
- `Mode: "env"`：使用 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`
- `Mode: "proxy"`：优先走内置 SOCKS5 代理池，再回退到环境代理（若配置）和直连

`MEW_API_PROXY` 支持：

- `MEW_API_PROXY=direct`：直连
- `MEW_API_PROXY=env`：使用 Go 的 `ProxyFromEnvironment`（`HTTP_PROXY/HTTPS_PROXY/NO_PROXY`）
- `MEW_API_PROXY=proxy`：启用回退链，回退顺序为：

1. 内置代理池（`PROXY_LIST_URLS`）
2. 若 `HTTP_PROXY/HTTPS_PROXY` 非空，则走 `ProxyFromEnvironment`
3. 直连

## State（持久化）

SDK 提供了一个简单的 JSON 文件持久化工具，默认写到系统用户缓存目录：

- `sdk.OpenTaskState[T](serviceType, botID, idx, identity)`：打开一个 task 的 state（`store.Path` + `store.Load()` / `store.Save(v)`）
- `sdk.TaskStateFile(serviceType, botID, idx, identity)`：底层路径生成（不推荐插件层重复封装）
- `sdk.LoadJSONFile[T](path)` / `sdk.SaveJSONFile(path, v)`：底层 JSON 读写（原子写入，适配 Windows）
