---
sidebar_label: 'Fetcher Bot'
---

## 🕷️ 构建 Fetcher Bot

**目标**: 编写一个程序，自动发现系统中所有的 RSS 订阅配置，并为每一个订阅启动一个独立的抓取协程。

### 1. 任务调度器
这是 Bot 的入口。它负责定期向 Mew 询问：“嘿，现在有哪些活要干？”

```go
// main.go
package main

import (
    "log"
    "time"
    "sync"
)

// 使用 Map 记录正在运行的任务，防止重复启动
var runningTasks sync.Map

func main() {
    log.Println("🕷️ RSS Fetcher Bot started...")

    // 每 1 分钟同步一次配置
    ticker := time.NewTicker(1 * time.Minute)

    // 立即执行一次
    syncConfig()

    for range ticker.C {
        syncConfig()
    }
}

func syncConfig() {
    // 1. 调用 Mew 引导接口批量获取本服务类型的 Bot 配置
    // POST /api/bots/bootstrap
    // Header: X-Mew-Admin-Secret: <MEW_ADMIN_SECRET>
    // Body: { "serviceType": "rss-fetcher" }
    bots, _ := apiClient.Bootstrap("rss-fetcher")

    for _, bot := range bots {
        // 如果任务已经在运行，则跳过 (生产环境可能需要更复杂的 Update 逻辑)
        if _, loaded := runningTasks.LoadOrStore(bot.ID, true); loaded {
            continue
        }

        // 2. 启动协程处理任务
        go startRssWorker(bot)
    }
}
```

### 2. 业务处理器
这是真正干活的地方。

```go
// worker.go
import (
    "encoding/json"
    "net/http"
    "bytes"
    "time"
)

type RssConfig struct {
    RSSURL          string `json:"rss_url"`
    IntervalSeconds int    `json:"interval_seconds"`
    Webhook         string `json:"webhook"`
}

func startRssWorker(bot BotData) {
    // 解析配置
    var config RssConfig
    json.Unmarshal(bot.Config, &config)

    log.Printf("🚀 Starting worker for %s", config.RSSURL)

    for {
        // 1. 抓取逻辑
        // feed := parseRss(config.URL)
        // item := feed.Items[0]

        // 2. 构造 Mew 消息 Payload
        // 参考 Mew 消息协议文档
        payload := map[string]interface{}{
            "content": "📰 " + item.Title + "\n" + item.Link,
        }
        jsonBody, _ := json.Marshal(payload)

        // 3. 推送
        http.Post(config.Webhook, "application/json", bytes.NewBuffer(jsonBody))

        // 等待下一次抓取
        time.Sleep(time.Duration(config.IntervalSeconds) * time.Second)
    }
}
```
