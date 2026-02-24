# claudecode-agent

一个通过 **Claude Code CLI** 提供对话能力的 Agent Bot（Go）。

与 `assistant-agent` 不同，`claudecode-agent` 不直接调用大模型 API，而是调用 `claude-code` 容器里的 Python 代理服务（`server.py`），再由代理执行 `claude` 命令。

## 行为

- 频道内需 `@bot` 触发；DM 中无需 `@`。
- 支持 `/clear` 指令：清空当前频道会话状态，并返回一条固定文案池中的随机回复。
- 会话模式：
  - `/clear` 后第一条请求使用 `-p`
  - 后续请求使用 `-c -p`
- 支持附件输入：
  - Agent 会将附件上传到代理服务的会话目录
  - 然后在提示词末尾追加文件引用行：`[文件名](绝对路径)`
- 支持文件回传：
  - 当 Claude 回复中包含文件引用行时，Agent 会从代理下载文件并作为附件发送到频道。

## 配置（Bot.config）

默认可使用空配置：

```json
{}
```

可选字段（高级用法）：

```json
{
  "proxy_base_url": "http://claude-code:3457",
  "timeout_seconds": 600
}
```

说明：

- `proxy_base_url`：Claude Code 代理服务地址
- `timeout_seconds`：单次代理请求超时（秒）

环境变量优先兜底：

- `CLAUDECODE_URL`：未提供 `proxy_base_url` 时使用，默认值为 `http://claude-code:3457`

## 运行

```bash
go run ./plugins/cmd/agents/claudecode-agent
```
