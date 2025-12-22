# RSS Fetcher Bot (serviceType: `rss-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=rss-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取 `rss_url`，检测到新条目后向对应 `webhook` 推送消息。

推送默认使用消息类型 `app/x-rss-card`（RSS 卡片），由前端以卡片样式渲染。

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "interval": 3600,
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "rss_url": "https://example.com/feed.xml",
    "enabled": true,
    "send_history_on_start": false,
    "max_items_per_poll": 5
  },
  {
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "rss_url": "https://another.example/rss"
  }
]
```

### 兼容：单任务对象 / 包装对象

也支持：

- 单任务对象（等价于数组只包含 1 个元素）
- `{ "tasks": [...] }`（等价于直接数组）
- `url` 字段作为 `rss_url` 的别名（兼容旧文档）

字段说明：

- `interval`：轮询间隔（秒），默认 `300`（5 分钟）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前 feed 的历史条目（谨慎开启避免刷屏）
- `max_items_per_poll`：可选，单次最多推送多少条新内容（默认 `5`，上限 `20`）

## 去重与缓存

- 支持 `ETag` / `Last-Modified` 条件请求，减少重复流量
- 抓取端会随机使用常见浏览器 `User-Agent` 以降低被拦截风险
- 支持本地持久化去重 state（默认写到系统用户缓存目录的 `mew/plugins/rss-fetcher/<botId>/...`；可用 `MEW_STATE_DIR` 覆盖），避免重启后重复推送

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run .
```
