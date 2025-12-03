# 前端重构规划文档

## 1. 架构愿景与目录树

我们将采用**功能驱动架构 (Feature-Based Architecture)**。基本原则是：**高内聚，低耦合**。一个功能相关的所有代码（组件、Hooks、类型、状态）都应该放在一起。

**目标目录结构：**

```text
src/
├── features/                 # 业务功能模块
│   ├── auth/                 # 认证 (登录/注册)
│   ├── chat/                 # 聊天核心 (消息流, 输入框, 成员列表)
│   ├── servers/              # 服务器管理 (列表, 设置, 邀请)
│   ├── channels/             # 频道管理 (列表, 设置, Webhooks)
│   └── users/                # 用户管理 (设置, 个人资料, 状态)
├── layout/                   # 全局布局与核心协调器
│   ├── modals/               # 模态框管理器和通用模态框
│   │   ├── GenericModal.tsx
│   │   └── ModalManager.tsx
│   └── Layout.tsx
├── shared/                   # 共享资源 (跨模块通用)
│   ├── components/           # 通用UI组件 (Buttons, Icons - 如果有的话)
│   ├── hooks/                # 通用Hooks (usePresence, useSocket)
│   ├── services/             # API 和 Socket 服务
│   ├── stores/               # Zustand 状态管理
│   └── types/                # 全局共享的类型定义
├── pages/                    # 页面入口 (App.tsx)
└── main.tsx
```

### **关于类型的重要原则 (Co-location is King)**

我们必须停止把 `types.ts` 当成一个垃圾场。
*   **`src/shared/types/`**: **只存放**真正全局共享的、定义核心业务模型的类型。比如 `User`, `Server`, `Channel`, `Message`。这些是应用的“名词”。
*   **组件内部**: 如果一个类型 (例如 `ChannelItemProps`) 只被一个组件使用，它**必须**定义在那个组件文件 (`ChannelItem.tsx`) 的内部。
*   **功能模块内部**: 如果一个类型被一个功能模块内的多个组件共享，但对模块外无用，可以创建 `src/features/channels/types.ts`。

---

## 2. 执行阶段 (Execution Phases)

### 阶段一：基础设施迁移 (Infrastructure Relocation)

**状态**：:heavy_check_mark: 已完成 (Commit: `21b2577`)

**结果**：所有核心基础设施（服务、状态、钩子、类型）已成功迁移到 `src/shared` 目录。所有导入路径已修复，并且项目构建成功。为后续的功能模块拆分奠定了坚实的基础。
**目标**：迁移底层服务和状态，并手动修正由此产生的地狱般 `../..` 相对路径。

*   **1.1** 创建 `src/shared/services`, `src/shared/stores`, `src/shared/hooks`, `src/shared/types` 目录。
*   **1.2** 移动 `api.ts`, `socket.ts` 到 `src/shared/services`。
*   **1.3** 移动 `store.ts`, `presenceStore.ts` 到 `src/shared/stores`。
*   **1.4** 移动所有通用 Hook (`usePresenceEvents`, `useSocketMessages` 等) 到 `src/shared/hooks`。
*   **1.5** 移动 `types.ts` 到 `src/shared/types/index.ts`。
*   **1.6** **路径修正**：这是你的痛苦时刻。用你的 IDE 全局搜索，把所有断裂的 import 路径（例如 `store.ts` 中对 `socket.ts` 的引用）修正为新的相对路径。

**代码检验 (Checkpoint 1)**：
*   运行 `npm run build` (或 `tsc --noEmit`)。在这一步，除了 “代码丑陋” 之外，不应该有任何编译错误。如果这里失败了，**绝对不要**进入下一阶段。

---

### 阶段二：功能模块拆分 (Feature Extraction)
我们将按照依赖关系，逐一建立功能模块。

#### 2.1 子任务：认证 (Auth Feature)
**状态**：:heavy_check_mark: 已完成 (Commit: `b87b324`)
**结果**：`Auth` 组件及其测试文件已成功迁移到 `src/features/auth` 模块下。所有相关的导入路径已更新，并且项目构建成功。
*   **操作**：建立 `src/features/auth/components`。
*   **迁移**：`src/components/auth/Auth.tsx` -> `src/features/auth/components/AuthScreen.tsx`。
*   **修正**：更新 `App.tsx` 中的引用。

**代码检验**：确认登录页可以正常渲染并通过了 `pnpm build`。

#### 2.2 子任务：用户领域 (User Feature)
**状态**：:heavy_check_mark: 已完成
**结果**：`User` 相关的组件和模态框已成功迁移到 `src/features/users` 模块下。所有相关的导入路径已更新，并且项目构建成功。
*   **操作**：建立 `src/features/users/components` 和 `src/features/users/modals`。
*   **迁移**：
    *   `UserSettings.tsx` -> `src/features/users/components/UserSettings.tsx`
    *   `UserStatusFooter.tsx` -> `src/features/users/components/UserStatusFooter.tsx`
    *   `UserProfileModal.tsx`, `FindUserModal.tsx` -> `src/features/users/modals/`。
*   **类型整理**: 检查这些组件的 `Props` 类型，如果它们在全局 `types.ts` 里，就把它们移到各自的 `.tsx` 文件中。
*   **修正**：修正 `Layout.tsx` 和其他地方对这些组件的引用。

**代码检验**：确认用户状态栏和用户设置页依然能从 `shared/stores` 获取数据。

#### 2.3 子任务：服务器领域 (Server Feature)
*   **操作**：建立 `src/features/servers/components` 和 `src/features/servers/modals`。
*   **迁移**：
    *   `ServerList.tsx` -> `src/features/servers/components/ServerList.tsx`
    *   `JoinServerModal`, `CreateInviteModal`, `ServerSettingsModal`, `KickUserModal` -> `src/features/servers/modals/`。
*   **修正**：更新 `Layout.tsx` 中的引用。

**代码检验**：点击服务器列表，确认功能正常。

#### 2.4 子任务：频道领域 (Channel Feature)
*   **操作**：建立 `src/features/channels/components` 和 `src/features/channels/modals`。
*   **迁移**：
    *   `ChannelList`, `ServerChannelList`, `DMChannelList`, `ChannelItem` -> `components/`。
    *   `ChannelSettingsModal`, `EditCategoryModal`, `WebhookManager` -> `modals/`。
*   **类型整理**: `ChannelItemProps` 应该在 `ChannelItem.tsx` 内部。检查并移动。
*   **修正**：`ServerChannelList` 会引用 `UserStatusFooter`，现在这是一个跨模块引用 (`../features/users/components/...`)，手动修复它。

**代码检验**：切换服务器和私信，确认频道列表能正确渲染。

#### 2.5 子任务：聊天领域 (Chat Feature)
*   **操作**：建立 `src/features/chat/components` 和 `src/features/chat/messages`。
*   **迁移**：
    *   `ChatArea`, `ChatHeader`, `MemberList` -> `components/`。
    *   `MessageList`, `MessageItem`, `MessageInput`, `EmojiPicker` 等消息相关组件 -> `messages/`。
*   **修正**：更新 `ChatArea` 内部的所有引用路径。

**代码检验**：进入一个频道，确认消息流、输入框、成员列表都能正常工作。

---

### 阶段三：模态框管理器重构 (Modal Manager Refactor)
**目标**：解决`ModalManager`的架构定位问题，避免**共享代码依赖业务代码**这种架构上的**原罪**。

*   **3.1** 创建 `src/layout/modals` 目录。
*   **3.2** 移动 `ModalManager.tsx` 和 `GenericModal.tsx` 到 `src/layout/modals/`。`ModalManager` 是应用布局的一部分，它负责协调（manage）各个功能的弹窗，而不是一个可被复用的“共享”（shared）组件。
*   **3.3** **大规模路径更新**：`ModalManager` 现在需要从各个 `features/*/modals` 目录导入具体的 Modal 组件。例如 `import { UserProfileModal } from '../../features/users/modals/UserProfileModal'`。

**代码检验 (Checkpoint 3)**：
*   打开所有类型的模态框（创建服务器、用户资料、频道设置等），确保 `ModalManager` 能在新的位置正确加载它们。

---

### 阶段四：清理与最终修正 (Cleanup & Final Fix)

*   **4.1** 删除所有空的旧目录，尤其是 `src/components`。
*   **4.2** **最终类型审查**: 最后一次检查 `src/shared/types/index.ts`，把所有不该是全局的类型（比如组件的 Props）全部移到它们应该在的地方（Co-location）。
*   **4.3** 全局搜索 `..`，确保没有因为手误写错的相对路径。

**最终代码检验**：
*   运行 `npm run lint`：修复所有路径和未使用的导入错误。
*   运行 `npm run build`：确保最终的 TypeScript 编译能够通过。
