# Bot SDK（plugins/sdk）

这是一套用于快速编写 Bot Service 的最小 SDK（Go module），目标是让每个 bot 只关注“如何把 config 变成任务并执行”，其余通用逻辑复用。

## 提供的能力

- `.env.local/.env` 加载：`sdk.LoadDotEnv(logPrefix)`
- 运行时配置解析：`sdk.LoadRuntimeConfig(serviceType)`（serviceType 推荐用 `sdk.ServiceTypeFromCaller()` 自动获取）
- 后端 bootstrap client：`sdk.NewMewClient(apiBase, adminSecret)`
- 通用 BotManager（热重载）：`sdk.NewBotManager(client, serviceType, logPrefix, factory)`

## Runner 接口

每个插件只需要实现：

- `type Runner interface { Start() (stop func()) }`

并提供 `RunnerFactory`：

- `func(botID, botName, rawConfig string) (sdk.Runner, error)`

`BotManager` 会按 `bot.Config` 的 hash 判断是否需要重载，并在配置变更/删除时调用 stop 释放资源。

## `.env` 约定

见 `plugins/README.md` 的“通用环境变量”和“.env.local/.env 加载规则”。
