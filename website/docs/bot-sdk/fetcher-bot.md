---
sidebar_label: 'Fetcher Bot'
---

# 🕷️ 构建 Fetcher Bot

`Fetcher Bot` 是一种后台守护进程：它周期性地从外部数据源抓取内容，并通过 **Webhook** 单向投递到 Mew 的频道里。它非常适合 RSS/新闻聚合、监控告警、定时推送等场景。

:::info 参考实现
本文以官方示例为最小可用范例：入口 `plugins/cmd/fetchers/test-fetcher/main.go`，核心逻辑在 `plugins/internal/fetchers/test-fetcher/*`。
:::

## 工作原理

以 `test-fetcher` 为例，一个 Fetcher Bot 的生命周期大致是：

1. **注册并拉取实例配置**：服务启动后，会先注册 `serviceType`（`POST /api/infra/service-types/register`），再按 `serviceType` 通过 `POST /api/bots/bootstrap` 批量拉取 Bot 实例配置（SDK 已封装）。
2. **解析任务列表**：每个 Bot 的 `config` 是一段 JSON 字符串，通常表示“多任务数组”。
3. **定时投递**：每个任务按 `interval` 周期触发，向 `webhook` 发送消息（`POST /api/webhooks/:webhookId/:token`）。
4. **配置热更新**：你在界面保存 Bot 配置后，Fetcher 服务会在下一次同步周期自动应用变更（默认 60 秒，可由 `MEW_CONFIG_SYNC_INTERVAL_SECONDS` 调整，见 `plugins/README.md`）。

## 快速上手：运行一个 Test Fetcher

`test-fetcher` 用于验证 Fetcher 链路：它不会抓取外部源，而是按周期把配置里的 `content` 原样投递到指定 `webhook`。

### 1. 启动 Fetcher Bot 服务

在本地启动 `test-fetcher`：

```bash
cd plugins
go run ./cmd/fetchers/test-fetcher
```

### 2. 在频道里创建 Webhook

在任意频道的设置里生成一个 Webhook URL（形如 `http://<mew-host>/api/webhooks/<webhookId>/<token>`），稍后将它填进 Bot 配置里。

### 3. 在前端注册并配置 Bot

1. **创建 Bot**
   在前端创建一个 Bot，并将 **`serviceType`** 设置为 `test-fetcher`。

2. **填写配置 (Bot.config)**
   `test-fetcher` 的配置通常是一个“任务列表”：

   ```json
   [
     {
       "interval": 30,
       "webhook": "http://<mew-host>/api/webhooks/<webhookId>/<token>",
       "content": "hello from test-fetcher",
       "enabled": true
     }
   ]
   ```

   保存后等待一个配置同步周期（默认约 60 秒），你会看到该频道开始收到周期性消息。

:::info 配置格式兼容
SDK 的 `DecodeTasks` 同时支持：
- 任务数组 `[...]`
- 单任务对象 `{...}`
- 包装对象 `{ "tasks": [...] }`
:::

## 配置说明（以 `test-fetcher` 为例）

| 字段 | 说明 |
| :--- | :--- |
| `webhook` | 必填，频道生成的 Webhook 投递地址。 |
| `interval` | 可选，轮询间隔（秒），小于等于 0 时默认 `30`。 |
| `content` | 可选，投递前会 `TrimSpace`；若最终为空字符串，Webhook 投递会失败。 |
| `enabled` | 可选，`false` 时该任务不运行；未设置时视为启用（由 `sdk.IsEnabled` 判定）。 |

:::caution 不同 Fetcher 的配置不同
不同的 Fetcher（如 `rss-fetcher`、`twitter-fetcher`）字段与默认值可能不同；以对应插件的 `ConfigTemplate` / `plugins/cmd/fetchers/*/README.md` 为准。
:::
