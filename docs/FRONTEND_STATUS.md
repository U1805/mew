### **前端开发总体任务规划 (v2 - 已与后端同步)**

**最后更新时间: 2025-11-28**

现在，让我们基于这个强大的后端，规划前端的开发蓝图。我们可以将整个过程分为几个大的阶段性任务（Epics）：

**第一阶段：奠定基础与用户认证 (Foundation & Authentication)**
*   **目标**：搭建好前端项目骨架，实现用户注册和登录功能，并建立起与后端通信的桥梁。用户可以登录并保持登录状态。
*   **关键产出**：可运行的前端应用、登录/注册页面、受保护的路由、全局状态管理。

**第二阶段：核心布局与数据展示 (Core Layout & Data Display)**
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

### **第一阶段：奠定基础与用户认证（细节规划）**

现在，我们来详细规划第一阶段的具体步骤。这是构建整个应用大厦的地基。

**任务 1：项目初始化与环境配置**
*   [ ] **安装依赖**：进入 `frontend` 目录，执行 `pnpm install`。
*   [ ] **配置环境变量**：创建 `.env.local` 文件，并添加 `VITE_API_BASE_URL=http://localhost:3000/api`。
*   [ ] **建立目录结构**：在 `src` 目录下，创建以下文件夹：`components/`, `pages/`, `lib/` (或 `services/`), `store/`, `hooks/`, `types/`, `router/`。

**任务 2：创建 API 客户端**
*   [ ] **封装 API 实例**：在 `lib/api.ts` 中，使用 `axios` 创建一个 API 客户端实例。
    *   配置 `baseURL`，使其读取 `VITE_API_BASE_URL`。
    *   **关键**：设置一个请求拦截器（Request Interceptor）。这个拦截器的作用是在每次发送请求前，从状态管理（Zustand store）中读取 token，并将其添加到 `Authorization` 请求头中 (`Bearer ${token}`)。

**任务 3：设置全局状态管理 (Zustand)**
*   [ ] **创建认证 Store**：在 `store/authStore.ts` 中创建一个 Zustand store。
    *   **State**: `user` (用户信息对象 | null), `token` (string | null)。
    *   **Actions**: `setToken(token)`, `setUser(user)`, `logout()`。
    *   **持久化**: 使用 Zustand 的 `persist` 中间件，将 `user` 和 `token` 存储在 `localStorage` 中。
    *   `logout` action 会清空 state 和 localStorage，并触发重定向。

**任务 4：配置应用路由 (React Router)**
*   [ ] **安装 React Router**：`pnpm add react-router-dom`。
*   [ ] **创建路由配置**：在 `router/index.tsx` 中配置应用的路由 (`/login`, `/register`, `/app`)。
*   [ ] **实现受保护的路由 (`ProtectedRoute`)**：检查用户是否已登录，否则重定向到 `/login`。
*   [ ] **整合路由**: 在 `App.tsx` 中，使用 `RouterProvider` 来启动整个路由系统。

**任务 5：构建登录与注册页面**
*   [ ] **创建表单组件**：在 `components/ui/` 中创建基础的 `Input`, `Button`, `Label` 组件。
*   [ ] **构建页面 UI**：在 `pages/` 中创建 `LoginPage.tsx` 和 `RegisterPage.tsx`。
*   [ ] **集成数据请求 (TanStack Query)**：
    *   在 `main.tsx` 中用 `QueryClientProvider` 包裹整个应用。
    *   在登录/注册页面中，使用 `useMutation` hook 来处理 API 调用。
    *   **关键：修正登录流程 (`onSuccess` 回调)**:
        1.  **第一步**: 调用后端 `POST /api/auth/login`，从响应中获取 `token`。
        2.  调用 `authStore` 的 `setToken(token)` action 保存 token。
        3.  **第二步**: **立即**使用新获取的 token 调用 API 客户端，请求 `GET /api/users/@me` 以获取用户信息。
        4.  拿到用户信息后，调用 `authStore` 的 `setUser(user)` action 保存用户信息。
        5.  使用 `react-router-dom` 的 `useNavigate` hook 跳转到 `/app` 页面。
    *   `onError` 回调中，获取并展示错误信息。

---

### **第三阶段：实时消息体验（技术细节）**

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
完成以上所有步骤后，我们就拥有了一个功能完整、且与后端实现完全匹配的认证流程和一个可以继续向内填充的主应用框架。