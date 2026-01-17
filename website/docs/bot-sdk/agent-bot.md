---
sidebar_label: 'Agent Bot'
---

# 💬 构建 Agent Bot

`Agent Bot` 是一种能够保持长连接、实时响应事件的机器人。这使得它非常适合用于构建会话型应用、自动化任务处理、消息转发等场景。

本篇文档将引导你构建一个最小可用的会话型 Bot。它的核心任务是：**监听消息事件，在频道内被 `@` 或在私聊中收到特定指令时，自动进行回复。**

:::info 参考实现
本文所有内容均可参考官方示例 `plugins/internal/agents/test-agent`，该示例完整实现了一个 `echo` 指令机器人。
:::

## 工作原理

在深入编码之前，我们先来了解一个 `Agent Bot` 的核心工作流程。以 `test-agent` 为例，其完整的生命周期包括以下几个步骤：

1.  **拉取实例配置**
    Bot Service 启动后，会通过 `POST /api/bots/bootstrap` 接口，拉取所有类型为 `test-agent` 的 Bot 实例配置。（该步骤已在 SDK 中封装）

2.  **获取授权**
    对每一个 Bot 实例，使用其 `accessToken` 调用 `POST /api/auth/bot` 接口，换取用于后续通信的 `JWT`。

3.  **连接网关**
    使用获取到的 `JWT`，通过 WebSocket 连接到 `Socket.IO Gateway`，并开始监听服务端的实时事件，例如 `MESSAGE_CREATE`。

4.  **处理并响应消息**
    当接收到的消息满足预设条件时（例如被 `@` 或包含特定指令），通过 `Socket.IO` 向上行通道发送 `message/create` 事件，从而实现消息的发送与回复。

## 快速上手：运行一个 Echo Bot

接下来，让我们通过运行官方示例 `test-agent` 来快速体验 Agent Bot 的完整流程。

### 1. 启动 Agent Bot 服务

首先，在你的本地环境中启动 `test-agent` 服务：

```bash
go run ./plugins/cmd/agents/test-agent
```

### 2. 在前端注册并使用 Bot

服务启动后，我们需要在前端界面中创建一个 Bot 实例并与之交互。

1.  **创建 Bot**
    在前端设置中创建一个 Bot，并确保 **`serviceType`** 字段填写为 `test-agent`。

    :::caution 支持私聊
    如果你希望 Bot 能够响应私聊消息，请务必在创建时勾选 **`dmEnabled`** 选项。否则，用户尝试与该 Bot 创建私聊时，请求会被后端拒绝。
    :::

2.  **邀请 Bot 到服务器**
    将你创建的 Bot 邀请到任意一个服务器的频道中。这是响应频道内 `@` 消息的前提。

3.  **发送指令**
    现在，你可以通过以下方式与 Bot 交互：
    - **频道内**: 发送 `@YourBotName echo hello world`
    - **私聊中**: 直接发送 `echo hello world`

如果一切正常，Bot 将会回复 `hello world`。

## 消息处理与触发机制

`test-agent` 示例的触发规则非常简单，是很好的学习范本：

-   **频道内 (Guild Text Channel)**
    用户必须先 `@` 机器人，且消息内容以 `echo` 作为前缀。Bot 会在同一个频道内回复 `echo` 之后的所有文本内容。

-   **私聊 (DM)**
    无需 `@`，用户直接发送以 `echo` 为前缀的消息即可触发。Bot 会在私聊会话中回复后续文本。

:::info 关于 Mention 的序列化
在前端输入 `@YourBotName` 后，客户端会将其序列化为 `<@botUserId>` 的格式并包含在消息体中。服务端通过解析这种 `<@id>` 格式来识别 mention（提及）操作。
:::
