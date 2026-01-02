# assistant-agent (Subaru)

一个私人 LLM 助理插件。

## 配置（Bot.config）

```json
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-***",
  "model": "gpt-4o-mini",
  "timezone": "+08:00"
}
```

字段说明：
- `base_url`：上游 Chat Completions API Base URL（例如 OpenAI 兼容接口）
- `api_key`：上游密钥
- `model`：模型名
- `timezone`：用于把时间戳呈现给模型（默认 `UTC+8`）

## Sticker 管理（由 Bot 创建者配置）

在前端用户设置的 Stickers 页面中：
- `Manage For` 选择对应的 Bot
- 上传/编辑 Sticker（这些 Sticker 只会被该 Bot 使用）

## 运行

```bash
go run ./cmd/assistant-agent
```
