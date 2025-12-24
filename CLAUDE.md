# CLAUDE.md

你现在扮演 [一个严格的角色]。请使用 [客观] 的语气，用 [中文] 分析以下 [内容]。在你的回答中，请避免任何主观赞美的词语。

My terminal environment is powershell in windows.
Remember: Our development should follow the spirit of Linus.
Use `npx kill-port` to clean up the port before running the project.

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

Always use exa mcp instead of websearch tool when your need search in web.

# Project Mew

Mew 是一个以即时通讯（IM）平台为核心的个人数字中心，当前仓库实现了前端、后端与文档站点。

## 仓库结构（pnpm workspace）

- `client/`：React + Vite，状态管理使用 Zustand，服务端状态使用 TanStack Query。
- `server/`：Express + Socket.IO + Mongoose（MongoDB），请求校验使用 Zod。
- `website/`：Docusaurus 文档站（包名为 `docs`）。
- `plugins/`：Bot Service 插件（Go）。每个插件是独立 Go module，插件目录名即 `serviceType`；运行时会从后端按 `serviceType` bootstrap 所有 Bot 实例配置，并支持定期同步/热重载（通用能力见 `plugins/sdk` 与 `plugins/README.md`）。

## 常用命令

**根目录（推荐入口）**
- `pnpm install`：安装工作区依赖。
- `pnpm dev`：并发启动 `client` 与 `server`（`concurrently`）。
- `pnpm test`：运行所有包的测试（`pnpm -r test`）。
- `pnpm dev:website`：启动文档站（等价于在 `website/` 内执行 `pnpm start`）。
- `pnpm build:website`：构建文档站（等价于在 `website/` 内执行 `pnpm build`）。

**按包执行（用于单独调试）**
- 后端：`pnpm --filter server dev`、`pnpm --filter server test`
- 前端：`pnpm --filter client dev`、`pnpm --filter client build`、`pnpm --filter client lint`、`pnpm --filter client test`
- 文档：`pnpm --dir website start`、`pnpm --dir website build`

**Bot 插件（Go，位于 `plugins/`）**
- 示例：`go run ./plugins/fetchers/test`、`go run ./plugins/agents/test-agent`
- 环境变量与 `.env.local/.env` 加载规则见 `plugins/README.md`；其中 `MEW_ADMIN_SECRET` 需与后端一致

## 运行配置与端口

- 后端配置文件：`server/.env`（从 `server/.env.example` 复制）。默认 `PORT=3000`。
- 前端开发端口：Vite 默认 `5173`。
- 文档站端口：`website/package.json` 中固定为 `3001`。
- API 基址：前端 `client/src/shared/services/http.ts` 当前硬编码为 `http://localhost:3000/api`；若要切换环境变量（如 `VITE_API_BASE_URL`），需要同步调整该实现。
- Socket Gateway：前端 `client/src/shared/services/socket.ts` 当前连接 `http://localhost:3000`。

## 后端开发规范（`server/`）

- **特性目录**：以 `server/src/api/<feature>/` 为单位组织，常见文件包括 `*.routes.ts`、`*.controller.ts`、`*.service.ts`、`*.repository.ts`、`*.model.ts`、`*.validation.ts` 与对应 `*.test.ts`/`*.routes.test.ts`。
- **请求链路**：Routes → Middleware（`server/src/middleware/*`）→ Controller → Service/Repository → Mongoose Model。
- **校验**：Zod schema 定义于 `*.validation.ts`，通过 `server/src/middleware/validate.ts` 统一解析 `body/query/params`。
- **错误处理**：业务异常使用 `server/src/utils/errors.ts` 的自定义错误类，统一由 `server/src/utils/errorHandler.ts` 转换为 HTTP 响应。
- **权限**：RBAC + Channel permission overrides；
- **Bot/插件对接**：Bot CRUD 位于 `server/src/api/bot/*`；
- **实时事件**：广播事件、连接与事件、Socket 鉴权在 `server/src/gateway/*`。

## 前端开发规范（`client/`）

- **目录**：`client/src/features/*`（业务域）+ `client/src/shared/*`（跨域复用）+ `client/src/layout/*`（布局/全局挂载）。
- **状态管理**：Zustand store 位于 `client/src/shared/stores/*`（会话、UI、在线状态、未读等）。
- **服务端状态**：TanStack Query；Socket 事件通过自定义 hooks（`client/src/shared/hooks/*`）驱动缓存与 UI 更新。
- **API 层**：Axios 实例在 `client/src/shared/services/http.ts`，按域拆分到 `client/src/shared/services/*.api.ts`。
- **样式**：Tailwind 通过 CDN 注入（见 `client/index.html`），并内联 `tailwind.config`；避免依赖“构建期 Tailwind”特性，除非先完成迁移。

## 测试与质量门槛

- 测试运行器：Vitest（前端/后端）。
- 后端：`supertest` 做路由集成测试，`mongodb-memory-server`（`MongoMemoryReplSet`）提供隔离的 MongoDB（见 `server/src/test/setup.ts`）。
- 前端：`@testing-library/react` + `msw`（`client/src/mocks/*`）+ `happy-dom`（见 `client/vite.config.ts` 与 `client/src/test/setup.ts`）。
- 提交前至少运行：`pnpm test`；涉及前端改动同时运行：`pnpm --filter client lint`。

## 测试账户

- **Username**: claude_test_user
- **Email**: claude_test_user@anthropic.com
- **Password**: password123
