# Twitter Fetcher Bot (serviceType: `twitter-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=twitter-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取公开时间线数据，检测到新 Tweet 后向对应 `webhook` 推送消息。

推送消息默认使用 `Type: "app/x-twitter-card"`（用于前端以卡片/媒体形式渲染）。

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "username": "yyy",
    "interval": 3600,
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "enabled": true,
    "send_history_on_start": false
  },
  {
    "username": "xxx",
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>"
  }
]
```

### 兼容：单任务对象 / 包装对象

也支持：

- 单任务对象（等价于数组只包含 1 个元素）
- `{ "tasks": [...] }`（等价于直接数组）
- `handle` 字段作为 `username` 的别名（兼容字段名），且允许 `@xxx` 写法

字段说明：

- `username`：必填，X/Twitter 用户名（handle，不带 `@`）
- `webhook`：必填，消息推送地址
- `interval`：轮询间隔（秒），默认 `3600`（60 分钟）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前抓到的历史 Tweet（谨慎开启避免刷屏）

## 去重与缓存

- 用 Tweet `restId` 去重（避免重复推送）
- 抓取端会随机使用常见浏览器 `User-Agent` 以降低被拦截风险
- 抓取端会自动请求 `/_trace` 获取 `_utid` Cookie
- 媒体文件会通过 webhook `/upload` 本地化到 S3/CDN，并在本地 state 中缓存 `remoteURL -> key`，避免重复上传
- 支持本地持久化 state（默认写到系统用户缓存目录的 `mew/plugins/twitter-fetcher/<botId>/task-<idx>-<hash>.json`），避免重启后重复推送

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run ./cmd/twitter-fetcher
```
