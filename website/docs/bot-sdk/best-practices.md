---
sidebar_label: '最佳实践'
---

## 🏆 最佳实践

在开发生产级 Bot 时，请牢记以下原则：

1.  **Thinking in Async**: 尤其是 Python Bot，当你调用 OpenAI 等外部 API 时，务必使用异步调用，否则会阻塞整个 WebSocket 心跳，导致掉线。
2.  **Idempotency**: Fetcher Bot 可能会重启。确保你的逻辑能处理重复抓取的情况（例如记录上一次抓取文章的 GUID）。
3.  **Graceful Shutdown**: 你的容器可能会被随时销毁。监听 `SIGTERM` 信号，在退出前保存状态或发送“我下线了”的告别语。
4.  **Error Handling**: 网络总是不可靠的。为你的 HTTP 请求添加重试机制（Retry Logic）。
