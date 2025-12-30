---
sidebar_label: '前端开发指南'
sidebar_position: 60
slug: /guide/client-guide
---

# 🎨 前端开发指南

欢迎来到前端开发的世界！本篇指南将带你快速了解 `client/` 目录下的前端项目，并掌握其核心开发模式。

前端项目是一个基于 **React + Vite** 构建的单页应用 (SPA)。它的主要职责非常明确：

-   通过 **REST API** 拉取应用的初始状态与数据（如服务器列表、频道信息、历史消息等）。
-   通过 **Socket.IO** 建立长连接，实时接收并响应来自服务端的事件（如新消息、成员在线状态变化等）。
-   将不同 `type` 的消息分发给对应的渲染器，实现丰富的消息展示效果。

:::info 技术栈速览
-   **框架**: React 18
-   **构建工具**: Vite
-   **状态管理**: Zustand (客户端 UI 状态) + TanStack Query (服务端数据缓存)
-   **样式**: TailwindCSS
-   **测试**: Vitest + MSW
:::

在开始之前，建议先熟悉项目所依赖的核心接口：

-   [核心 API: REST API](../core-api/rest-api.md)
-   [核心 API: WebSocket API](../core-api/websocket-api.md)

---

## 环境启动与开发流程

在项目根目录下，你可以通过以下命令启动前端开发环境：

1.  **启动前端与后端 (推荐)**
    ```bash
    pnpm dev
    ```
    此命令会同时启动前端开发服务器和后端服务，提供完整的全栈开发体验。

2.  **仅启动前端**
    ```bash
    pnpm --filter client dev
    ```
    适用于你已经有了一个独立运行的后端服务，只想单独调试前端界面的场景。

:::info 关于 API 代理
为了简化开发，前端所有 API 请求都指向同源路径（如 `/api` 和 `/socket.io`）。

在开发环境下，`client/vite.config.ts` 文件中配置了代理规则，会将这些请求自动转发到本地运行的后端服务（默认为 `http://localhost:3000`），无需手动处理跨域问题。
:::

---

## 代码结构导览

项目采用“功能优先 (Feature-First)”的目录组织方式。对于新加入的开发者，以下是几个关键的入口文件，可以帮助你快速定位代码：

-   `client/src/layout/Layout.tsx`：**主布局组件**。这里是应用的顶层结构，也是挂载全局 Socket 事件监听的最佳位置。
-   `client/src/shared/services/*`：**服务层**。封装了 HTTP (axios) 和 Socket.IO 客户端的单例与核心逻辑。
-   `client/src/shared/hooks/*`：**自定义 Hooks**。这里封装了对 TanStack Query 数据获取和 Socket 事件订阅的通用逻辑，是业务组件获取数据的主要方式。
-   `client/src/shared/stores/*`：**状态管理 (Zustand)**。存放纯客户端状态，如 UI 状态、未读消息计数、用户认证信息等。

---

## 核心理念：状态管理

为了保持逻辑清晰并避免状态管理混乱，我们将前端状态严格划分为两类：

| 状态类型 | 职责描述 | 管理工具 |
| :--- | :--- | :--- |
| **服务端状态** | 从后端获取的所有数据，如消息列表、频道详情、服务器成员等。这类状态的“真实来源”在服务器。 | **TanStack Query** |
| **客户端状态** | 应用的 UI 交互状态，与后端数据无直接关联。如当前选中的服务器/频道 ID、弹窗的开关状态、未读消息的集合等。 | **Zustand** |

这种分离策略，使得“服务端数据同步”和“客户端交互响应”各司其职，让状态的来源和变更路径都变得非常明确。

---

## Socket 事件处理模式

所有 Socket.IO 的事件处理都遵循一套推荐模式：**在顶层组件通过自定义 Hooks 进行订阅**。

Socket 客户端单例位于 `client/src/shared/services/socket.ts`。

目前，事件监听已按其作用域拆分到不同的 Hooks 中：

#### `useGlobalSocketEvents`
负责监听全局范围的事件，这些事件不局限于某个特定的服务器或频道。
-   `DM_CHANNEL_CREATE`: 创建了新的私信频道。
-   `MESSAGE_CREATE`: 用于触发全局的未读/提及计数逻辑。

#### `useServerEvents(serverId)`
负责监听当前所在服务器内的事件。
-   `CATEGORY_*`: 分组的创建/更新/删除。
-   `MEMBER_*`: 成员的加入/离开/信息更新。
-   `PERMISSIONS_UPDATE`: 权限变更。

#### `useSocketMessages(channelId)`
负责监听当前所在频道内的消息相关事件。
-   `MESSAGE_CREATE`: 接收新消息。
-   `MESSAGE_UPDATE`: 消息更新与消息撤回。
-   `MESSAGE_REACTION_*`: 消息回应 (Reaction) 的添加与移除。

#### `usePresenceEvents`
负责监听用户在线状态事件。
-   `PRESENCE_INITIAL_STATE`: 获取初始的在线用户列表。
-   `PRESENCE_UPDATE`: 接收在线状态的变更。

:::info 订阅机制
这些 Hooks 都在主布局组件 `Layout.tsx` 中被调用。这样做可以确保用户登录后，应用能持续订阅所有必要的事件，无论用户导航到哪个页面。
:::

---

## 扩展点：自定义消息渲染

消息的核心渲染逻辑位于 `client/src/features/chat-messages/components/MessageContent.tsx`。

该组件会根据消息对象的 `type` 字段，将渲染任务分发给不同的子组件。这为扩展新的消息类型提供了极大的便利。

**目前已支持的自定义卡片类型包括：**
-   `app/x-rss-card`
-   `app/x-pornhub-card`
-   `app/x-twitter-card`
-   `app/x-bilibili-card`
-   `app/x-instagram-card`
-   `app/x-forward-card`
-   `app/x-jpdict-card`

如果你希望新增一种自定义消息卡片，请遵循以下流程：

1.  **定义 `type` 名称**：为你的新卡片类型设计一个唯一的标识符，推荐使用 `app/x-your-card` 格式。
2.  **约定 `payload` 结构**：明确该类型消息所携带的数据结构，并在相关文档和后端逻辑中进行说明。
3.  **实现渲染组件**：在前端创建一个新的 React 组件用于渲染你的卡片，并在 `MessageContent.tsx` 中添加分发逻辑。同时，确保消息的 `content` 字段可以作为纯文本内容进行降级显示，以兼容不支持此类型的客户端。

---

## 测试

前端测试使用 **Vitest** 作为测试运行器。我们还集成了 **MSW (Mock Service Worker)** 来拦截和模拟后端的 API 请求，确保测试环境的稳定与可预测性。

-   所有 Mock 逻辑位于 `client/src/mocks/*` 目录。
-   运行测试：
    ```bash
    pnpm --filter client test
    ```