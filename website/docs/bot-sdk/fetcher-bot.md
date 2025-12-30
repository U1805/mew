---
sidebar_label: 'Fetcher Bot'
---

# 🕷️ 构建 Fetcher Bot

本篇文档将引导你一步步构建一个后台 `Fetcher Bot` 服务。

#### **目标**
我们的目标是编写一个 Go 服务，它能自动从 Mew 平台拉取属于自己 `serviceType` 的 Bot 配置。服务会解析配置中的任务列表，并按照设定的时间间隔，周期性地向指定的 Webhook 地址推送消息。

:::info 参考实现
我们强烈建议您先跑通示例项目 `plugins/fetchers/test-fetcher`，这会帮助您更快地理解核心流程，然后再基于它进行改造。
:::

### 第一步：创建服务入口

为了简化开发，我们推荐直接复用项目内置的 Go SDK (`plugins/sdk`)。这个 SDK 已经为你处理好了大部分的底层工作，包括：

*   **配置加载**：自动读取 `.env` 和 `.env.local` 文件，以及运行时的环境变量（如 `MEW_ADMIN_SECRET`, `MEW_URL` 等）。
*   **配置同步**：通过 `POST /api/bots/bootstrap` 接口**轮询**拉取 Bot 配置，并支持热更新。
*   **服务注册**：通过 `POST /api/infra/service-types/register` 自动上报 `serviceType` 的元信息，这使得前端在创建 Bot 时能看到你的服务类型并提供配置模板。
*   **生命周期管理**：为每个 Bot 实例创建独立的运行环境。当配置发生变更时，SDK 会自动停止旧实例并启动新实例。

一个最简的服务入口 `main.go` 如下所示：

```go title="main.go"
package main

import (
	"log"

	"mew/plugins/sdk"
)

func main()
	// 使用 sdk.RunServiceWithSignals 启动服务，它会自动处理信号并优雅退出
	if err := sdk.RunServiceWithSignals(sdk.ServiceOptions{
		LogPrefix: "[my-fetcher]", // 日志前缀，方便调试
		NewRunner: func(botID, botName, accessToken, rawConfig string, cfg sdk.RuntimeConfig) (sdk.Runner, error) {
			// NewRunner 是一个工厂函数，每当有新的 Bot 实例需要运行时，SDK 就会调用它
			return NewMyRunner(botID, botName, accessToken, rawConfig, cfg)
		},
	}); err != nil {
		log.Fatal(err)
	}
}
```

:::info 关于 `serviceType`
SDK 会自动从**入口 `main.go` 所在目录的名称**推导出 `serviceType`。例如，如果你的代码位于 `plugins/fetchers/rss-fetcher`，那么 `serviceType` 就会被设为 `rss-fetcher`。当然，你也可以在 `sdk.ServiceOptions` 中显式传递 `ServiceType` 参数来覆盖这个默认行为。
:::

### 第二步：解析任务配置 (`bot.config`)

Fetcher Bot 的核心配置通常是一个**任务数组**。Mew 后端会将这份配置以 JSON 字符串的形式存储，我们需要在服务启动时将其解析为 Go 的结构体列表。

```go title="config.go"
package main

import (
	"fmt"

	"mew/plugins/sdk"
)

// TaskConfig 定义了单个任务的结构
type TaskConfig struct {
	Interval int    `json:"interval"` // 任务执行间隔（秒）
	Webhook  string `json:"webhook"`  // 消息推送的目标 Webhook URL
	Enabled  *bool  `json:"enabled,omitempty"` // 任务是否启用，指针类型可以区分“未设置”和“false”
}

// parseTasks 解析原始 JSON 配置字符串
func parseTasks(rawConfig string) ([]TaskConfig, error) {
	// 使用泛型函数 DecodeTasks，它可以智能处理多种 JSON 格式
	tasks, err := sdk.DecodeTasks[TaskConfig](rawConfig)
	if err != nil {
		return nil, err
	}

	// 对解析出的任务进行校验和设置默认值
	for i := range tasks {
		if tasks[i].Interval <= 0 {
			tasks[i].Interval = 30 // 默认间隔 30 秒
		}
		if err := sdk.ValidateHTTPURL(tasks[i].Webhook); err != nil {
			return nil, fmt.Errorf("tasks[%d].webhook 无效: %w", i, err)
		}
	}

	return tasks, nil
}
```

:::info `sdk.DecodeTasks[T]` 的妙用
这个辅助函数非常灵活，它能兼容三种常见的 JSON 配置格式：
1.  任务数组：`[{"interval": 60, ...}]`
2.  单个任务对象：`{"interval": 60, ...}`
3.  带 `tasks` 字段的包装对象：`{ "tasks": [...] }`

同时，对于空配置（如 `""`, `"null"`, `"{}"`），它会安全地返回 `nil`，无需额外处理。
:::

### 第三步：实现定时任务与 Webhook 推送

对于“一个 Bot 实例，多个并发任务”的场景，SDK 提供了 `Group` 和 `RunInterval` 这两个工具，可以轻松地实现。

*   `sdk.Group`：管理一组 `goroutine`，并统一通过 `context` 控制它们的生命周期。
*   `sdk.RunInterval`：一个简单的定时器，它会阻塞式地按照指定间隔重复执行一个函数。

```go title="runner.go"
func (r *MyRunner) Run(ctx context.Context) error {
	// 创建一个与 Run 方法的 ctx 关联的 goroutine Group
	g := sdk.NewGroup(ctx)

	// 创建一个带超时的 HTTP 客户端，用于发送 Webhook
	webhookHTTPClient, err := sdk.NewHTTPClient(sdk.HTTPClientOptions{Timeout: 15 * time.Second})
	if err != nil {
		return err
	}

	// 遍历所有任务，为每个启用的任务启动一个独立的 goroutine
	for i, task := range r.tasks {
		if !sdk.IsEnabled(task.Enabled) {
			continue // 跳过被禁用的任务
		}

		taskIndex := i    // 捕获循环变量
		taskCopy := task  // 捕获循环变量

		g.Go(func(ctx context.Context) {
			// RunInterval 会在后台执行定时任务，直到 ctx 被取消
			sdk.RunInterval(ctx, time.Duration(taskCopy.Interval)*time.Second, true, func(ctx context.Context) {
				// 实际的任务逻辑：发送 Webhook
				// PostWebhook 内置了重试机制（默认 3 次）
				_ = sdk.PostWebhook(ctx, webhookHTTPClient, r.apiBase, taskCopy.Webhook, sdk.WebhookPayload{
					Content: fmt.Sprintf("来自 %s 的问候 (任务 %d)", r.botName, taskIndex),
				})
			})
		})
	}

	// 等待 Group 中的所有 goroutine 结束
	<-g.Context().Done()
	g.Wait()
	return nil
}
```

这段代码为每个启用的任务创建了一个独立的 `goroutine`。`RunInterval` 负责定时触发，`PostWebhook` 负责消息的投递。整个过程由 `ctx` 控制，当 Bot 配置变更或服务关闭时，所有任务都能被优雅地中止。

### 接下来？

恭喜！你已经掌握了如何构建一个单向推送消息的 `Fetcher Bot`。

现在，让我们更进一步，学习如何构建一个可以与用户进行双向实时会话的 **[Agent Bot](./agent-bot)**。