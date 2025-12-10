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
- `pnpm dev` - 启动开发服务器（使用 ts-node 和 nodemon）。
- `pnpm test` - 运行 Vitest 测试套件。
- `pnpm build` - 编译 TypeScript 到 `/dist`。

**前端 (`/frontend`)**
- `pnpm dev` - 启动 Vite 开发服务器。
- `pnpm build` - 构建生产版本。
- `pnpm lint` - 运行 ESLint。
- `pnpm test` - 使用 React Testing Library 运行 Vitest。

**文档 (`/website`)**
- `pnpm start` - 启动 docusaurus 服务器
- `pnpm build` - 构建生产版本。

## 架构与结构

**Monorepo (`pnpm`)**
- `backend/`: Express + Socket.io + MongoDB。
- `frontend/`: React + Vite + Tailwind CSS。
- `website/`: Docusaurus。
- `bots/`: （计划中）用于业务逻辑的独立微服务。

**后端模式**
- **模块化特性结构**：`src/api/{feature}/` 包含 Controller、Service、Model、Routes 和 Validation。
- **数据流**：Route -> Middleware (Auth/Validation) -> Controller -> Service -> Mongoose Model。
- **权限系统**：基于角色的访问控制（RBAC）与通道覆盖（Overrides）相结合。核心逻辑位于 `utils/permission.service.ts` 和 `utils/hierarchy.utils.ts`。
- **错误处理**：自定义 Error 类（`NotFoundError`, `ForbiddenError`）在 `utils/errors.ts` 中定义，由全局 `errorHandler` 捕获。
- **异步处理**：使用 `asyncHandler` 包装器避免在控制器中使用 try-catch 块。
- **验证**：`middleware/validate.ts` 处理位于 `*.validation.ts` 中的 Zod schema。
- **实时通信**：Service 层通过 `gateway/events.ts` 广播 `socket.io` 事件（如 `MESSAGE_CREATE`, `channel_UPDATE`）。

**前端模式**
- **目录结构**：采用基于特性的结构（Feature-based），主要代码位于 `src/features/{auth,channels,chat,messages,servers,users,search}`。
- **状态管理**：
  - `Zustand`：用于客户端全局状态（用户会话、UI 状态、未读消息计数、在线状态）。
  - `TanStack Query`：用于服务器状态（缓存、乐观更新、数据获取）。
- **路由/导航**：不使用 React Router。采用基于状态的导航，视图切换依赖于全局 store 中的 `currentServerId` 和 `currentChannelId`。
- **Socket 集成**：
  - 全局事件（如 DM 创建、类别更新）由 `useGlobalSocketEvents` 处理。
  - 上下文相关事件（如当前频道的某些消息更新）由 `useSocketMessages` 等特定的 Hook 处理。
- **样式**：Tailwind CSS。

## 编码标准

**通用**
- **语言**：TypeScript (Strict mode)。
- **包管理器**：`pnpm`。

**后端指南**
- **导入**：使用相对导入（例如 `../../utils/db`）。
- **控制器**：函数式风格。禁止包含业务逻辑；必须委托给 Service 层。
- **服务**：处理数据库操作、权限检查（使用 `checkPermission` 中间件或 Service 内部检查）和事件广播。
- **模型**：Mongoose schema 配合强类型 TypeScript 接口（`IUser extends Document`）。
- **事件**：在变更数据（创建/更新/删除）时，必须从 Service 层广播 Socket 事件。
- **路由**：嵌套路由使用 `mergeParams: true`（例如 `servers/:serverId/channels`）。

**前端指南**
- **组件**：函数式组件。
- **结构**：
  - `features/`：包含特定业务域的组件和模态框。
  - `shared/`：包含通用的 Hook、Store、类型定义和 API 服务。
  - `layout/`：包含主布局结构和模态框管理器。
- **乐观更新**：在 `useMutation` 中手动更新 Query Cache 以实现即时 UI 反馈，随后根据 API 结果确认或回滚。
- **Mocking**：在测试中使用 MSW (Mock Service Worker) 进行网络层拦截。

## 测试策略

- **运行器**：Vitest（前端和后端均使用）。
- **后端测试**：
  - 使用 `supertest` 进行集成测试。
  - 使用 `mongodb-memory-server` 提供临时的测试数据库环境。
  - 在 `src/test/setup.ts` 中配置 Setup/Teardown 逻辑。
- **前端测试**：
  - 使用 `@testing-library/react` 进行组件测试。
  - 使用 `msw` 处理 API 请求模拟 (`src/mocks/handlers.ts`)。
  - 需模拟 Socket.io 连接以防止测试过程中的连接错误。

## 关键设计决策 (Vision)

1.  **"Hub" (中心)**：核心平台仅处理消息传输、存储、权限和状态同步。它不关心消息的具体内容类型（RSS、AI 思维链等）。
2.  **Bot 生态系统**：业务逻辑驻留在 Bot 中。Bot 通过 Webhook（仅推送）或 WebSocket（交互式）连接。
3.  **消息 Schema**：
    ```json
    {
      "type": "app/x-rss-card",
      "content": "Fallback text",
      "payload": { ...JSON data for UI component... }
    }
    ```
4.  **权限优先**：后端在执行任何敏感操作前，必须通过 `permission.service.ts` 计算出的有效权限集（Effective Permissions）进行验证。

# 测试账户

- **Username**: claude_test_user
- **Email**: claude_test_user@anthropic.com
- **Password**: password123