# TikTok Fetcher Bot (serviceType: `tiktok-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=tiktok-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取公开 TikTok 页面数据，检测到新视频后向对应 `webhook` 推送消息。

推送消息默认使用 `Type: "app/x-tiktok-card"`（用于前端按卡片渲染）。

当前内置数据源：

- `urlebird.com`（JSON-LD 解析）

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "username": "kokona_rec",
    "interval": 3600,
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "enabled": true,
    "send_history_on_start": false
  },
  {
    "username": "another_user",
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>"
  }
]
```

### 兼容：单任务对象 / 包装对象

也支持：

- 单任务对象（等价于数组只包含 1 个元素）
- `{ "tasks": [...] }`（等价于直接数组）
- `handle` 字段作为 `username` 别名（兼容字段名），且允许 `@xxx` 写法

字段说明：

- `username`：必填，TikTok 用户名（不带 `@`）
- `webhook`：必填，消息推送地址
- `interval`：轮询间隔（秒），默认 `3600`（60 分钟）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前抓到的历史视频（谨慎开启避免刷屏）

## Cloudflare 与 FlareSolverr

Urlebird 可能触发 Cloudflare 挑战，建议配置：

- `FLARESOLVERR_URL`：例如 `http://127.0.0.1:8191`

配置后会优先使用 FlareSolverr 拉取页面 HTML；未配置时会直接请求站点。

## 去重与缓存

- 用视频 `id` 去重（避免重复推送）
- 媒体文件（视频、封面、头像）会通过 webhook `/upload` 本地化到 S3/CDN，并在本地 state 中缓存 `remoteURL -> key`，避免重复上传
- 支持本地持久化 state（默认写到系统用户缓存目录的 `mew/plugins/tiktok-fetcher/<botId>/task-<idx>-<hash>.json`）

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/pkg` 提供）。

运行：

```bash
go run ./plugins/cmd/fetchers/tiktok-fetcher
```
