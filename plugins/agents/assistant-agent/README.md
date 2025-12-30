# assistant-agent (Subaru)

一个面向 DM 的私人 LLM 助理插件（Go）。

## 配置（Bot.config）

```json
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-***",
  "model": "gpt-4o-mini",
  "timezone": "+08:00"
}
```

## 运行

```bash
go run ./cmd/assistant-agent
```

