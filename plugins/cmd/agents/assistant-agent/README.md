# assistant-agent (Subaru)

一个私人 LLM 助理插件。

## 配置（Bot.config）

```json
{
  "chat_model": {
    "base_url": "https://api.openai.com/v1",
    "api_key": "sk-***",
    "model": "gpt-4o-mini"
  },
  "user": {
    "user_interests": "游戏/摇滚乐/……",
    "timezone": "+08:00"
  },
  "tool": {
    "exa_api_key": "1a3e***",
    "hobbyist_tts_token": "d8d04a***"
  }
}
```

字段说明：
- `chat_model.base_url`：上游 Chat Completions API Base URL（例如 OpenAI 兼容接口）
- `chat_model.api_key`：上游密钥
- `chat_model.model`：模型名
- `user.user_interests`：用于替换 persona 提示词中的 `{{USER_INTERESTS}}`
- `user.timezone`：用于把时间戳呈现给模型（默认 `UTC+8`）
- `tool.exa_api_key`：[Exa](https://exa.ai/) WebSearch API Key（用于网络搜索工具）
- `tool.hobbyist_tts_token`：Hobbyist TTS Token（用于语音合成并发送语音消息）

## Sticker 管理（由 Bot 创建者配置）

在前端用户设置的 Stickers 页面中：
- `Manage For` 选择对应的 Bot
- 上传/编辑 Sticker（这些 Sticker 只会被该 Bot 使用）

## 运行

```bash
go run ./plugins/cmd/agents/assistant-agent.go
```
