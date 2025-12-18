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

- `MEW_ADMIN_SECRET`：必填，对应后端 `MEW_ADMIN_SECRET`
- `MEW_URL`：后端基址（默认 `http://localhost:3000`）
- `MEW_API_BASE`：可选，直接指定 API 基址（如 `http://localhost:3000/api`；优先级高于 `MEW_URL`）
- `MEW_SERVICE_TYPE`：默认 `test`
- `MEW_CONFIG_SYNC_INTERVAL_SECONDS`：轮询同步间隔，默认 `60`
- `MEW_DOTENV`：可选，设置为 `0/false/off/no` 可禁用 `.env` 加载（默认启用）

本地开发会自动尝试从以下文件加载环境变量（仅在变量尚未设置时才会写入）：

- `.env.local`（优先）
- `.env`

运行：

```bash
go run .
```

