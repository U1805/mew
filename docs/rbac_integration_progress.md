# RBAC 前端集成进度追踪

本文档用于追踪将前端与新的 RBAC（基于角色的访问控制）系统集成的进度。

---

### 文件: `frontend/src/features/auth/components/AuthScreen.test.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是认证屏幕的单元测试。它的职责是验证登录和注册流程本身。新的权限系统不影响登录流程，仅影响用户登录后可以执行的操作。因此，该文件无需修改。

---

### 文件: `frontend/src/features/auth/components/AuthScreen.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是认证屏幕的 UI 组件。它的职责是调用认证 API 并处理结果。新的权限系统在用户登录后才生效，不影响此组件的功能。

---

### 文件: `ChannelItem.tsx` and `ChannelItem.test.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  **创建了 `frontend/src/shared/hooks/usePermissions.ts`**: 新增一个自定义 hook，用于从 React Query 缓存中获取并返回当前用户在特定频道中的有效权限集合。
    2.  **更新了 `ChannelItem.tsx`**: 在组件内部调用了新的 `usePermissions` hook。现在，“设置”图标的显示逻辑取决于用户是否拥有 `MANAGE_CHANNEL` 权限，而不仅仅是 prop 是否传入。
    3.  **更新了 `ChannelItem.test.tsx`**: 为 `usePermissions` hook 添加了 mock，并增加了两个新的测试用例，分别验证在有和没有 `MANAGE_CHANNEL` 权限的情况下，“设置”图标的显示/隐藏行为是否符合预期。
*   **原因**: 这是权限系统在前端的第一个实际应用。通过 `usePermissions` hook，我们将权限检查的逻辑集中化，并使组件（如 `ChannelItem`）能够显式地根据权限来渲染其 UI，确保了界面的行为与用户的权限严格匹配。

---

### 文件: `frontend/src/features/chat/messages/MessageInput.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  **更新 `frontend/src/shared/types/index.ts`**: 为 `Channel` 接口添加了可选的 `permissions?: string[]` 字段，以匹配后端 API 的响应。
    2.  在 `MessageInput.tsx` 组件中，增加了一个 `canSendMessage` 变量，该变量通过检查 `channel.permissions` 数组是否包含 `SEND_MESSAGES` 来确定。
    3.  将 `input` 元素的 `disabled` 属性与 `!canSendMessage` 绑定。
    4.  根据 `canSendMessage` 的值，动态设置 `placeholder` 的文本，以在用户无权限时提供明确反馈。
*   **原因**: 此组件之前没有进行权限检查。更新后，它现在能够根据从父组件传入的有效权限列表，动态地启用或禁用消息输入功能，符合 RBAC 系统的设计要求。

---

### 文件: `ChannelList.tsx`, `DMChannelList.tsx`, and `ServerChannelList.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已更新** (`ServerChannelList.tsx`)
*   **更新内容**:
    1.  **创建了 `frontend/src/shared/hooks/useServerPermissions.ts`**: 新增一个 hook，用于从 React Query 缓存中计算并返回当前用户在当前服务器的有效权限集合。
    2.  **更新了 `ServerChannelList.tsx`**:
        *   移除了所有基于旧的、不准确的 `isOwner` 标志的权限检查。
        *   在组件中调用新的 `useServerPermissions` hook，并基于返回的权限 (`CREATE_INSTANT_INVITE`, `MANAGE_CHANNEL`, `MANAGE_SERVER`) 来控制服务器下拉菜单项和分类操作图标的显示。
        *   简化了对 `ChannelItem` 的 `onSettingsClick` prop 的传递，移除了冗余的权限判断。
    3.  **`ChannelList.tsx` 和 `DMChannelList.tsx`**: 无需更新，因为前者是简单的路由，后者处理的私信不涉及复杂的 RBAC。
*   **原因**: 此更新将服务器级别的操作（如创建频道/邀请/管理服务器）与新的 RBAC 系统正确地集成在一起，确保了 UI 的一致性和安全性。

---

### 文件: `frontend/src/features/channels/modals/ChannelSettingsModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已集成** ✅
*   **更新内容**:
    1.  **API 函数**: 在 `shared/services/api.ts` 中添加了 `channelApi.getPermissionOverrides`, `channelApi.updatePermissionOverrides`, 和 `serverApi.getRoles`。
    2.  **移除模拟数据**: 完全移除了之前用于驱动 UI 的 `overrides` 模拟状态。
    3.  **数据获取**: 使用 `useQuery` 并行获取了真实的权限覆盖规则、服务器角色列表和成员列表。
    4.  **数据整合**: 使用 `useMemo` 将多个数据源整合成一个丰富的 `displayOverrides` 模型，供 UI 渲染。
    5.  **状态管理**: 用户的权限修改现在被保存在 `localOverrides` 本地状态中。
    6.  **保存逻辑**: 实现了 `handleSave` 函数和 `useMutation`，用于将本地更改提交到后端。成功后会自动刷新数据。
    7.  **UI 绑定**: 将整个权限选项卡的 JSX 与新的数据模型和处理函数完全绑定，并添加了加载和保存中的状态显示。

---

### 文件: `frontend/src/features/channels/modals/EditCategoryModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于编辑频道分类。根据 API 文档，修改分类需要 `MANAGE_CHANNEL` 权限。这个权限检查完全由后端 API 负责。前端组件本身无需进行权限检查，其现有逻辑是正确的。一个可以做的优化是在打开此模态框的按钮上使用 `useServerPermissions` hook 进行权限检查，但这已在 `ServerChannelList.tsx` 的更新中完成。

---

### 文件: `frontend/src/features/channels/modals/WebhookManager.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已集成** ✅ (通过父组件 `ChannelSettingsModal.tsx`)
*   **更新内容**:
    1.  在父组件 `ChannelSettingsModal.tsx` 中导入并调用了 `usePermissions` hook。
    2.  基于用户是否拥有 `MANAGE_WEBHOOKS` 权限，条件性地渲染了 "Integrations" 选项卡和 `WebhookManager` 组件本身。
*   **原因**: 此更改修复了一个安全漏洞，确保了只有拥有相应权限的用户才能看到和访问 Webhook 管理功能。通过在父组件中进行权限检查，我们避免了修改 `WebhookManager.tsx` 内部逻辑，简化了实现。

---

### 文件: `frontend/src/features/chat/components/ChatArea.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是聊天区域的主体框架，其本身不执行任何需要权限检查的操作。它正确地获取了包含权限信息的频道数据，并将其传递给各个子组件 (`ChatHeader`, `MessageList`, `MessageInput`)。权限检查的责任被正确地委派给了这些子组件。

---

### 文件: `frontend/src/features/chat/components/ChatHeader.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个纯展示性组件，负责显示频道名称等信息。它包含的按钮（如成员列表开关、搜索）的显示逻辑与权限无关，或者权限检查被正确地委托给了子组件。组件中一些未来的功能（如钉选消息）目前尚未实现，因此无需添加权限检查。

---

### 文件: `frontend/src/features/chat/components/MemberList.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已集成** ✅
*   **更新内容**:
    1.  **API 更新**: 在 `api.ts` 中创建了独立的 `memberApi` 用于角色更新和踢人操作。
    2.  **组件拆分**: 将 `MemberList` 分解为 `MemberList`, `MemberGroup`, `MemberItem`,和 `MemberContextMenu`，提高了可维护性。
    3.  **动态分组与排序**: 成员列表现在根据其最高角色的 `position` 来进行分组和排序，而不是之前固定的“所有者”分组。
    4.  **真实数据**: 使用 `useQuery` 获取真实的服务器角色列表，完全取代了 `MOCK_ROLES`。
    5.  **精确权限控制**: 右键菜单的功能（踢人、角色管理）现在严格依赖于用户的 `KICK_MEMBERS` 和 `MANAGE_ROLES` 权限，并结合了角色**层级检查**，确保了操作的合法性。
    6.  **角色分配实现**: 实现了通过右键菜单调用 API 来为成员动态分配角色的功能。
*   **原因**: 此次重构使成员列表完全与新的 RBAC 系统集成，确保了成员管理操作的安全性和准确性。

---

### 文件: `frontend/src/features/chat/messages/EmojiPicker.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个纯粹的、无状态的 UI 组件，用于显示和选择表情符号。权限检查（`ADD_REACTIONS`）的责任在于其父组件，父组件应根据权限来决定是否渲染用于打开此选择器的按钮。

---

### 文件: `frontend/src/features/chat/messages/MessageContent.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个纯粹的“视图”组件，负责根据消息的 `type` 渲染不同的 UI。它本身不执行任何需要权限检查的操作。用户是否有权发送特定类型的消息，应在发送环节进行检查。

---

### 文件: `frontend/src/features/chat/messages/MessageEditor.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于编辑消息。根据 API 文档，编辑消息需要是消息作者，此权限检查完全由后端 API 负责。`MessageEditor` 组件本身无需进行权限检查，其现有逻辑是正确的。是否显示“编辑”按钮的逻辑由父组件 `MessageItem` 负责。

---

### 文件: `frontend/src/features/chat/messages/MessageItem.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  在组件中导入并调用了 `usePermissions` hook。
    2.  创建了 `canAddReaction` 和 `canManageMessages` 变量。
    3.  “添加反应”按钮的显示现在依赖于 `canAddReaction` 权限。
    4.  “删除”按钮的显示现在依赖于 `isAuthor || canManageMessages`，即用户是作者或拥有 `MANAGE_MESSAGES` 权限。
*   **原因**: 此更新将消息级别的操作（添加反应、删除）与 RBAC 系统正确集成，确保了只有授权用户才能看到相应的操作按钮。

---

### 文件: `frontend/src/features/chat/messages/MessageList.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件的主要职责是渲染 `MessageItem` 列表。它本身不执行任何受权限控制的操作，并且正确地将权限检查的责任委派给了子组件 `MessageItem` 和 `MessageInput` (它们已经被更新)。

---

### 文件: `frontend/src/features/chat/messages/ReactionList.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个纯粹的“视图”组件，负责渲染表情反应列表。它将点击事件的处理委托给其父组件 `MessageItem`，权限检查的责任也由 `MessageItem` (已更新) 承担。

---

### 文件: `frontend/src/features/search/components/SearchResultItem.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是一个纯展示性 (Presentational) 组件，仅负责渲染传递给它的 `message` 对象。它不执行任何数据获取或需要权限检查的操作。权限检查的责任在上层组件（例如 `SearchModal`）中完成。

---

### 文件: `frontend/src/features/search/components/SearchResultsPanel.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  在渲染搜索结果前，增加了一个 `.filter()` 操作。
    2.  该过滤器会利用已缓存的、经权限过滤的频道列表，确保只显示用户有权查看的频道中的消息。
*   **原因**: 此更新增加了一层前端的安全保障，防止因缓存或逻辑疏忽而向用户展示了他们无权查看的频道的搜索结果。

---

### 文件: `frontend/src/features/servers/components/ServerList.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于显示用户已加入的服务器列表。它通过 `serverApi.list()` 和 `channelApi.list()` 获取数据，这两个 API 的响应在后端已经根据用户的成员身份和 `VIEW_CHANNEL` 权限进行了过滤。因此，该组件的现有逻辑是正确的，无需进行额外的权限检查。

---

### 文件: `frontend/src/features/servers/modals/CreateInviteModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于创建邀请链接。根据 API 文档，这需要 `CREATE_INSTANT_INVITE` 权限，该权限检查完全由后端 API 负责。打开此模态框的按钮的显示逻辑已在 `ServerChannelList.tsx` 中通过 `useServerPermissions` hook 进行了正确的权限控制。因此，此组件本身无需修改。

---

### 文件: `frontend/src/features/servers/modals/JoinServerModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于加入服务器。这是一个用户级别的操作，不涉及服务器内部的 RBAC 权限。加入逻辑（如邀请码是否有效）完全由后端 API 处理。因此，此组件无需修改。

---

### 文件: `frontend/src/features/servers/modals/KickUserModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于确认踢出用户。根据 API 文档，这需要 `KICK_MEMBERS` 权限和层级检查，这些都由后端 API 负责。打开此模态框的菜单项的显示逻辑已在 `MemberList.tsx` 中进行了正确的权限控制。因此，此组件本身无需修改。

---

### 文件: `frontend/src/features/servers/modals/ServerSettingsModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: **已集成** ✅
*   **更新内容**:
    1.  **API 函数**: 在 `shared/services/api.ts` 中创建了完整的 `roleApi` 对象。
    2.  **移除模拟数据**: 完全移除了 `MOCK_PERMISSIONS` 和硬编码的角色 `useState`。
    3.  **数据获取**: 使用 `useQuery` 从后端获取真实的服务器角色列表。
    4.  **状态管理**: 实现了一个“本地-远程”同步模式。用户的所有修改（创建、更新、删除）都先在 `localRoles` 状态中进行。一个 `useEffect` 会比较 `localRoles` 和原始的 `serverRoles`，只有在存在差异时，才显示“保存/重置”栏。
    5.  **批量保存**: 实现了一个 `saveMutation`，它会智能地计算出本地与远程状态之间的差异（哪些是新增的、哪些是修改的、哪些是删除了的），然后一次性将所有更改分批发送到后端 API。这极大地提高了效率和原子性。
    6.  **UI 绑定**: 将整个角色管理 UI 与新的数据流和状态管理逻辑完全绑定。
*   **原因**: 此次大规模重构使服务器角色管理功能完全与后端 RBAC 系统集成，实现了从数据获取、编辑到保存的完整闭环，并提供了良好的用户体验（如“有未保存的更改”提示）。

---

### 文件: `frontend/src/features/users/components/UserSettings.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是用户个人设置界面。它处理的是用户自己的账户信息，这些操作独立于任何服务器，不受 RBAC 系统的影响。

---

### 文件: `frontend/src/features/users/components/UserStatusFooter.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件负责显示全局的用户状态和个人设置入口。这些功能独立于任何服务器的 RBAC 权限系统，因此无需修改。

---

### 文件: `frontend/src/features/users/modals/FindUserModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于查找用户并发起私聊 (DM)。这是一个用户级别的操作，不涉及服务器内部的 RBAC 权限，因此无需修改。

---

### 文件: `frontend/src/features/users/modals/UserProfileModal.tsx`
*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件用于显示用户的个人资料卡片，并提供发起私聊的快捷方式。这是一个用户级别的、全局的功能，独立于任何服务器的 RBAC 权限系统，因此无需修改。

---

### 文件: `frontend/src/layout/Layout.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是应用的主布局，负责编排核心子组件。它不执行任何受权限控制的操作，并将权限检查的责任正确地委派给了它的子组件。

---

### 文件: `frontend/src/layout/modals/GenericModal.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个通用的模态框，用于处理多种创建和删除操作。权限检查的责任完全在于触发此模态框的UI元素（如按钮、菜单项），而不在于模态框本身。由于触发点已在之前的步骤中被正确地进行了权限控制，此组件无需修改。

---

### 文件: `frontend/src/layout/modals/ModalManager.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此组件是一个“模态框路由器”，其唯一职责是根据全局状态 `activeModal` 的值来渲染相应的模态框组件。它不执行任何业务逻辑，权限检查的责任被正确地委派给了具体的模态框组件及其触发点。

---

### 文件: `frontend/src/mocks/handlers.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新 (暂时)
*   **原因**: 此文件用于在测试中模拟 API。它本身不包含业务逻辑。但是，当我们开始为与 RBAC 相关的组件编写或更新测试时，需要回到此文件添加新的处理程序来模拟权限相关的 API 响应。这是一个辅助文件，将在未来根据需要进行更新。

---

### 文件: `frontend/src/mocks/server.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是 `msw` 模拟服务器的配置文件，用于 Vitest 测试环境。它仅导入在 `handlers.ts` 中定义的处理程序，不包含任何业务或测试逻辑。此文件本身不受 RBAC 集成的影响。

---

### 文件: `frontend/src/shared/hooks/useDmEvents.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此 hook 用于处理私信 (DM) 相关的 WebSocket 事件。私信功能独立于服务器的 RBAC 权限系统，因此该文件无需修改。

---

### 文件: `frontend/src/shared/hooks/useMessages.ts` and `useMessages.test.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: `useMessages.ts` hook 负责获取消息列表。根据 API 文档，该 API 端点在后端已强制执行 `VIEW_CHANNEL` 权限检查。因此，该 hook 依赖于后端的权限控制，其本身无需修改。其测试文件也无需更新。

---

### 文件: `frontend/src/shared/hooks/usePresenceEvents.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此 hook 专门用于处理在线状态 (Presence) 相关的 WebSocket 事件。在线状态是一个全局功能，独立于服务器的 RBAC 权限系统。

---

### 文件: `frontend/src/shared/hooks/useServerEvents.ts`

*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  增加了对 `PERMISSIONS_UPDATE` WebSocket 事件的监听。
    2.  当此事件触发时，会批量使所有依赖权限的数据缓存失效，包括 'roles', 'members', 'channels', 和 'permissionOverrides'。
*   **原因**: 此更新确保了当任何权限相关的变更发生时，前端能够自动、可靠地重新获取所有相关数据，保证了 UI 状态与后端状态的最终一致性。

---

### 文件: `frontend/src/shared/hooks/useSocketMessages.ts` and `useSocketMessages.test.tsx`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此 hook 及其测试文件负责处理消息相关的 WebSocket 事件并更新缓存。它不执行任何权限检查，而是依赖于后端来决定是否广播事件。因此，它们不受 RBAC 集成的影响。

---

### 文件: `frontend/src/shared/services/api.ts`

*   **更新日期**: 2025-12-08
*   **状态**: **已重构**
*   **更新内容**:
    1.  移除了重复的 `memberApi` 对象定义。
    2.  将 `serverApi` 中冗余的 `getMembers` 和 `getRoles` 函数移除。
    3.  将获取成员列表的函数 (`list`) 整合到统一的 `memberApi` 对象中。
    4.  重新组织了 API 对象的顺序，使其更符合逻辑。
*   **原因**: 这是一个必要的代码健康和重构步骤。之前的快速迭代导致了代码重复和结构混乱。此次重构统一了API服务的定义，提高了代码的可读性和可维护性，为后续开发奠定了坚实的基础。

---

### 文件: `frontend/src/shared/services/socket.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件负责管理全局唯一的 Socket.IO 客户端实例，包括其连接、认证和断开逻辑。它属于基础架构层，不直接处理任何业务或权限相关的事件，这些职责被委派给了相应的 hooks (如 `useServerEvents.ts`)。因此，该文件无需修改。

---

### 文件: `frontend/src/shared/stores/presenceStore.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此 Zustand store 专门用于管理和存储用户的在线状态。这是一个独立于 RBAC 权限系统的功能。因此，该文件无需修改。

---

### 文件: `frontend/src/shared/stores/store.test.ts` 和 `frontend/src/shared/stores/store.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 这些文件是 `Zustand` store 及其单元测试。它们是纯粹的状态容器和 action 集合，不包含任何业务逻辑或权限检查。权限检查的责任被正确地委派给了使用这些 store 的 React 组件或 hooks。

---

### 文件: `frontend/src/shared/types/index.ts`

*   **更新日期**: 2025-12-08
*   **状态**: **已更新**
*   **更新内容**:
    1.  **创建了 `frontend/src/shared/constants/permissions.ts`**: 创建了一个新的共享文件，其中包含从后端复制的 `Permission` 类型和 `ALL_PERMISSIONS` 常量。
    2.  **更新了 `index.ts`**: 在文件顶部导入了 `Permission` 类型。
    3.  将 `Role` 接口中的 `permissions` 字段类型从 `string[]` 更改为 `Permission[]`，以提高类型安全和代码可读性。
*   **原因**: 此更新确保了前端的权限相关类型定义与后端严格一致，并通过共享常量避免了“魔法字符串”的使用。

---

### 文件: `backend/src/test/setup.ts`

*   **更新日期**: 2025-12-08
*   **状态**: 无需更新
*   **原因**: 此文件是后端 `vitest` 测试环境的全局配置文件，负责在测试开始前启动内存数据库并在测试后清理数据。它属于测试基础架构，不包含任何与 RBAC 相关的业务逻辑，因此无需修改。

---

## 最终总结

所有前端文件的审查和与 RBAC 系统相关的核心集成工作已经**全部完成**。关键的 UI 组件现在已与权限系统挂钩，并能根据用户的权限动态渲染。我们还更新了类型定义、API 服务和 WebSocket 事件监听器，以完全支持新的权限模型。每一步的决策和更改都已在本文档中详细记录。

### Backlog 任务: `handleAddOverride`

*   **状态**: **已完成** ✅
*   **实现**:
    1.  **创建了 `PermissionTargetSelector.tsx`**: 一个可重用的组件，用于显示和搜索可供选择的角色和成员列表，并自动过滤掉已存在的条目。
    2.  **创建了 `AddPermissionOverrideModal.tsx`**: 一个包裹 `PermissionTargetSelector` 的新模态框。
    3.  **集成了 `ChannelSettingsModal.tsx`**: 更新了 `handleAddOverride` 函数，使其能够打开新模态框，并通过回调函数处理用户的选择，动态地在 UI 上添加新的权限覆盖规则，并自动选中以便用户进行编辑。
    4.  **注册了 `ModalManager.tsx`**: 确保了 `openModal('addPermissionOverride', ...)` 调用能够被正确处理。