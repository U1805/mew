# jpdict-agent

一个基于大模型的 **日语词典/翻译解析 Agent Bot**（Go）。

## 使用

- 频道内需 `@bot` 触发；DM 中无需 `@`。
- 任意输入会作为“查询/翻译/解析”请求发送给大模型；支持图片附件（会将图片下载后以 base64 放入 messages）。
- 回复为 `app/x-jpdict-card` 词典卡片：内容支持 Markdown + HTML（例如 `<ruby>` 注音）。

## 配置（Bot.config）

```json
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-***",
  "model": "gpt-4o-mini"
}
```

说明：

- `base_url`：OpenAI-compatible API base（最终请求 `POST {base_url}/chat/completions`）
- `model`：默认假设为多模态模型，可接受图片

## 运行

```bash
go run ./cmd/jpdict-agent
```
