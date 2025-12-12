---
sidebar_label: '概览'
---

# 🔌 核心 API

Mew 提供了一套双模态的 API 体系，旨在满足不同的交互需求：

1.  **REST API**: 基于 HTTP 的同步操作（CRUD），用于获取数据或执行指令。
2.  **WebSocket API**: 基于 Socket.io 的异步通信，用于接收服务器端的实时推送。

> **🔗 REST Base URL**: `http://localhost:3000/api` (开发环境)
>
> **🔗 WebSocket URL**: `http://localhost:3000`（不带 `/api`）

---

## 📖 文档导航

*   [**REST API 参考**](/docs/core-api/rest-api): 查看所有 HTTP 端点的详细用法。
*   [**WebSocket API**](/docs/core-api/websocket-api): 了解实时事件的订阅与处理。
*   [**数据模型**](/docs/core-api/data-structures): 探索核心对象（如 User, Server, Message）的结构。

---

## 🔐 认证 (Authentication)

Mew 使用 **Bearer Token** 机制。除了少部分公开接口（如登录、注册、Webhook 执行），所有请求都必须在 HTTP Header 中携带有效的 JWT。

**Header 格式**:
```http
Authorization: Bearer <your_jwt_token_here>
```

### Token 类型
*   **User Token**: 通过 `/api/auth/login` 获取，具有可配置的过期时间。
*   **Webhook Token**: 永久有效，嵌入在 Webhook URL 中（仅用于发消息）。

---

## 🚦 错误处理 (Error Handling)

我们遵循标准的 HTTP 语义。若请求失败，API 将返回 JSON 格式的错误详情；对 Zod 校验失败或 Mongo CastError 等输入问题，会返回 `400` 并附带 `error` 字段。

**错误响应示例**:
```json
{
  "message": "You do not have permission to perform this action."
}
```

| 状态码 | 含义 | 常见原因 |
| :--- | :--- | :--- |
| `400` | Bad Request | 参数缺失、格式错误、Zod 校验失败。 |
| `401` | Unauthorized | 未提供 Token，或 Token 无效/过期。 |
| `403` | Forbidden | 权限不足（如：普通成员想删除频道），或违反了层级规则。 |
| `404` | Not Found | 请求的资源（服务器、频道、用户等）不存在。 |
| `409` | Conflict | 资源冲突（如：注册时邮箱或用户名已被占用）。 |
| `500` | Internal Server Error | 服务器内部发生未知错误。 |
