# Bot SDK（plugins/sdk）

这是一套用于快速编写 Bot Service 的最小 SDK（Go module）。推荐只 import `mew/plugins/sdk`（门面包），内部实现按职责拆分到子包，便于后续扩展/维护。

## 提供的能力

- `.env.local/.env` 加载：`sdk.LoadDotEnv(logPrefix)`
- 运行时配置解析：`sdk.LoadRuntimeConfig(serviceType)`（serviceType 推荐用 `sdk.ServiceTypeFromCaller()` 自动获取）
- 后端 bootstrap client：`sdk.NewMewClient(apiBase, adminSecret)`（支持代理环境变量）
- 通用 BotManager（热重载）：`sdk.NewBotManager(client, serviceType, logPrefix, factory)`
- 标准 Service 主循环（可选）：`sdk.RunServiceWithSignals(sdk.ServiceOptions{...})`
- goroutine 组管理（可选）：`g := sdk.NewGroup(ctx); g.Go(...); g.Stop()`

## 包结构

- `mew/plugins/sdk`：门面（对外稳定 API）
- `mew/plugins/sdk/core`：dotenv、运行时配置、service 主循环、Group
- `mew/plugins/sdk/mew`：后端 API client
- `mew/plugins/sdk/manager`：BotManager（热重载）
- `mew/plugins/sdk/webhook`：webhook payload + post + URL rewrite

## Runner 接口

每个插件只需要实现：

- `type Runner interface { Start() (stop func()) }`

并提供 `RunnerFactory`：

- `func(botID, botName, rawConfig string) (sdk.Runner, error)`

`BotManager` 会按 `bot.Config` 的 hash 判断是否需要重载，并在配置变更/删除时调用 stop 释放资源。

## 推荐写法（main）

```go
func main() {
  _ = sdk.RunServiceWithSignals(sdk.ServiceOptions{
    LogPrefix: "[my-bot]",
    NewRunner: func(botID, botName, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
      return NewMyRunner(botID, botName, rawConfig, cfg.APIBase)
    },
  })
}
```

## `.env` 约定

见 `plugins/README.md` 的“通用环境变量”和“.env.local/.env 加载规则”。

## 请求代理（可选）

SDK 默认**不使用代理**（即使系统设置了 `HTTP_PROXY/HTTPS_PROXY`）。

如需开启，请设置：

- `MEW_API_PROXY=env`：使用 Go 的 ProxyFromEnvironment（`HTTP_PROXY/HTTPS_PROXY/NO_PROXY`）
- `MEW_API_PROXY=http://127.0.0.1:7890`：固定代理（也支持直接写 `127.0.0.1:7890`，会自动补 `http://`）
