---
sidebar_label: '核心概念'
---

## 🧠 核心概念

在编写代码之前，我们需要先建立正确的心智模型。Mew 中的 Bot 分为两个阵营：

### Bot 类型对比

| 特性 | 🕷️ Fetcher Bot | 💬 Interactive Bot |
| :--- | :--- | :--- |
| **角色比喻** | 勤劳的搬运工 | 聪明的接线员 |
| **通信模式** | **单向**: 外部源 -> Bot -> Webhook | **双向**: Bot \<-> WebSocket \<-> User |
| **触发机制** | 定时器 (Cron / Ticker) | 事件 (Event) |
| **典型场景** | RSS 订阅, Twitter 监控, 股价提醒 | AI 聊天, 游戏机器人, 运维指令 |
| **推荐语言** | **Golang** (高并发, 适合 I/O 密集) | **Python** (AI 生态丰富, 适合逻辑密集) |

### 配置驱动开发

Mew 奉行 **"Code is Stateless, Config is State"** 的原则。
你的 Bot 代码不应包含任何硬编码的任务列表。它应该在启动时从 Mew 平台拉取配置。

**配置示例 (JSON)**:
```json
{
  "type": "rss",
  "config": {
    "url": "https://news.ycombinator.com/rss",
    "interval": 300,
    "webhook": "http://mew-api/webhooks/xyz"
  }
}
```
