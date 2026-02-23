# Instagram Fetcher Bot (serviceType: `instagram-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=instagram-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取公开 Stories 数据，检测到新条目后向对应 `webhook` 推送消息。

推送消息默认使用 `Type: "app/x-instagram-card"`（用于前端以卡片/媒体形式渲染）。

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "username": "yyyyy",
    "interval": 3600,
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "enabled": true,
    "send_history_on_start": false
  },
  {
    "username": "xxxxx",
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>"
  }
]
```

### 兼容：单任务对象 / 包装对象

也支持：

- 单任务对象（等价于数组只包含 1 个元素）
- `{ "tasks": [...] }`（等价于直接数组）

字段说明：

- `username`：必填，Instagram 用户名
- `webhook`：必填，消息推送地址
- `interval`：轮询间隔（秒），默认 `3600`（60 分钟）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前抓到的历史条目（谨慎开启避免刷屏）

## 去重与缓存

- 优先用 Story `display_url_filename` 去重（更稳定；为空时回退到 `id`）
- 媒体文件（包括故事媒体与头像）会通过 webhook `/upload` 本地化到 S3/CDN，并在本地 state 中缓存 `remoteURL -> key`，避免重复上传
- 支持本地持久化 state（默认写到系统用户缓存目录的 `mew/plugins/instagram-fetcher/<botId>/task-<idx>-<hash>.json`）

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/pkg` 提供）。

运行：

```bash
go run ./plugins/cmd/fetchers/instagram-fetcher.go
```

