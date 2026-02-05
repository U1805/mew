# Mew client/server 鉴权安全审查报告

报告日期：2026-02-05  
范围：`client/`、`server/`（HTTP API、Refresh Token、Socket.IO Gateway、/infra）  

## 1. 结论摘要（Executive Summary）

本项目鉴权采用典型的“Access JWT + Refresh HttpOnly Cookie”的混合方案，整体方向正确（Refresh token 仅存 Cookie 且做哈希落库、支持 rotation、cookie `path=/api/auth` 限域、API CORS 有 allowlist 逻辑、生产环境对关键 secret 做 fail-fast）。

高风险主要集中在：

1) **前端将 Access Token 存入 `localStorage/sessionStorage`**：一旦出现任意 XSS（含第三方嵌入/富文本/Embed 漏洞），攻击者可直接窃取 token，进而完全接管账号（并可通过 WebSocket 进行实时滥用）。  
2) **Refresh Token rotation 的并发竞态**：同一 refresh token 在并发请求下可能被多次成功旋转，导致产生多个仍有效的 refresh token（会话复制），降低“单次使用”的安全收益。  
3) **WebSocket Gateway 的授权校验缺失/不完整（可能导致越权读写）**：当前 Socket.IO 事件处理与 room 加入逻辑疑似绕过了 HTTP 侧的权限中间件，存在向无权限频道发消息、或接收隐藏频道事件的风险。  
4) **Socket.IO 允许 `origin: '*'`**：在 token 泄露场景下会显著放大攻击面的可达性（任意站点都能在浏览器里直接连网关）；同时 /infra secret 的在线猜测面也更广（虽依赖强 secret）。  

其余为中低风险与“配置/部署踩坑点”（trust proxy、CORS 允许任意 origin 的 dev 默认、JWT 校验未显式限定 algorithms/iss/aud 等）。

## 2. 风险分级与发现清单

> 分级参考：Critical / High / Medium / Low（按可利用性 × 影响面 × 现实概率综合）。

### 2.1 Critical

**C-01：Socket.IO `message/create` 事件疑似绕过 `SEND_MESSAGES` / membership 校验（越权发消息）**  
- 位置：`server/src/gateway/handlers.ts`（`socket.on('message/create', ...)`）→ `server/src/api/message/message.service.ts`（`createMessage()`）  
- 现状：WS handler 直接调用 `createMessage()`；而 `createMessage()` 当前未看到对“作者是否属于频道/是否具备 `SEND_MESSAGES`”的校验逻辑（HTTP 创建消息路由是有 `authorizeChannel('SEND_MESSAGES')` 的）。  
- 影响：攻击者只要持有任意有效 JWT（普通用户），即可通过 Socket.IO 伪造 `channelId` 向不应可写的频道注入消息（取决于 `createMessage()` 对 DM/Server channel 的其它约束；就目前阅读到的代码，缺少关键鉴权门）。  
- 建议：
  - 在 `createMessage()` 内部补齐强制校验（**服务层自校验**，不要只依赖路由中间件）：验证频道类型、server membership、并计算 channel 权限确保 `SEND_MESSAGES`。  
  - 或在 WS handler 中复用 HTTP 侧的授权逻辑（更推荐前者，避免其它调用路径绕过）。

**C-02：Socket.IO room 加入逻辑疑似无视频道可见性（越权接收事件）**  
- 位置：`server/src/gateway/handlers.ts`（`joinUserRooms()`）  
- 现状：对 guild channels 使用 `Channel.find({ serverId: { $in: memberServerIds } })`，并将 socket 加入该 server 下的所有频道 room，未按 permission overrides/可见性过滤。  
- 影响：若系统存在“隐藏频道/受限频道”，用户可能被动接收这些频道的 `MESSAGE_*` / `CHANNEL_*` 等广播事件，从而造成信息泄露。  
- 建议：
  - room 加入应基于“用户可见频道列表”（例如复用 `channelRepository.findVisibleChannelsForUser(serverId, userId)` 或等价查询）。  
  - 广播策略也应避免向“频道 room”发送敏感事件前不做授权前置假设（room 必须可信）。

### 2.2 High

**H-01：Access Token 存储在 Web Storage（XSS => 直接接管）**  
- 位置：`client/src/shared/stores/authStore.ts`、`client/src/shared/services/http.ts`、`client/src/shared/services/socket.ts`  
- 影响：任何可执行脚本的 XSS（包括第三方 iframe/Embed 链、依赖供应链注入、插件渲染漏洞）都能读取 `mew_token` 并发送到攻击者控制端，实现账号接管。  
- 建议：
  - 优先：将 access token 改为 **仅内存**（页面刷新后依赖 refresh cookie 换新 token），或改为 **access token 也走 HttpOnly cookie**（配套 CSRF 防护/双提交 token）。  
  - 配套：提高 CSP/Trusted Types（若可行）、对任何 `dangerouslySetInnerHTML`/富文本渲染做严格 sanitize（DOMPurify 需配置白名单并防 DOM clobbering）。

**H-02：Refresh Token rotation 并发竞态可能导致“会话复制”**  
- 位置：`server/src/api/auth/refreshToken.service.ts` 的 `rotateRefreshToken()`  
- 风险描述：同一个 refresh token 在短时间并发请求（或网络重试）下，可能出现两次都 `findOne({tokenHash})` 成功、都 `issueRefreshToken()`、最终产生多个新的 refresh token 文档均有效。  
- 影响：被窃取 refresh token 的攻击者可更容易维持多个长期会话；也会让“单次使用”语义弱化。  
- 建议：用原子更新/事务实现“一次性消费”：
  - `findOneAndUpdate({ tokenHash, revokedAt: null, expiresAt: {$gt: now} }, { $set: { revokedAt: now } })` 先占坑，再签发新 token；
  - 或使用 MongoDB transaction；并对异常/重试策略做幂等设计。

### 2.3 Medium

**M-01：JWT verify 未显式限制 algorithms/claims（防御纵深不足）**  
- 位置：`server/src/middleware/auth.ts`、`server/src/gateway/middleware.ts`  
- 风险：依赖库默认行为；未来升级/配置错误可能引入 `alg` 混淆类问题；且缺少 `iss/aud` 校验会降低跨系统 token 误用的防线。  
- 建议：在 `verify` 时显式设置 `algorithms`（与 `sign` 保持一致），并根据部署场景逐步引入 `issuer/audience`。

**M-02：Socket.IO `origin: '*'`（扩大可达面，放大 token 泄露后果）**  
- 位置：`server/src/gateway/events.ts`  
- 风险：任意 Origin 可在浏览器发起握手；虽然仍需 JWT，但结合 H-01（XSS/token 泄露）会显著提高攻击者利用成功率与隐蔽性。  
- 建议：复用 API 的 allowlist 逻辑限制 Socket.IO CORS，至少在生产环境禁用 `*`。

**M-03：`trust proxy` 配置不当可能削弱 IP 限制类防护**  
- 位置：`server/src/config/index.ts`、`server/src/middleware/infraIpOnly.ts`  
- 风险：若部署时将 `MEW_TRUST_PROXY` 配成过宽（例如 `true`），攻击者可伪造 `X-Forwarded-For` 影响 `req.ip`，从而绕过“仅私网 IP”限制（当未配置 `MEW_INFRA_ALLOWED_IPS` 时）。  
- 建议：生产环境使用精确的 `trust proxy`（具体 CIDR/跳数），并强制配置 `MEW_INFRA_ALLOWED_IPS`（白名单优先于“私网判断”）。

**M-04：`rememberMe=false` 的 session cookie 可能在 refresh 后变为持久 cookie（会话持久化意外）**  
- 位置：`server/src/api/auth/auth.controller.ts`（`refreshHandler` 固定传 `rememberMe: true`）+ `server/src/api/auth/refreshToken.service.ts`（`issueRefreshToken()` 用 `rememberMe` 决定是否设置 `maxAge`）  
- 风险：用户选择“不记住我”时，登录下发的是 session cookie（浏览器关闭即失效）；但一旦发生 token refresh，服务端会按持久化策略重新下发 refresh cookie，导致会话变“可跨重启长期存在”。  
- 建议：在 RefreshToken 文档中持久化 `rememberMe/session` 标志并在 rotation 时继承；或在 refresh 请求中引入明确的、可认证的 rememberMe 信号（例如单独的 HttpOnly cookie 标志位）。

**M-05：Refresh token reuse（被盗后复用）缺少“链式撤销”策略（防御纵深）**  
- 位置：`server/src/api/auth/refreshToken.service.ts`（`rotateRefreshToken` / `revokeRefreshToken`）  
- 风险：当旧 refresh token 已被 rotation 并标记 `revokedAt` 后，如果它再次被使用，这通常是“token 泄露/被盗”的强信号；目前逻辑仅返回 401 并清 cookie，没有进一步撤销 `replacedByTokenId` 或该用户的其它 refresh token，会降低被盗场景下的止损效果。  
- 建议：实现 refresh token reuse 检测：当检测到“已 revoked 的 token 被再次使用”时，撤销其 replacement token（或撤销该 user 的全部 refresh token）并触发安全告警/强制重新登录。

**M-06：Web Channel iframe（若 URL 可被他人设置）会放大钓鱼/组合攻击面；同源场景可直接读 Web Storage**  
- 位置：`client/src/features/chat/components/ChatArea.tsx`（`<iframe src={channel.url} sandbox="allow-same-origin ... allow-scripts ...">`）+ `server/src/api/channel/channel.service.ts`（web channel 支持可更新 `url`）  
- 风险：
  - 如果有权限的用户（如具备 `MANAGE_CHANNEL`）可为其它成员设置 Web Channel URL，则可用于**高可信钓鱼**（在应用内部展示任意站点）。  
  - 若 URL 被设置为同源页面且该页面存在可控脚本执行（例如同源静态托管/上传内容/历史 XSS），则在 `allow-same-origin` + `allow-scripts` 下可直接读取 `localStorage/sessionStorage` 中的 `mew_token`（与 H-01 强相关）。  
- 建议：至少在生产环境评估是否需要移除 `allow-same-origin`（会破坏部分站点），或更推荐从根上移除 Web Storage token（H-01），并对可设置 Web Channel URL 的权限做最小化与审计。

### 2.4 Low / Observations

- L-01：Refresh cookie `SameSite=Lax` + `path=/api/auth` 是合理默认；但若未来需要跨站嵌入/SSO，会引入更多 CSRF 设计问题（需要提前规划）。
- L-02：`/api/auth/config` 暴露 `allowUserRegistration` 属于可接受的信息披露，但若未来扩展更多配置需注意别暴露敏感策略。

## 3. 复现思路（安全可控版）

> 这里给“验证方法”，不提供可直接武器化的攻击脚本。

- 验证 H-01：在任意可控渲染点触发脚本执行（例如某些 embed/富文本/第三方内容渲染），观察是否能读取 `localStorage.getItem('mew_token')` 并在开发者工具里看到。  
- 验证 H-02：对 `POST /api/auth/refresh` 做并发请求（同一 Cookie），检查是否可产生多个 refresh token 仍可继续刷新（可通过数据库中 refresh token 文档数量/状态与连续刷新成功率侧证）。  
- 验证 M-02：从非 allowlist 的 Origin 页面（本地静态页即可）尝试在浏览器发起 Socket.IO 连接，观察是否能握手建立连接（无需 token 也会体现 CORS/握手行为差异）。

## 4. 优先级修复路线图（建议）

1) **先修 WebSocket Gateway 授权（C-01/C-02）**：这类问题往往可直接导致越权读写，是“立刻能被打”的优先级。  
2) **再解决 token 存储策略（H-01）**：把 access token 移出 Web Storage；此项收益最大、也会显著降低多类组合风险。  
3) **刷新 token 旋转原子化（H-02）**：避免并发复制会话。  
4) **收紧 Socket.IO CORS（M-02）**：至少生产环境；并统一与 API CORS allowlist。  
5) **JWT verify 防御纵深（M-01）**：显式 algorithms +（可选）iss/aud。  
6) **部署安全基线**：强制配置 `MEW_INFRA_ALLOWED_IPS` + 合理 `MEW_TRUST_PROXY`。

---

审查日志见：`security-audit/audit-log.md`

## 5. 修复后复查（2026-02-05）

- C-01（WS 越权发消息）：已修复，`createMessage()` 服务层校验 membership + `SEND_MESSAGES`，WS/HTTP 共用路径。见 `server/src/api/message/message.service.ts:283`。
- C-02（WS room 可见性）：已修复（引入 `VIEW_CHANNEL`，并仅加入 `VIEW_CHANNEL` 的频道 room）。见 `server/src/gateway/handlers.ts:1`、`server/src/constants/permissions.ts:1`。
- H-01（token 存 Web Storage）：已修复（前端不再存 token；会话通过 HttpOnly cookie + `hydrate()` 恢复）。见 `client/src/shared/stores/authStore.ts:8`。
- H-02（refresh 并发竞态）：已修复（rotation 先 `findOneAndUpdate` 消费旧 token）。见 `server/src/api/auth/refreshToken.service.ts:70`。
- M-01（JWT verify 防御纵深：alg/iss/aud）：**仍存在**（`jwt.verify()` 未显式限制 algorithms/iss/aud）。见 `server/src/middleware/auth.ts:27`、`server/src/gateway/middleware.ts:24`。
- M-02（Socket.IO CORS `*`）：已修复（Gateway CORS 复用 allowlist）。见 `server/src/gateway/events.ts:11`。
- M-03（trust proxy 配置风险）：未变更（属部署基线/配置项）。
- M-04（rememberMe 语义漂移）：已修复（RefreshToken 持久化 `isPersistent` 并继承）。见 `server/src/api/auth/refreshToken.model.ts:6`、`server/src/api/auth/refreshToken.service.ts:81`。
- M-05（refresh reuse 检测/止损）：已部分覆盖（检测到 revoked token reuse 会撤销该用户所有未撤销 refresh token）。见 `server/src/api/auth/refreshToken.service.ts:64`。
- M-06（Web Channel iframe 组合风险）：**风险显著降低**（不再有 `mew_token` 可被读取），但“应用内钓鱼/恶意内容嵌入”仍需产品策略与权限/审计配合。见 `client/src/features/chat/components/ChatArea.tsx:88`。
  - 补充：读取类接口也已统一要求 `VIEW_CHANNEL`（例如 `GET /messages`），避免“虽未 join room 但仍可拉取历史消息”的绕过路径。
