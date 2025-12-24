# Pornhub Fetcher Bot (serviceType: `pornhub-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=pornhub-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取 `https://jp.pornhub.com/model/<username>/videos`，检测到新视频后向对应 `webhook` 推送消息。

推送消息默认使用 `Type: "app/x-pornhub-card"`（用于前端以卡片/媒体形式渲染）。

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "username": "some_user",
    "interval": 300,
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

### 兼容：单任务对象

也支持单个对象（等价于数组只包含 1 个元素）。

字段说明：

- `username`：必填，Pornhub model 用户名（用于拼接到 `.../model/<username>/videos`）
- `webhook`：必填，消息推送地址
- `interval`：轮询间隔（秒），默认 `43200`（12 小时）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前页面解析到的历史视频（谨慎开启避免刷屏）

## 去重与缓存

- 解析出的视频会用 `viewkey` 做去重（避免重复推送）
- 支持本地持久化 state（默认写到系统用户缓存目录的 `mew/plugins/pornhub-fetcher/<botId>/task-<idx>-<hash>.json`；可用 `MEW_STATE_DIR` 覆盖），避免重启后重复推送

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run .
```

