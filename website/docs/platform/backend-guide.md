---
sidebar_label: '后端开发指南'
sidebar_position: 50
slug: /guide/server-guide
---

# ⚙️ 后端开发指南

欢迎来到后端开发的世界！后端位于 `server/` 目录，基于 **Node.js + Express + Mongoose** 技术栈构建，为整个应用提供稳定可靠的数据与实时通信支持。

其核心职责分为两部分：
- **REST API**：提供标准的资源增删改查（CRUD）接口，涵盖认证、服务器、频道、消息等核心功能。
- **WebSocket 网关 (Socket.IO)**：处理实时事件的推送，如新消息、在线状态更新等，确保前端能够即时响应，而非依赖传统的轮询。

:::info 接口参考
关于 API 的详细定义，你可以查阅以下文档：
- [**REST API 规范**](../core-api/rest-api.md)
- [**WebSocket API 规范**](../core-api/websocket-api.md)
:::

---

## 快速启动

我们提供了便捷的启动脚本，让你能快速进入开发状态。请在项目根目录下执行：

```bash
# 启动全栈开发环境 (推荐)
pnpm dev
```

```bash
# 仅启动后端服务
pnpm --filter server dev
```

后端服务启动时会自动读取 `server/.env` 文件作为环境变量。你可以从 `server/.env.example` 复制一份进行配置。

## 环境变量配置

为了让后端正常运行，你需要配置一些必要的环境变量。

#### 核心配置 (必须)

| 变量名 | 描述 |
| :--- | :--- |
| `PORT` | HTTP 监听端口（默认 `3000`）。 |
| `MONGO_URI` | MongoDB 数据库的连接字符串（默认 `mongodb://localhost:27017/mew`）。 |
| `JWT_SECRET` | 用于签发和验证 JSON Web Token (JWT) 的密钥。生产环境缺失会直接启动失败。 |
| `MEW_ADMIN_SECRET` | 内部基础设施通信的共享密钥，用于 Bot Service 引导注册、`/api/infra/*` 与 `/infra` 命名空间鉴权等。生产环境缺失会直接启动失败。 |

#### 可选配置

| 变量名 | 描述 |
| :--- | :--- |
| `JWT_EXPIRES_IN` | Access Token 有效期（支持 `30m` / `2h` / 秒数），默认 `30m`。 |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh Token 有效期（支持 `30d` / `12h` / 秒数），默认 `30d`。 |
| `MEW_BOT_TOKEN_ENC_KEY` | Bot access token 的静态加密密钥。 |
| `MEW_ALLOW_USER_REGISTRATION` | 是否允许开放注册（`/api/auth/register`），默认 `true`。 |
| `MEW_CORS_ORIGINS` | API 允许跨域请求的来源列表，用逗号分隔。支持 `*`。开发环境下留空会默认放行任意 Origin；生产环境强烈建议显式配置。 |
| `MEW_TRUST_PROXY` | Express 的 `trust proxy` 设置。默认 `loopback`。当你将后端部署在 Nginx 等反向代理之后时，此项至关重要，用于正确获取客户端 IP。 |
| `MEW_ENABLE_RATE_LIMIT` | 在非生产环境也启用基础限流（`true`/`false`）。生产环境默认开启。 |
| `MEW_INFRA_ALLOWED_IPS` | 基础设施接口（如 `/api/bots/bootstrap`、`/api/infra/service-types/register`）的 IP 白名单，用逗号分隔。为空则仅允许私网 IP + loopback。 |
| `MEW_STATIC_URL` | 覆盖 API 返回的文件公开 URL 基址（`/static/<key>`）与预签名上传 URL 基址（`/presign/...`），用于在 Docker/Nginx 场景下对外暴露可访问的地址。 |
| `LIMIT_FILE_SIZE` | 上传大小上限（单位：MB），默认 `50`。 |
| `S3_ENDPOINT` / `S3_PORT` | S3 API 访问地址（默认 `localhost:3900`）。 |
| `S3_WEB_ENDPOINT` / `S3_WEB_PORT` | 文件公开访问域名与端口（默认 `web.garage.localhost:3902`，实际会拼成 `bucket.webEndpoint`）。 |
| `S3_BUCKET_NAME` | 存储桶名称（未配置时默认 `mew`；本项目 `docker-compose.yml`/`server/.env.example` 默认使用 `mew-bucket`）。 |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | S3 访问凭证。生产环境必须显式提供（或通过 `S3_CREDENTIALS_FILE` 提供）。 |
| `S3_CREDENTIALS_FILE` | 从文件读取 `{accessKeyId, secretAccessKey}`（适合 Docker 初始化场景）。 |
| `S3_USE_SSL` / `S3_REGION` | S3 连接协议与区域等配置。 |
| `S3_CORS_ORIGINS` | 对象存储的 CORS 允许列表，用于支持浏览器直传文件。默认会沿用 `MEW_CORS_ORIGINS` 的值。 |
| `S3_PRESIGN_EXPIRES_SECONDS`| 浏览器直传时，预签名上传 URL 的有效时间（单位：秒），默认 `60`。 |

---

## 项目结构解析

为了便于维护和拓展，后端代码遵循“功能优先 (Feature-First)”的模块化组织方式。

#### 路由入口

所有 API 路由的注册入口位于 `server/src/app.ts`，主要挂载点如下：
- `/api/health`：健康检查
- `/api/auth`：注册与登录
- `/api/users`：当前用户信息 (`/@me`)、服务器与 DM 频道列表、用户搜索等
- `/api/servers`：服务器管理，其下嵌套子资源路由，如：
  - `/:serverId/channels`：频道管理
  - `/:serverId/members`：成员管理
  - `/:serverId/invites`：服务器内邀请管理
  - `/:serverId/stickers`：服务器贴纸
  - `/:serverId/search`：服务器内搜索
  - `/:serverId/bots`：Bot 邀请/绑定相关
  - `/:serverId/roles`：角色管理
  - `/:serverId/categories`：频道分类
- `/api/channels`：频道通用接口
  - `/:channelId/uploads`：附件上传（预签名直传 / 服务器中转 / 按 key 下载）
- `/api/invites`：公开邀请链接
- `/api/webhooks`：Webhook 执行与文件上传（含 presign/upload）
- `/api/bots`：Bot bootstrap（infra-only）与 Bot 自身配置更新
- `/api/infra`：基础设施接口（服务类型注册、可用服务查询等）
- `/api/v1/audio/speech`：文本转语音（TTS）
- `/api/v1/audio/transcriptions`：语音转文本（STT）

#### 模块组织

一个典型的功能模块（如 `message`）通常包含以下文件：
- `*.routes.ts`：定义路由、编排中间件（如认证、权限、校验）。
- `*.controller.ts`：处理 HTTP 请求和响应的薄层，调用 Service 完成业务逻辑。
- `*.service.ts`：**核心业务逻辑层**，负责数据处理，并在这里调用 WebSocket 网关广播事件。
- `*.model.ts`：定义 Mongoose 数据模型 (Schema)。
- `*.validation.ts`：使用 **Zod** 定义请求数据的校验规则。

---

## 认证与权限

我们设计了一套严密的认证与权限系统，以确保数据安全。

1.  **认证 (Authentication)**
    - 所有需要登录的接口都会经过 `server/src/middleware/auth.ts` 中间件。
    - 它会优先读取 `Authorization: Bearer <token>`，并支持从 Access Token Cookie 读取 JWT。
    - 验证通过后会将用户信息挂载到 `req.user`，供后续权限流程使用。

2.  **权限校验 (Authorization)**
    - 路由通过 `authorizeServer(...)` 或 `authorizeChannel(...)` 中间件进行权限检查。
    - 权限的计算逻辑（综合用户角色、频道覆盖权限等）封装在 `server/src/utils/permission.service.ts` 中。

3.  **层级校验 (Hierarchy Check)**
    - 对于一些敏感的管理操作（如踢人、修改角色），除了基础权限外，还会进行层级校验，确保操作者的角色层级高于被操作者。逻辑见 `server/src/utils/hierarchy.utils.ts`。

:::info 实时权限更新
当用户的权限结构发生变化时（如角色变更），后端会广播 `PERMISSIONS_UPDATE` 事件，客户端收到后会清除相关缓存并重新获取最新的权限信息，确保权限变更即时生效。
:::

---

## WebSocket 网关

WebSocket 网关是实现实时体验的核心，入口位于 `server/src/server.ts` 和 `server/src/gateway/*`。

- **连接鉴权**：客户端发起 WebSocket 连接时，会通过 `server/src/gateway/middleware.ts` 进行 JWT 鉴权。
- **鉴权来源**：WebSocket 支持从握手 `auth.token` 或 Access Token Cookie 中读取 JWT。
- **房间管理**：用户成功连接后，会根据其所在服务器、频道和自身 ID 加入不同的 Socket.IO 房间 (Room)，便于精准推送事件。
- **事件广播**：`Service` 层在完成数据操作后，会调用 `socketManager.broadcast(...)` 等封装好的函数，向特定房间广播事件（如 `MESSAGE_CREATE`），通知所有相关的客户端更新视图。
- **基础设施命名空间 (`/infra`)**：用于 Bot Service 等内部服务的在线状态与能力同步，使用 `X-Mew-Admin-Secret`（或握手参数 `adminSecret`）+ `serviceType` 进行鉴权。

## 文件上传 (S3 兼容)

文件上传推荐使用**浏览器直传**模式，以降低服务器压力。

#### 核心流程
1.  前端 `POST /api/channels/:channelId/uploads/presign` 请求一个预签名的上传 URL。
2.  前端使用返回的 URL，通过 `PUT` 请求直接将文件上传到 S3 存储桶。
3.  上传成功后，前端将文件元数据发送给后端，用于创建消息附件。

:::info 流式上传：服务器中转方案
如果直传不可用，后端也支持服务器中转上传。我们通过自定义的 `S3StreamingStorage` 存储引擎 (`server/src/middleware/s3Storage.ts`)，将文件流直接 pipe 到 S3，避免了在服务器上创建临时文件或占用大量内存，性能更优。
:::

后端在返回消息数据时，会自动将附件的 `key` 字段转换为完整的、可公开访问的 `url`。

## Bot Service 引导

为了提升 Bot 开发和部署的体验，我们设计了一套自动化的配置引导机制。

#### 设计思路
传统的 Bot 需要开发者手动复制 Token 并配置到 Bot 服务中，过程繁琐且容易出错。我们的方案改为通过 `serviceType` 进行服务认领：
1. Bot Service 启动时，通过内网接口向主后端注册自己的 `serviceType` 及展示信息。
2. 用户在前端创建 Bot 时，只需从可用服务列表中选择一个 `serviceType`。
3. Bot Service 通过内部接口 (`POST /api/bots/bootstrap`) 定期拉取所有归属于它的 Bot 的配置信息，实现自动同步。

:::caution 当前实现细节
目前 `plugins/pkg` 采用**轮询**方式同步配置。配置变更（如用户在 UI 上修改了 Bot 设置）由 Bot Service 侧的轮询拉取来感知，而非通过 WebSocket 实时推送。
:::
