# RSS Fetcher Bot (serviceType: `rss-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=rss-fetcher` 的 Bot 实例配置，并把每个配置数组元素当作一个独立的定时任务：按 `interval` 间隔抓取 `rss_url`，检测到新条目后向对应 `webhook` 发送消息。

## 配置格式（Bot.config，JSON 字符串）

```json
[
  {
    "interval": 3600,
    "webhook": "http://mew-backend/api/webhooks/v1/78sdyf...",
    "rss_url": "https://example.com/feed.xml",
    "enabled": true,
    "send_history_on_start": false
  },
  {
    "interval": 7200,
    "webhook": "http://mew-backend/api/webhooks/v1/xxx",
    "rss_url": "https://another.example/rss",
    "enabled": true
  }
]
```

说明：

- `interval`：秒
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前 feed 的历史条目（默认关闭避免刷屏）

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run .
```
