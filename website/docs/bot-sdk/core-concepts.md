---
sidebar_label: '核心概念'
---

# 🧠 核心概念

在开始开发 Bot 之前，理解 Mew 的核心概念至关重要。这有助于建立正确的心智模型，让开发过程更加顺畅。

Mew 中的 Bot 主要分为两种类型，它们的设计目标和工作模式截然不同。

### Bot 类型对比

| 对比项 | 🕷️ Fetcher Bot | 💬 Agent Bot |
| :--- | :--- | :--- |
| **工作模式** | 数据拉取与投递 (PULL & PUSH) | 实时交互与响应 (REQUEST & RESPONSE) |
| **通信模式** | **单向**: 外部源 -> Bot -> Webhook | **双向**: Bot \<-> WebSocket \<-> User |
| **触发机制** | 定时器 (Cron / Ticker) | 事件 (Event) |
| **典型场景** | RSS/Atom 订阅、定时抓取新闻并投递 | 指令机器人、词典/翻译、对话式助手 |
| **参考实现** | **Go** (`plugins/internal/fetchers/*`) | **Go** (`plugins/internal/agents/*`) |

---

### 关键术语解析

为了避免混淆，以下是对 Mew 系统中几个核心术语的详细解释。

#### Bot (数据库实体)

这是指用户在管理界面上创建的 **Bot 实例配置**。它作为一条记录存储在数据库中（`server/src/api/bot/bot.model.ts`），包含了 `serviceType`、`config`（具体任务配置）以及 `dmEnabled`（是否允许私聊）等核心信息。

#### Bot User

这是一个特殊的用户账户 (`isBot: true`)，用于 **代表 Bot 在系统内收发消息和事件**。每个 Bot 实例都关联一个 Bot User。通过 Bot 的 `accessToken` 调用 `POST /api/auth/bot` 接口，可以换取该 Bot User 的 JWT，从而获得在系统内操作的权限。

#### Bot Service

这是您在服务器上 **独立运行的 Go 程序**，例如一个 `rss-fetcher` 服务。一个 Bot Service 通常会处理某一特定类型的所有 Bot 实例，其主要职责包括：
-   **引导启动**：在启动时，通过 `POST /api/bots/bootstrap` 接口拉取该 `serviceType` 下所有 Bot 实例的配置及 `accessToken`。
-   **任务管理**：为每个 Bot 实例启动一个独立的运行器 (Runner)，并根据配置变化进行热重载。`plugins/pkg` 中的 `BotManager` 提供了此功能的封装。

:::info 安全提示
`bootstrap` 接口是受保护的，需要通过环境变量 `MEW_ADMIN_SECRET` 和 `MEW_INFRA_ALLOWED_IPS` 进行访问控制，确保只有您的 Bot Service 能够调用。
:::

#### serviceType

这是一个关键的 **字符串标识符**，它的作用是 **将用户创建的 Bot（实例配置）与您运行的 Bot Service（Go 进程）绑定在一起**。您在界面上为 Bot 配置的 `serviceType`，必须与 Bot Service 程序中定义的类型完全一致，系统才能正确地将配置下发给对应的服务。

#### Webhook

这是一个专为 Fetcher Bot 设计的、**无需用户身份验证的匿名消息接收地址**。当 Fetcher Bot 从外部源获取到新内容后，便向此地址投递消息。其认证方式是通过 URL 中的 `webhookId` 和 `token` (`POST /api/webhooks/:webhookId/:token`)，确保只有合法的 Bot 能够投递。

---

### 配置驱动开发

Mew 遵循“配置即状态，代码无状态” (Config is State, Code is Stateless) 的设计哲学。

> 您的 Bot Service 代码本身不应硬编码任何具体的任务（如某个固定的 RSS 地址）。它应该是一个通用的执行引擎，在启动时从 Mew 平台拉取所有相关配置，并动态地创建和管理任务。

#### 配置示例 (rss-fetcher)

在 Mew 中，Bot 的 `config` 字段以字符串形式存储在数据库，但其内容通常是一段结构化的 **JSON 文本**。对于 Fetcher Bot 来说，常常使用一个 JSON 数组来定义多个抓取任务。您的 Bot Service 在拉取配置后，只需将此 JSON 字符串解码为对应的 Go 结构体数组即可。

```json title="一个典型的 rss-fetcher Bot 配置"
[
  {
    "rss_url": "https://news.ycombinator.com/rss",
    "interval": 300,
    "webhook": "http://<mew-host>/api/webhooks/<webhookId>/<token>"
  },
  {
    "rss_url": "https://coolshell.cn/feed",
    "interval": 3600,
    "webhook": "http://<mew-host>/api/webhooks/<webhookId>/<token>"
  }
]
```

:::caution 网络可达性
请确保 Bot Service 能够访问 `webhook` URL 中的主机。
-   如果 Bot Service 和 Mew 主服务都在同一个 Docker Compose 网络中，应使用内部服务名，例如 `http://server:3000/...`。
-   如果 Bot Service 部署在外部，则必须使用 Mew 服务的公网域名。
:::
