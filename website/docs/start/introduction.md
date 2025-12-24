---
sidebar_label: '项目概览'
sidebar_position: 10
slug: /guide/introduction
---

# 项目概览

**Mew** 是一款基于即时通讯（IM）作为交互方式的自托管个人数字化中枢。

你可以将其理解为一个 **无头内容管理系统上的聊天界面**，或者可以看作是一个 **完全由你控制的、单用户的 Discord**。

## 💡 背景与动机

在如今的数字化生活中，我们常常面临着极大的上下文切换成本：
*   获取信息时，我们需要在 X、RSS 阅读器、Bilibili 等多个应用之间切换。
*   思考和记录时，我们得去 Notion 或 Obsidian 之类的工具中进行操作。
*   与 AI 交互时，还需要单独打开 ChatGPT 网站。

Mew 的核心假设是：如果能够把“信息流的输入”、“AI 的辅助处理”以及“知识的沉淀”三者统一在一个线性、基于时间轴的对话界面中进行呈现，便可以极大降低认知负担。

Mew 并不试图重新定义笔记软件或社交网络，它的目标是统一接口。

## 🧩 核心设计哲学

### 1. Chat UI as an OS (把聊天界面当作操作系统)
Mew 认为，**对话流（Stream）** 是处理碎片化信息最自然的形态。
*   **输入即消息**：无论是从爬虫抓取的推文，还是你随手记录的灵感，在系统中都被视作一条 `Message`。
*   **交互即指令**：通过使用斜线命令（`/`）或自然语言的方式与系统进行交互，而不是通过点击复杂的菜单。

### 2. Message Warehouse (消息仓库)
Mew 项目的名称来源于 **Me**ssage **W**arehouse。
这代表了系统的核心：一个高可用、可检索的持久化存储层。Mew 中的每一条数据都是你的资产，支持全文检索和向量化索引。

> 同时 Mew 也取自传说中的宝可梦“梦幻”的名字。它拥有所有宝可梦的基因，象征着本项目作为基座的无限可扩展性。

### 3. Unopinionated Core (无预设立场的内核)
Mew 的核心平台设计极为简洁，它不关心消息的具体内容是“推特新闻”还是“服务器警告”，也不包含任何特定的业务逻辑。它的唯一职责是维护 WebSocket 通道和数据存储。所有的业务功能（如爬虫、AI、定时任务等）都由外部插件（Bots）来提供。

---

## 🏗 系统架构：总线与微服务

Mew 拒绝构建一个庞大的单体应用，选择了**事件总线 + 异构微服务**的架构设计。

这种架构确保了系统核心的稳定性，同时也提供了极大的业务灵活性。

```mermaid
graph TD
    %% Styling
    classDef core fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    classDef ext fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef client fill:#f3e5f5,stroke:#4a148c,stroke-width:2px

    subgraph Client ["前端交互层"]
        UI["React Client (Web/PWA)"]:::client
    end

    subgraph Platform ["Mew Core (The Bus)"]
        Gateway["API Gateway (Socket.io / REST)"]:::core
        Server["Server Logic (Node.js)"]:::core
        DB[("MongoDB + S3")]:::core
    end

    subgraph Services ["Bot Microservices"]
        FetcherBot["Fetcher Bot"]:::ext
        AgentBot["Agent Bot"]:::ext
    end

    %% Flow
    FetcherBot -->|Push Data| Gateway
    AgentBot <-->|Agent| Gateway
    UI <-->|Realtime| Gateway
    Gateway --> Server --> DB
````

### 1. Mew Platform (通信基础设施层)

该层是系统的“总线”，一个纯粹的、与业务无关的消息传输和存储平台。

* **核心职责**：
  * **消息路由**：通过 WebSocket 和 REST API 在客户端与 Bot 之间进行消息分发。
  * **持久化**：将所有数据以统一方式存储到 MongoDB 和对象存储中。
  * **鉴权与状态管理**：负责用户会话和连接状态的管理。
* **设计原则**：平台层**不解析**消息内容的语义，它不会知道某条消息是“推特更新”还是“AI 回复”，只负责确保消息安全、实时地传递到目标渠道。这使得平台层的代码保持高度稳定，变动极少。

### 2. Bot Services (业务逻辑层)

这是系统的“微服务集合”。所有的具体业务功能——从数据抓取到智能对话——都由独立运行的 Bot 进程来执行。

* **核心职责**：
  * **I/O 密集型任务（Fetcher Bot）**：作为生产者，Go 服务负责高并发地轮询 X、RSS、Bilibili 等接口，将非结构化数据清洗成 Mew 消息协议后推送至总线。
  * **交互与推理任务（Agent Bot）**：作为消费者与生产者，Go 服务监听总线上的事件（如 `MESSAGE_CREATE`），按需调用 LLM 完成推理/工具调用，并将结果回写到总线。
* **设计原则**：添加一个新的功能（例如“股票监控”或“每日摘要”）只需要部署一个新的 Bot，而不需要停机或修改核心平台。

---

## 🛠 技术栈选型

| 领域                 | 技术栈                            | 选型考量                                       |
| :----------------- | :----------------------------- | :----------------------------------------- |
| **Client**       | React, TypeScript, Zustand | 强调类型安全与组件化，Zustand 提供比 Redux 更加轻量的状态管理方式。  |
| **Server**        | Express, Socket.io         | Node.js 在处理高并发 WebSocket 连接时的事件循环机制具有天然优势。 |
| **Database**       | MongoDB                    | 消息数据天然呈现文档结构（非结构化/半结构化），且对 JSON 格式支持良好。    |
| **Object Storage** | Garage (S3 Compatible)     | 自托管对象存储，用于处理图片、视频等大文件，实现数据与逻辑的分离。          |
| **DevOps**         | Docker Compose             | 确保多服务环境（Node + Go）的启动一致性与版本一致性。 |

---

## 🚀 下一步

Mew 不仅仅是一个工具，更是一个可编程的个人环境。
如果你准备好掌控你的数据流，接下来请继续阅读：

* [快速开始](./getting-started) - 只需 5 分钟，轻松部署你的 Mew 实例。
* [API 参考](../core-api/rest-api) - 学习如何编写你的第一个 Bot。
