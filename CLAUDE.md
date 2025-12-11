# CLAUDE.md

你现在扮演 [一个严格的角色]。请使用 [客观] 的语气，用 [中文] 分析以下 [内容]。在你的回答中，请避免任何主观赞美的词语。

My terminal environment is powershell in windows.
Remember: Our development should follow the spirit of Linus.
Use `npx kill-port` to clean up the port before running the project.

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

# Project Mew

Mew 是一个以即时通讯（IM）平台为中心的高度可扩展个人数字中心。它遵循“私有 Discord”的隐喻，将核心 IM 平台（前端/后端）与业务逻辑（Bots）分离。

## 构建与开发命令

**根工作区**
- `pnpm install` - 安装所有包的依赖。
- `pnpm dev` - 并发启动前端和后端（通过 `concurrently`）。
- `pnpm test` - 运行所有包的测试。

**后端 (`/backend`)**
- `pnpm dev` - 启动开发服务器（使用 `ts-node`）。
- `pnpm test` - 运行 Vitest 测试套件。

**前端 (`/frontend`)**
- `pnpm dev` - 启动 Vite 开发服务器。
- `pnpm build` - 构建生产版本。
- `pnpm lint` - 运行 ESLint。
- `pnpm test` - 使用 React Testing Library 运行 Vitest。

**文档 (`/website`)**
- `pnpm start` - 启动 Docusaurus 服务器。
- `pnpm build` - 构建生产版本。

## 架构与结构

**Monorepo (`pnpm`)**
- `backend/`: Express + Socket.io + Mongoose (MongoDB)。
- `frontend/`: React + Vite + Tailwind CSS。
- `bots/`: （计划中）用于业务逻辑的独立微服务。
- `website/`: Docusaurus 文档站。

**后端模式**
- **模块化特性结构**：`src/api/{feature}/` 包含 Controller、Service、Model、Routes 和 Validation (Zod)。
- **数据流**：Route -> Middleware (`auth`, `validate`, `checkPermission`) -> Controller -> Service -> Mongoose Model。
- **权限系统**：基于角色的访问控制（RBAC）与通道权限覆盖（Overrides）相结合。核心逻辑位于 `utils/permission.service.ts` 和 `middleware/checkPermission.ts`。通过 `utils/hierarchy.utils.ts` 实现层级检查。
- **错误处理**：自定义 Error 类（`NotFoundError`, `ForbiddenError`等）在 `utils/errors.ts` 中定义，由全局 `errorHandler` 捕获。
- **异步处理**：使用 `asyncHandler` 高阶函数包装 Controller，以简化异步错误处理。
- **验证**：`middleware/validate.ts` 使用 Zod schema（定义于 `*.validation.ts`）对请求的 `body`, `query`, `params` 进行验证。
- **实时通信**：Service 层通过 `gateway/events.ts` 中定义的 `socketManager` 单例广播 `socket.io` 事件（如 `MESSAGE_CREATE`, `CHANNEL_UPDATE`）。

**前端模式**
- **目录结构**：采用基于特性的结构（Feature-based），主要代码位于 `src/features/{auth,channels,chat,servers,users,search}`。
- **状态管理**：
  - **Zustand**：用于客户端全局状态（用户会话、UI 状态如当前频道/服务器、模态框状态、在线状态、未读消息等）。Store 定义在 `src/shared/stores/` 中。
  - **TanStack Query (React Query)**：用于服务器状态管理，负责数据获取、缓存、重新验证和乐观更新。
- **路由/导航**：不使用 `react-router-dom`。采用基于 Zustand 中 `UIState` 的状态驱动导航，视图切换依赖于全局 store 中的 `currentServerId` 和 `currentChannelId`。
- **Socket 集成**：
  - 通过自定义 Hooks (`useGlobalSocketEvents`, `useServerEvents`, `useSocketMessages`, `usePresenceEvents`) 将 Socket 事件与状态管理和数据缓存解耦。
  - `getSocket` 服务确保在用户认证后创建唯一的 Socket 连接实例。
- **样式**：Tailwind CSS，并在 `index.html` 中通过 `<script>` 标签内联了 `tailwind.config`。
- **文件上传**：支持文件上传预览，并在 `MessageInput` 组件中显示上传进度。通过 `uploadApi` 将文件上传至 S3 兼容存储，然后将返回的 `key` 随消息一起发送。

## 编码标准

**通用**
- **语言**：TypeScript (Strict mode)。
- **包管理器**：`pnpm`。

**后端指南**
- **导入**：使用相对导入（例如 `../../utils/db`）。
- **控制器**：函数式风格。仅作为路由和 Service 层的粘合剂，不包含业务逻辑。
- **服务**：处理业务逻辑、数据库操作、权限检查（部分逻辑委托给 `checkPermission` 中间件）和 Socket 事件广播。
- **模型**：Mongoose schema 配合 TypeScript 接口（`IUser extends Document`）。
- **事件**：在数据发生变更（创建/更新/删除）后，必须从 Service 层广播 Socket 事件，以通知客户端。
- **路由**：广泛使用 `express.Router({ mergeParams: true })` 来创建嵌套路由（例如 `servers/:serverId/channels`）。

**前端指南**
- **组件**：函数式组件与 Hooks。
- **结构**：
  - `features/`：包含特定业务域的组件、模态框和相关逻辑。
  - `shared/`：包含跨特性的 Hooks、Stores、类型定义、API 服务和工具函数。
  - `layout/`：包含主应用布局和模态框管理器。
- **乐观更新**：在发送消息时，先在 `TanStack Query` 缓存中插入一个临时消息以实现即时 UI 反馈，API 成功后再用真实数据替换。
- **Mocking**：在测试中使用 MSW (Mock Service Worker) 进行网络层拦截 (`src/mocks/handlers.ts`)。

## 测试策略

- **运行器**：Vitest（前端和后端均使用）。
- **后端测试**：
  - 使用 `supertest` 进行 API 端点集成测试。
  - 使用 `mongodb-memory-server` 提供内存中的 MongoDB 实例，确保测试环境隔离。
  - 在 `src/test/setup.ts` 中配置全局的数据库连接与清理逻辑。
- **前端测试**：
  - 使用 `@testing-library/react` 进行组件交互测试。
  - 使用 `msw` 模拟 API 请求 (`src/mocks/handlers.ts`)。
  - 测试环境为 `happy-dom`。

## 关键设计决策 (Vision)

1.  **"Hub" (中心)**：核心平台仅处理消息传输、存储、权限和状态同步。它不关心消息的具体内容类型（例如，普通文本、RSS 卡片等）。
2.  **Bot 生态系统**：业务逻辑通过独立的 Bot 实现。Bot 通过 Webhook（推送消息）或 WebSocket（交互式，计划中）与核心平台交互。
3.  **消息 Schema**：消息通过 `type` 字段区分不同应用类型，`payload` 字段携带非文本的结构化数据。
    ```json
    {
      "type": "app/x-rss-card", // 自定义消息类型
      "content": "Fallback text for clients that don't support this type",
      "payload": { ...JSON data for UI component... }
    }
    ```
4.  **权限优先**：后端在执行任何敏感操作前，几乎所有相关路由都强制通过 `checkPermission` 中间件，该中间件会使用 `permission.service.ts` 计算出的有效权限集（Effective Permissions）进行验证。

## 测试账户

- **Username**: claude_test_user
- **Email**: claude_test_user@anthropic.com
- **Password**: password123