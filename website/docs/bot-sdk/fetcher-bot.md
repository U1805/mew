---
sidebar_label: 'Fetcher Bot'
---

## 🕷️ 构建 Fetcher Bot

**目标**：编写一个后台 Bot 服务，从 Mew 平台拉取本 `serviceType` 下的 Bot 配置，把 `bot.config` 解析为任务列表，并按任务定时向 Webhook 投递消息。

> **参考实现**：`plugins/fetchers/test-fetcher`（建议先跑通这个示例再开始改造）。

### 1. Service 入口（main）

Fetcher Bot 推荐直接复用项目内的 Go SDK：`plugins/sdk`。SDK 会负责：

- 读取 `.env(.local)` 与运行时配置（`MEW_ADMIN_SECRET`, `MEW_API_BASE`, 同步间隔等）
- 通过 `POST /api/bots/bootstrap` 拉取/热更新 bot 配置
- 管理每个 bot 实例的生命周期（配置变更时自动取消旧实例）

```go
package main

import (
	"log"

	"mew/plugins/sdk"
)

func main() {
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[my-fetcher]",
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			return NewMyRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
```

> `serviceType` 默认从插件目录名推导：例如你的代码在 `plugins/fetchers/rss-fetcher`，则默认 `serviceType=rss-fetcher`。

### 2. 解析任务配置（bot.config）

Fetcher Bot 通常使用“任务数组”来表达多个定时任务：Mew 后端存储的是 JSON 字符串，插件启动时解析成结构体列表。

```go
type TaskConfig struct {
	Interval int    `json:"interval"`
	Webhook  string `json:"webhook"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

func parseTasks(rawConfig string) ([]TaskConfig, error) {
	tasks, err := sdk.DecodeTasks[TaskConfig](rawConfig)
	if err != nil {
		return nil, err
	}
	for i := range tasks {
		if tasks[i].Interval <= 0 {
			tasks[i].Interval = 30
		}
		if err := sdk.ValidateHTTPURL(tasks[i].Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook invalid: %w", i, err)
		}
	}
	return tasks, nil
}
```

### 3. 运行定时任务并投递 Webhook

SDK 提供了 `Group` 与 `RunInterval`，适合一 bot 多任务的并发模型：每个任务一个 goroutine，统一受 `ctx` 管理。

```go
func (r *MyRunner) Run(ctx context.Context) error {
	g := sdk.NewGroup(ctx)

	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}

	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue
		}
		taskIndex := i
		taskCopy := task
		g.Go(func(ctx context.Context) {
			sdk.RunInterval(ctx, time.Duration(taskCopy.Interval)*time.Second, true, func(ctx context.Context) {
				_ = sdk.PostWebhook(ctx, webhookHTTPClient, r.apiBase, taskCopy.Webhook, sdk.WebhookPayload{
					Content: fmt.Sprintf("hello from %s task=%d", r.botName, taskIndex),
				}, 3)
			})
		})
	}

	<-g.Context().Done()
	g.Wait()
	return nil
}
```

下一步：继续阅读 [构建 Agent Bot](/docs/bot-sdk/agent-bot) 来实现双向会话型 Bot。
