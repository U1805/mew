---
sidebar_label: '前端开发指南'
sidebar_position: 60
slug: /guide/client-guide
---

# 🎨 前端开发指南

前端位于 `client/`，是一个基于 **React + Vite** 的 SPA，主要负责：

- 通过 **REST API** 拉取状态（服务器/频道/消息等）
- 通过 **Socket.IO** 接收实时事件（新消息、频道更新、权限变化等）
- 将消息按 `type` 进行“多态渲染”（默认文本 + 可扩展类型）

接口细节请参考：

- [`core-api/rest-api`](../core-api/rest-api.md)
- [`core-api/websocket-api`](../core-api/websocket-api.md)

---

## 🚀 启动与配置

从仓库根目录：

- 全栈开发：`pnpm dev`
- 仅前端：`pnpm --filter client dev`

前端 API 基址由 `VITE_API_BASE_URL` 控制：

- 默认：`http://localhost:3000/api`

WebSocket 网关目前在代码中固定为 `http://localhost:3000`。

补充：

- Docker Compose 部署下，`client` 容器会通过 Nginx 反代 `/api` 与 `/socket.io`，并在构建时将 `VITE_API_BASE_URL` 设置为 `/api`。
- 但当前前端 WebSocket 仍直连 `http://localhost:3000`，因此 Nginx 的 `/socket.io` 反代不会被使用；如需同源 WebSocket，请按需调整 `client/src/shared/services/socket.ts`。

---

## 🧱 代码结构（以职责划分）

前端采用“Feature-First”组织方式，常用入口：

- `client/src/layout/Layout.tsx`：主布局与全局事件挂载
- `client/src/shared/services/*`：HTTP API 与 Socket 客户端
- `client/src/shared/hooks/*`：对 Query 缓存与 Socket 事件的封装
- `client/src/shared/stores/*`：Zustand 状态（UI/未读/鉴权等）

---

## 🧠 状态管理约定

前端将状态分为两类：

- **服务端状态**：来自后端的列表/详情（消息、频道、成员等）→ TanStack Query 管理缓存与失效。
- **客户端状态**：UI 交互与导航状态（当前服务器/频道、弹窗、未读集合等）→ Zustand 管理。

这种拆分能让“数据一致性”和“UI 交互”各自有明确归属，避免 store 过度膨胀。

---

## 🔌 Socket 事件接入（推荐模式）

Socket 单例：`client/src/shared/services/socket.ts`。

目前事件监听按“作用域”拆分为 hooks：

- `useGlobalSocketEvents`：全局事件，例如 `DM_CHANNEL_CREATE`、以及用于触发未读/提及逻辑的全局 `MESSAGE_CREATE`。
- `useSocketMessages(channelId)`：当前频道内的消息流，处理 `MESSAGE_CREATE`、`MESSAGE_UPDATE`、`MESSAGE_DELETE` 和 `MESSAGE_REACTION_*` 事件。
- `usePresenceEvents`：在线状态，处理 `PRESENCE_INITIAL_STATE` 和 `PRESENCE_UPDATE`。
- `useServerEvents(serverId)`：当前服务器内的事件，处理 `CATEGORY_*`、`MEMBER_*` 和 `PERMISSIONS_UPDATE`。

这些 hooks 会在 `Layout.tsx` 顶层被调用，保证登录后持续订阅。

---

## 🧩 消息渲染扩展点

后端的消息包含 `type/content/payload/attachments` 等字段）。

前端可以在消息渲染组件中基于 `type` 分发到自定义渲染器；当前实现示例位于：

- `client/src/features/chat/messages/MessageContent.tsx`

***目前已支持的自定义卡片类型包括：***
- `app/x-rss-card`
- `app/x-pornhub-card`
- `app/x-twitter-card`
- `app/x-bilibili-card`
- `app/x-instagram-card`

如果你要新增一种消息类型，推荐流程：

1. 明确 `type` 命名（例如 `app/x-your-card`）
2. 约定 `payload` 结构（写在对应 Bot/服务端逻辑与文档中）
3. 在前端注册/分发到对应渲染组件，并确保 `content` 仍可作为纯文本降级

---

## 🧪 测试与 Mock

前端使用 Vitest；MSW 位于 `client/src/mocks/*`，用于在测试环境模拟后端接口。
