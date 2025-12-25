# Bot SDK（plugins/sdk）

这是一套用于快速编写 Bot Service 的最小 SDK（Go module）。推荐只 import `mew/plugins/sdk`（门面包），内部实现按职责拆分到子包，便于后续扩展/维护。

## 提供的能力

- `.env.local/.env` 加载：`sdk.LoadDotEnv(logPrefix)`
- 运行时配置解析：`sdk.LoadRuntimeConfig(serviceType)`（serviceType 推荐用 `sdk.ServiceTypeFromCaller()` 自动获取）
- 后端 bootstrap client：`sdk.NewMewClient(apiBase, adminSecret)`（支持代理环境变量）
- 通用 BotManager（热重载）：`sdk.NewBotManager(client, serviceType, logPrefix, factory)`
- 标准 Service 主循环（可选）：`sdk.RunServiceWithSignals(sdk.ServiceOptions{...})`
- goroutine 组管理（可选）：`g := sdk.NewGroup(ctx); g.Go(...); g.Stop()`
- 基于 webhook url 的文件上传（S3 存储）：`sdk.UploadWebhookReader(...)` / `sdk.UploadWebhookBytes(...)`
- 测试模式（DEV_MODE）：不发 webhook、不上传文件，保存所有请求到本地目录（见下）

## 包结构

- `mew/plugins/sdk`：门面（对外稳定 API）
- `mew/plugins/sdk/core`：dotenv、运行时配置、service 主循环、Group、RunInterval
- `mew/plugins/sdk/config`：Bot.config JSON 解码 + 常用校验
- `mew/plugins/sdk/httpx`：统一的 HTTP client/代理行为 + User-Agent 工具
- `mew/plugins/sdk/mew`：后端 API client
- `mew/plugins/sdk/manager`：BotManager（热重载）
- `mew/plugins/sdk/state`：本地 state 文件路径 + JSON 读写
- `mew/plugins/sdk/collections`：SeenSet 等小工具
- `mew/plugins/sdk/webhook`：webhook post（含 loopback rewrite）+ 基于 webhook url 的文件上传（S3 存储）

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
    NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
      return NewMyRunner(botID, botName, accessToken, rawConfig, cfg)
    },
  })
}
```

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

SDK 默认**不使用代理**（即使系统设置了 `HTTP_PROXY/HTTPS_PROXY`），除非你通过 `UseMEWProxy`/`MEW_API_PROXY` 显式启用。

如需开启，请设置：

- `MEW_API_PROXY=env`：使用 Go 的 ProxyFromEnvironment（`HTTP_PROXY/HTTPS_PROXY/NO_PROXY`）
- `MEW_API_PROXY=http://127.0.0.1:7890`：固定代理（也支持直接写 `127.0.0.1:7890`，会自动补 `http://`）

推荐通过 `sdk.NewHTTPClient(sdk.HTTPClientOptions{ UseMEWProxy: true, ... })` 创建抓取用的 HTTP client：

- 若设置了 `MEW_API_PROXY`：按其配置生效（`env` / 固定代理 / `direct` 等）
- 若未设置 `MEW_API_PROXY`：使用 Go 的默认行为（即 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`，若未设置则为直连）

## State（持久化）

SDK 提供了一个简单的 JSON 文件持久化工具，默认写到系统用户缓存目录：

- `sdk.OpenTaskState[T](serviceType, botID, idx, identity)`：打开一个 task 的 state（`store.Path` + `store.Load()` / `store.Save(v)`）
- `sdk.TaskStateFile(serviceType, botID, idx, identity)`：底层路径生成（不推荐插件层重复封装）
- `sdk.LoadJSONFile[T](path)` / `sdk.SaveJSONFile(path, v)`：底层 JSON 读写（原子写入，适配 Windows）
