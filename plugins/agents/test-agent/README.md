# test-agent

一个最小可用的 **Agent Bot** 示例插件（Go），用于演示：

- 使用 **Bot 的 `accessToken`** 换取 **JWT**（`POST /api/auth/bot`）完成身份认证
- 通过 **Socket.IO Gateway** 接收实时消息事件（`MESSAGE_CREATE`）
- 通过 **Socket.IO 上行事件**发送消息（`message/create`），实现与普通用户一致的“发消息”能力

本插件实现了一个指令：`echo`。

## 行为

- **频道（Guild Text）**：用户 `@bot` 并以 `echo` 开头，例如：
  - `@botname echo hello world`
  - Bot 会在同一频道回复：`hello world`
- **私聊（DM）**：无需 `@`，用户发送：
  - `echo hello`
  - Bot 回复：`hello`

说明：

- 前端输入的 `@botname` 最终会被序列化为消息内容中的 `<@botUserId>`（服务端也用该格式做 mention 解析）。
- `echo` 后必须跟随非空文本（`echo` / `echo   ` 不会触发）。

## 配置（Bot.config）

`test-agent` **不需要任务配置**，`config` 可以是任意值（不会解析/校验）。

## 运行

```bash
go run ./cmd/test-agent
```

## 在 Mew 中创建/使用

1. 在前端创建一个 Bot，选择 `serviceType = test-agent`
2. 将该 Bot 邀请进服务器（频道内 @mention 才能触发频道 echo）
3. 频道内发送：`@botname echo ...`，或在 DM 里发送：`echo ...`

## 工作原理

1. Bot Service 使用 `MEW_ADMIN_SECRET` 调用 `POST /api/bots/bootstrap` 拉取本 `serviceType` 下的 bot 实例（包含 `accessToken`）
2. `test-agent` 对每个 bot：
   - 调用 `POST /api/auth/bot` 用 `accessToken` 换取 JWT
   - 用 JWT 连接 Socket.IO，并监听 `MESSAGE_CREATE`
   - 匹配 `echo` 指令后，通过 `message/create` 上行事件发消息
