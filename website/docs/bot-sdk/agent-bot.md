---
sidebar_label: 'Agent Bot'
---

## 💬 构建 Agent Bot

**目标**：实现一个最小可用的会话型 Bot：保持长连接接收 `MESSAGE_CREATE`，在频道被 `@` 或私聊收到指令时，回一条消息。

> **参考实现**：`plugins/agents/test-agent`（实现了 `echo` 指令）。

---

## 1. Agent Bot 的工作方式（基于项目实现）

以 `plugins/agents/test-agent` 为例，一个 Agent Bot 通常会做这些事：

1. **拉取配置**：Bot Service 通过 `POST /api/bots/bootstrap` 拉取本 `serviceType` 下的 bot 实例（SDK 已封装）。
2. **Bot 登录**：对每个 bot，用 `accessToken` 调用 `POST /api/auth/bot` 换取 JWT。
3. **连接网关**：用 JWT 连接 Socket.IO Gateway（WebSocket），监听实时事件（例如 `MESSAGE_CREATE`）。
4. **处理消息并回复**：命中指令/触发条件后，通过 Socket.IO 上行事件 `message/create` 发送消息。

---

## 2. 快速运行示例（test-agent）

### 2.1 启动 Agent Bot

```bash
cd plugins/agents/test-agent
go run .
```

### 2.2 在 Mew 前端注册并使用

1. 在前端创建一个 Bot，选择 `serviceType = test-agent`
2. 将该 Bot 邀请进服务器（频道内 `@mention` 才能触发频道 echo）
3. 在频道内发送：`@botname echo hello world`，或在私聊里发送：`echo hello`

---

## 3. 触发规则（test-agent）

- **频道（Guild Text）**：用户 `@bot` 并以 `echo` 开头，Bot 会在同一频道回复 `echo` 后面的文本。
- **私聊（DM）**：无需 `@`，用户发送 `echo ...`，Bot 回复 `...`。

补充：前端输入的 `@botname` 最终会被序列化为消息内容中的 `<@botUserId>`（服务端也用该格式做 mention 解析）。
