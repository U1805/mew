### **前端开发总体任务规划 (v2 - 已与后端同步)**

**最后更新时间: 2025-11-28**

**当前状态**: 第二阶段已完成。我们成功构建了应用的核心三栏式布局，并实现了从后端动态获取服务器列表的功能。同时，之前存在的测试环境兼容性问题已被修复，并为新组件编写了单元测试。下一步将开始第三阶段的开发。

---

现在，让我们基于这个强大的后端，规划前端的开发蓝图。我们可以将整个过程分为几个大的阶段性任务（Epics）：

**第一阶段：奠定基础与用户认证 (Foundation & Authentication)** - ✅ **已完成**
*   **目标**：搭建好前端项目骨架，实现用户注册和登录功能，并建立起与后端通信的桥梁。用户可以登录并保持登录状态。
*   **关键产出**：可运行的前端应用、登录/注册页面、受保护的路由、全局状态管理。

**第二阶段：核心布局与数据展示 (Core Layout & Data Display)** - ✅ **已完成**
*   **目标**：构建类似 Discord 的三栏式主界面布局，并从后端获取和展示用户拥有的服务器、频道等核心数据。
*   **关键产出**：主应用界面骨架、服务器列表、频道列表、用户面板、能展示从 API 获取的数据。

**第三阶段：实时消息体验 (Real-time Messaging Experience)**
*   **目标**：实现核心的聊天功能。用户可以在频道内发送和接收实时消息，加载历史记录。
*   **关键产出**：消息视图、消息输入框、**Socket.io** 连接与事件处理、历史消息懒加载。

**第四阶段：交互增强与功能完善 (Interaction Enhancement)**
*   **目标**：在基础聊天功能之上，增加丰富的交互能力，让应用体验更完整。
*   **关键产出**：消息编辑、删除、引用、Reaction 功能、文件上传、Markdown 渲染。

**第五阶段：插件化渲染与 Bot 集成 (Pluggable Rendering & Bot Integration)**
*   **目标**：实现我们构想的核心亮点——可插拔的消息渲染系统，并为 Bot 的交互做好准备。
*   **关键产出**：自定义消息类型（如 RSS 卡片）的渲染组件、对 Bot 用户的特殊 UI 标识。

---

### **第一阶段：奠定基础与用户认证（细节规划）** - ✅ **已完成**

**任务 1：项目初始化与环境配置**
*   [x] **安装依赖**：进入 `frontend` 目录，执行 `pnpm install`。
*   [x] **配置环境变量**：创建 `.env.local` 文件，并添加 `VITE_API_BASE_URL=http://localhost:3000/api`。
*   [x] **建立目录结构**：在 `src` 目录下，创建以下文件夹：`components/`, `pages/`, `lib/` (或 `services/`), `store/`, `hooks/`, `types/`, `router/`。

**任务 2：创建 API 客户端**
*   [x] **封装 API 实例**：在 `lib/api.ts` 中，使用 `axios` 创建一个 API 客户端实例。
    *   配置 `baseURL`，使其读取 `VITE_API_BASE_URL`。
    *   **关键**：设置一个请求拦截器（Request Interceptor）。这个拦截器的作用是在每次发送请求前，从状态管理（Zustand store）中读取 token，并将其添加到 `Authorization` 请求头中 (`Bearer ${token}`)。

**任务 3：设置全局状态管理 (Zustand)**
*   [x] **创建认证 Store**：在 `store/authStore.ts` 中创建一个 Zustand store。
    *   **State**: `user` (用户信息对象 | null), `token` (string | null)。
    *   **Actions**: `setToken(token)`, `setUser(user)`, `logout()`。
    *   **持久化**: 使用 Zustand 的 `persist` 中间件，将 `user` 和 `token` 存储在 `localStorage` 中。

**任务 4：配置应用路由 (React Router)**
*   [x] **安装 React Router**：`pnpm add react-router-dom`。
*   [x] **创建路由配置**：在 `router/index.tsx` 中配置应用的路由 (`/login`, `/register`, `/app`)。
*   [x] **实现受保护的路由 (`ProtectedRoute`)**：检查用户是否已登录，否则重定向到 `/login`。
*   [x] **整合路由**: 在 `App.tsx` 中，使用 `RouterProvider` 来启动整个路由系统。

**任务 5：构建登录与注册页面**
*   [x] **创建表单组件**：在 `components/ui/` 中创建基础的 `Input`, `Button`, `Label` 组件。
*   [x] **构建页面 UI**：在 `pages/` 中创建 `LoginPage.tsx` 和 `RegisterPage.tsx`。
*   [x] **集成数据请求 (TanStack Query)**：
    *   在 `main.tsx` 中用 `QueryClientProvider` 包裹整个应用。
    *   在登录/注册页面中，使用 `useMutation` hook 来处理 API 调用。
    *   **关键：修正登录流程 (`onSuccess` 回调)**: 已实现。

---

### **第二阶段：核心布局与数据展示（细节规划）**

现在，我们来详细规划第二阶段的具体步骤。

**任务 1：构建应用核心布局**
*   [x] **创建 `AppLayout` 组件**：在 `src/pages/` 或 `src/components/layout` 中，创建一个 `AppLayout.tsx` 组件，它将作为登录后所有页面的容器。
*   [x] **实现三栏式结构**：使用 Flexbox 或 Grid 布局，在 `AppLayout` 中划分出三列：服务器列表（左侧）、频道/内容区（中间）、用户信息/成员列表（右侧，此阶段可先占位）。
*   [x] **更新路由**: 将 `router/index.tsx` 中的占位符 `AppLayout` 替换为真实的组件引用。

**任务 2：获取并展示服务器列表**
*   [x] **创建`ServerList`组件**：在 `components/` 中创建服务器列表组件。
*   [x] **编写真实 API 调用**: 使用 TanStack Query 的 `useQuery` hook 调用 `GET /api/users/@me/servers` API 来获取用户拥有的服务器列表。
*   [x] **渲染列表**: 在 `ServerList` 组件中，将获取到的数据显示为服务器图标或名称的列表。

**任务 3：创建频道列表和用户面板**
*   [x] **创建`ChannelList`组件**：在中间栏的顶部创建频道列表组件。在此阶段，它可以是一个静态的占位符。
*   [x] **创建`UserPanel`组件**：在中间栏的底部创建用户面板，用于显示当前登录用户的头像和用户名。可以从 Zustand store (`useAuthStore`) 中获取用户信息。

**任务 4：实现占位符内容区**
*   [x] 在三栏布局的最右侧（主内容区），显示一个欢迎信息或占位符，例如 “请选择一个频道”。

---

### **第三阶段：实时消息体验（细节规划）**

这个阶段的重点是集成 WebSocket，让应用“活”起来。

**任务 1：建立并管理 WebSocket 连接**
*   [ ] **安装依赖**：执行 `pnpm -F frontend add socket.io-client`。
*   [ ] **创建 Socket 管理器**：在 `frontend/src/lib/` 目录下创建一个 `socket.ts` 文件，负责初始化和管理全局连接。
*   [ ] **实现认证连接**：确保连接时从 Zustand `authStore` 获取 JWT token 并放入 `auth` 选项中。
*   [ ] **创建 `SocketProvider`**：使用 React Context 封装 Socket 实例，方便在整个应用中共享和使用。
*   [ ] **集成 Provider**：将 `SocketProvider` 添加到 `AppLayout` 或更高的层级。

**任务 2：构建消息展示区 (MessageView)**
*   [ ] **创建 `MessageView` 组件**：创建 `frontend/src/components/message/MessageView.tsx`。
*   [ ] **获取初始消息**：使用 TanStack Query 的 `useInfiniteQuery` 来调用 API (`GET .../messages`) 获取初始消息。
*   [ ] **渲染消息**：将消息列表（包含用户头像、用户名、内容）渲染到界面上。

**任务 3：构建消息输入区 (MessageInput)**
*   [ ] **创建 `MessageInput` 组件**：创建 `frontend/src/components/message/MessageInput.tsx`。
*   [ ] **构建输入 UI**：包含一个输入框和发送按钮。
*   [ ] **实现发送逻辑**：通过 Socket.io 实例 `emit('message/create', ...)` 来发送新消息。

**任务 4：整合与实时事件处理**
*   [ ] **创建 `ChannelPage` 页面**：用于协调 `MessageView` 和 `MessageInput`。
*   [ ] **监听实时消息**：使用 `socket.on('message/create', ...)` 监听新消息事件。
*   [ ] **实时更新 UI**：收到新消息后，使用 `queryClient.setQueryData` 将其追加到本地缓存中，实现即时更新。

**任务 5：实现历史消息懒加载 (Infinite Scrolling)**
*   [ ] **利用 `useInfiniteQuery`**：使用 `fetchNextPage` 功能来加载更早的消息。
*   [ ] **设置滚动触发器**：在消息列表顶部放置一个监测元素。
*   [ ] **集成 `Intersection Observer`**：当用户向上滚动，监测元素进入视口时，调用 `fetchNextPage()` 加载历史数据。

**任务：建立 WebSocket 连接**

*   [ ] **安装 Socket.io 客户端**: `pnpm add socket.io-client`。
*   [ ] **创建 Socket 管理器**: 在 `lib/socket.ts` 或类似文件中，封装 Socket.io 的连接逻辑。
*   [ ] **关键：实现认证连接**：连接到后端 WebSocket (Socket.io) 服务时，**必须**在 `auth` 选项中提供 JWT token。否则连接将被拒绝。

    ```javascript
    // in lib/socket.ts
    import { io } from "socket.io-client";
    import { useAuthStore } from '../store/authStore'; // 假设的路径

    export const getSocket = () => {
      const token = useAuthStore.getState().token;

      if (!token) {
        throw new Error("No token found for WebSocket connection");
      }

      const socket = io("http://localhost:3000", { // 后端地址
        auth: {
          token: token
        }
      });

      return socket;
    };
    ```