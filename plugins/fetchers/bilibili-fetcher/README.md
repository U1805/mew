# Bilibili Fetcher Bot (serviceType: `bilibili-fetcher`)

这个 Bot 会从后端批量拉取所有 `serviceType=bilibili-fetcher` 的 Bot 实例配置，并把配置中的每个任务当作一个独立的定时任务：按间隔抓取指定 UP 的动态列表，检测到新动态后向对应 `webhook` 推送消息。

推送消息默认使用 `Type: "app/x-bilibili-card"`。

## 配置格式（Bot.config，JSON 字符串）

### 推荐：数组（多任务）

```json
[
  {
    "uid": "2",
    "interval": 300,
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>",
    "enabled": true,
    "send_history_on_start": false
  },
  {
    "uid": "3",
    "webhook": "http://mew-server/api/webhooks/<webhookId>/<token>"
  }
]
```

### 兼容：单任务对象 / 包装对象

也支持：

- 单任务对象（等价于数组只包含 1 个元素）
- `{ "tasks": [...] }`（等价于直接数组）

字段说明：

- `uid`：必填，B 站用户 UID（mid）
- `webhook`：必填，消息推送地址
- `interval`：轮询间隔（秒），默认 `300`（5 分钟）
- `enabled`：可选，默认为 `true`；为 `false` 时该任务不运行
- `send_history_on_start`：可选，默认为 `false`；为 `true` 时首次启动会推送当前抓到的历史动态（谨慎开启避免刷屏）

## 去重与缓存

- 用 `dynamic_id`（`id_str`）去重（避免重复推送）
- 支持本地持久化 state（默认写到系统用户缓存目录的 `mew/plugins/bilibili-fetcher/<botId>/...`），避免重启后重复推送

## 运行

环境变量：
`.env.local/.env` 加载规则与通用环境变量说明见 `plugins/README.md`（由 `plugins/sdk` 提供）。

运行：

```bash
go run .
```

