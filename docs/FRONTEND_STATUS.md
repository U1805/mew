# 前端开发详细规划

本文档旨在提供一份细化的、可执行的前端开发任务清单，作为下一阶段工作的路线图。

## 阶段一：基础架构与核心功能

此阶段的目标是搭建前端应用的基础，实现用户认证，并构建核心的通信与展示功能。

### 任务 1: 项目设置与文件结构
- [ ] **规划目录结构**: 在 `frontend/src` 目录下，创建以下核心文件夹：
  - `api`: 用于存放 API 请求和 WebSocket 客户端逻辑。
  - `components`: 用于存放可复用的 UI 组件（如按钮、输入框、头像等）。
  - `hooks`: 用于存放自定义 React Hooks（如 `useAuth`）。
  - `pages`: 用于存放页面级组件（如登录页、主应用页）。
  - `stores`: 用于存放 Zustand 状态管理文件。
  - `utils`: 用于存放通用工具函数（如 Token 管理）。

### 任务 2: API 客户端与认证层
- [ ] **创建 API 客户端**: 在 `src/api/client.ts` 中，创建一个封装的 `axios` 实例。
  - 配置 `baseURL` 指向后端 API 地址 (`http://localhost:3000/api`)。
  - 添加请求拦截器，用于从状态或 `localStorage` 中获取 JWT 并附加到 `Authorization` 请求头。
- [ ] **创建 Token 管理工具**: 在 `src/utils/token.ts` 中，创建用于操作 `localStorage` 的函数： `getToken()`, `setToken(token)`, `removeToken()`。

### 任务 3: 全局状态管理 (Zustand)
- [ ] **创建认证 Store**: 在 `src/stores/authStore.ts` 中，管理用户认证状态。
  - **State**: `user`, `token`, `isAuthenticated`。
  - **Actions**: `login(token, user)`, `logout()`。
- [ ] **创建数据 Store**: 在 `src/stores/dataStore.ts` 中，管理核心业务数据。
  - **State**: `servers`, `channels`, `messages`, `currentServerId`, `currentChannelId`。
  - **Actions**: `setServers()`, `setChannels()`, `addMessage()`, `selectServer()`, `selectChannel()` 等。

### 任务 4: 路由与页面实现
- [ ] **安装路由依赖**: `pnpm -F frontend add react-router-dom`。
- [ ] **设置应用路由**: 在 `App.tsx` 中配置应用的路由规则。
  - `/login`: 登录页。
  - `/register`: 注册页。
  - `/app`: 主应用界面（受保护路由）。
- [ ] **创建受保护路由**: 创建一个 `ProtectedRoute` 组件，该组件会检查 `authStore` 中的 `isAuthenticated` 状态，如果未登录则重定向到 `/login`。
- [ ] **实现登录/注册页面**: 创建 `LoginPage.tsx` 和 `RegisterPage.tsx` 组件，包含表单，并对接后端 API。
  - 登录成功后，调用 `authStore` 的 `login` action。

### 任务 5: 实时通信集成
- [ ] **创建 WebSocket 客户端**: 在 `src/api/socket.ts` 中，封装 Socket.IO 客户端的初始化和连接逻辑。
  - 在用户登录成功后，使用 `authStore` 中的 Token 来初始化连接。
- [ ] **实现实时事件监听**: 在主应用布局组件中，设置对后端 WebSocket 事件的监听。
  - `MESSAGE_CREATE`: 调用 `dataStore` 的 `addMessage` action。
  - `CHANNEL_UPDATE`: 调用 `dataStore` 的 `updateChannel` action。
  - `MESSAGE_DELETE`: 调用 `dataStore` 的 `removeMessage` action。
  - ...（等等）

### 任务 6: 核心 UI 构建
- [ ] **构建主布局**: 创建 `MainLayout.tsx`，使用 CSS Grid 或 Flexbox 划分出服务器列表、频道列表、消息区和用户信息区。
- [ ] **构建服务器列表**: 创建 `ServerList.tsx` 组件，从 `dataStore` 中获取 `servers` 数据并渲染。
- [ ] **构建频道列表**: 创建 `ChannelList.tsx` 组件，根据 `dataStore` 中选中的 `currentServerId` 来渲染其下的频道。
- [ ] **构建消息区**: 创建 `MessageArea.tsx` 组件，渲染 `dataStore` 中与 `currentChannelId` 相关的消息。
- [ ] **构建消息输入框**: 创建 `MessageInput.tsx` 组件，允许用户发送新消息（通过 API 或 WebSocket）。

