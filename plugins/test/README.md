# Test Bot (serviceType: `test`)

这个 Bot 会从后端批量拉取所有 `serviceType=test` 的 Bot 实例配置，并把每个配置数组元素当作一个独立的定时任务：按 `interval` 间隔向对应 `webhook` 发送 `content`。

## 配置格式（Bot.config，JSON 字符串）

```json
[
  { "interval": 3600, "webhook": "http://mew-backend/api/webhooks/xxx", "content": "test_channel_1" },
  { "interval": 7200, "webhook": "http://mew-backend/api/webhooks/yyy", "content": "xxx" }
]
```

## 运行

环境变量：

`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run .
```
