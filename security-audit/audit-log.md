# Mew 鉴权安全审查日志（client/server）

审查日期：2026-02-05  
审查范围：`client/`、`server/`（HTTP API + Refresh Token + Socket.IO Gateway + /infra namespace）  
审查方式：白盒为主（代码审查 + 关键路径推演），辅以可执行测试/用例阅读（仓库内 `*.test.ts`）。  

## 0. 目标与假设

- 目标：发现鉴权/会话/授权相关的高风险缺陷与可被利用的漏洞（以及配置/部署踩坑点），给出可落地的修复建议与优先级。
- 假设：
  - 生产环境为 HTTPS，API 与 Web 同源或在受控跨域下访问。
  - 攻击者模型覆盖：未登录外部攻击者、已登录普通用户（横向越权）、恶意 server owner、持有 Bot accessToken 的攻击者、前端发生 XSS 的攻击者。

## 1. 代码检索与入口盘点（摘要）

### 1.1 Auth 端点（server）

- `GET /api/auth/config`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/bot`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

### 1.2 会话形态（server）

- Access Token：JWT（`Authorization: Bearer <token>`）
- Refresh Token：`HttpOnly` Cookie（默认 `mew_refresh_token`，`path=/api/auth`，`SameSite=Lax`，`Secure` 仅在 `NODE_ENV=production`）

### 1.3 WebSocket（server）

- Gateway：Socket.IO 握手 `auth.token` 传 JWT（见 `server/src/gateway/middleware.ts`）
- Infra：Socket.IO namespace `/infra` 使用 `x-mew-admin-secret`/`auth.adminSecret` + `serviceType`（见 `server/src/infra/infraSocket.ts`）

### 1.4 客户端（client）

- Access Token 存储：`localStorage/sessionStorage`（key：`mew_token`）
- 401 自动刷新：`POST /api/auth/refresh`（`withCredentials: true`）后写回 token（见 `client/src/shared/services/http.ts`）
- WS 连接：Socket.IO `auth.token`（见 `client/src/shared/services/socket.ts`）

## 2. 审查过程记录（逐步）

> 说明：本日志记录“我看了什么/推断了什么/我认为有什么风险”。最终结论与优先级在 `security-audit/report.md`。

### 2.1 初始盘点（2026-02-05）

- 读取：`README.md`、`package.json`、`server/src/app.ts`、`server/src/config/index.ts`
- 关键配置点：
  - JWT：`JWT_SECRET`、`JWT_EXPIRES_IN`（默认 30m）
  - Refresh：`REFRESH_TOKEN_EXPIRES_IN`（默认 30d）
  - CORS：`MEW_CORS_ORIGINS`（非 prod 且为空时允许任意 Origin）
  - Admin secret：`MEW_ADMIN_SECRET`（prod 缺失会 fail-fast）

### 2.2 已阅读的鉴权关键文件（清单）

- server
  - `server/src/api/auth/auth.routes.ts`
  - `server/src/api/auth/auth.controller.ts`
  - `server/src/api/auth/auth.service.ts`
  - `server/src/api/auth/refreshToken.service.ts`
  - `server/src/api/auth/refreshToken.model.ts`
  - `server/src/middleware/auth.ts`
  - `server/src/gateway/middleware.ts`
  - `server/src/gateway/events.ts`
  - `server/src/middleware/infraIpOnly.ts`
  - `server/src/middleware/verifyAdminSecret.ts`
- client
  - `client/src/shared/services/http.ts`
  - `client/src/shared/stores/authStore.ts`
  - `client/src/shared/services/socket.ts`
  - `client/src/shared/utils/messageParser.tsx`
  - `client/src/features/chat/components/ChatArea.tsx`

### 2.3 待继续深挖的区域（后续步骤）

- Access Token 校验策略：算法/issuer/audience、token 结构约束、潜在降级/混淆攻击面（依赖 `jsonwebtoken` 行为）。
- Refresh Token 旋转并发与会话固定：同一 refresh token 并发使用是否可产生多个有效 refresh token（race）。
- WebSocket CORS 与 token 传递：`origin: '*'` 的真实风险边界（主要与 XSS/token 泄露联动）。
- 客户端 XSS 与 token 存储：本项目是否存在可触发 XSS 的富文本/Embed/iframe 入口（尤其是 Web Channel iframe）。

### 2.4 WebSocket Gateway（初步结论，2026-02-05）

- 读取：`server/src/gateway/handlers.ts`、`server/src/server.ts`
- 发现（需重点确认/修复）：
  - **房间加入逻辑疑似绕过频道可见性**：`joinUserRooms()` 对 guild channel 使用 `Channel.find({ serverId: { $in: memberServerIds } })`，会把用户加入该 server 下**所有**频道 room（未过滤权限/覆盖），这会让“本应不可见/无权限的频道事件”也推送给该用户（取决于服务端广播策略）。
  - **WS 事件 `message/create` 疑似缺失权限校验**：handler 直接调用 `createMessage({...data, authorId})`，而 `createMessage()` 本身未看到 `SEND_MESSAGES` / membership 校验路径（HTTP 路由是有 `authorizeChannel('SEND_MESSAGES')` 的，但 WS 绕过了路由中间件）。
  - 上述两点组合后，红队会优先验证：是否能通过 Socket.IO 向无权限频道/非成员 server 的频道写入消息，或被动接收隐藏频道消息事件。

### 2.5 试运行测试（2026-02-05）

- 尝试执行：`pnpm test`
- 结果：测试未能启动，Node 抛出 `spawn EPERM`（进程创建权限错误）。因此本轮审查主要依赖静态代码审查与测试代码阅读，而非真实运行时验证。

### 2.6 Refresh Token 会话语义检查（2026-02-05）

- 读取：`server/src/api/auth/refreshToken.service.ts`、`server/src/api/auth/auth.controller.ts`
- 关注点与初步结论：
  - Cookie 属性：`HttpOnly`、`SameSite=Lax`、`path=/api/auth`；`Secure` 仅在 `NODE_ENV=production`。
  - Rotation 并发竞态：`rotateRefreshToken()` 采用“先查后写”的非原子流程，存在并发双刷产生多个有效 refresh token 的理论窗口（需要运行时验证，但风险模型成立）。
  - `rememberMe` 语义：登录时 `rememberMe=false` 会下发 session cookie（无 `maxAge`），但 `POST /api/auth/refresh` 当前固定 `rememberMe: true`，可能导致 **session cookie 在一次 refresh 后变成持久 cookie**（与“记住我”预期不一致，增加长期会话暴露面）。

### 2.7 客户端鉴权与 XSS 入口快速巡检（2026-02-05）

- 读取：`client/src/shared/services/http.ts`、`client/src/shared/services/socket.ts`、`client/src/shared/utils/messageParser.tsx`
- 初步结论：
  - 文字消息渲染路径未见 HTML 注入（以 React text/element 方式渲染 mentions/URL）。
  - 发现 Web Storage 存 token（`mew_token`）是最核心风险聚合点（XSS 即接管）。
- 额外关注：
  - Web Channel iframe：`client/src/features/chat/components/ChatArea.tsx` 允许渲染任意 URL（带 `allow-same-origin` + `allow-scripts` 的 sandbox），需要结合“谁能设置 URL”“是否存在同源可控内容/XSS”评估组合风险。

## 3. 修复后复查（2026-02-05）

> 对照 `security-audit/report.md` 的发现点，复查当前代码状态（本次已可运行 `pnpm test` 并通过）。

- WS `message/create` 绕过权限：已修复（服务层强制校验 membership + `SEND_MESSAGES`，WS/HTTP 共用）。见 `server/src/api/message/message.service.ts:283`。
- WS room 加入不区分频道可见性：逻辑仍存在（仍对 server 下所有 channel join room）。见 `server/src/gateway/handlers.ts:19`。
- WS room 加入不区分频道可见性：已修复（引入 `VIEW_CHANNEL` 并仅加入可见频道 room）。见 `server/src/gateway/handlers.ts:1`。
- Refresh rotation 并发竞态：已修复（`findOneAndUpdate` 原子“占坑”消费）。见 `server/src/api/auth/refreshToken.service.ts:70`。
- `rememberMe=false` refresh 后变持久：已修复（RefreshToken 持久化 `isPersistent` 并在 rotation 继承）。见 `server/src/api/auth/refreshToken.model.ts:6`、`server/src/api/auth/refreshToken.service.ts:81`。
- Socket.IO `origin: '*'`：已修复（Gateway 侧改为基于 config allowlist 的 origin 函数）。见 `server/src/gateway/events.ts:11`。
- 客户端 Web Storage 存 `mew_token`：已修复（前端不再存 token；以 cookie 会话 `hydrate()` 恢复登录态）。见 `client/src/shared/stores/authStore.ts:8`（且 `client/src` 中无 `mew_token` 引用）。
