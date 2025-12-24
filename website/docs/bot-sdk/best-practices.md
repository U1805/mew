---
sidebar_label: '最佳实践'
---

## 🏆 最佳实践

在开发生产级 Bot 时，请牢记以下原则：

1.  **Don’t Block the Loop**: 对于 Agent Bot，不要在读取网关事件的循环里做耗时工作（例如调用 LLM）。把重任务交给 goroutine/worker，并为外部调用设置超时与取消（`context`）。
2.  **Idempotency**: Fetcher Bot 可能会重启。确保你的逻辑能处理重复抓取的情况（例如记录上一次抓取文章的 GUID）。
3.  **Graceful Shutdown**: 你的容器可能会被随时销毁。监听 `SIGTERM` 信号，在退出前保存状态或发送“我下线了”的告别语。
4.  **Error Handling**: 网络总是不可靠的。为你的 HTTP 请求添加重试机制（Retry Logic）。
