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

Mew 是一个以即时通讯（IM）平台为核心的个人数字中心，当前仓库实现了前端、后端、文档站点与插件。

## 仓库结构

- `client/`：React + Vite，状态管理使用 Zustand，服务端状态使用 TanStack Query。
- `server/`：Express + Socket.IO + Mongoose（MongoDB），请求校验使用 Zod。
- `website/`：Docusaurus 文档站（包名为 `docs`）。
- `plugins/`：Bot Service 插件（Go）。

## 常用命令

**根目录（推荐入口）**
- `pnpm dev`：并发启动 `client` 与 `server`。
- `pnpm test`：运行所有包的测试。

**按包执行（用于单独调试）**
- 后端：`pnpm --filter server [dev|build|test]`
- 前端：`pnpm --filter client [dev|build|lint|test]`
- 文档：`pnpm --filter docs [start|build]`

- **后端开发目录**：以 `server/src/api/<feature>/` 为单位组织，常见文件包括 `*.routes.ts`、`*.controller.ts`、`*.service.ts`、`*.repository.ts`、`*.model.ts`、`*.validation.ts` 与对应 `*.test.ts`/`*.routes.test.ts`。
- **前端开发目录**：`client/src/features/*`（业务域）+ `client/src/shared/*`（跨域复用）+ `client/src/layout/*`（布局/全局挂载）。

## 测试账户

- **Username**: claude_test_user
- **Email**: claude_test_user@anthropic.com
- **Password**: password123
