### 私聊（DM）功能实现任务规划

当前项目后端已具备创建私聊（DM）频道的能力，但前端缺少发起和管理私聊的完整流程。以下是详细的实现规划：

#### 目标
实现一个完整的私聊功能闭环：用户可以搜索并找到其他用户，发起一对一聊天，并在私聊列表中管理所有会话。

#### 任务分解

##### **阶段一：后端确认与增强 (Backend Check & Enhancement)**

1.  **[确认] API 完备性**:
    *   核对 `POST /api/users/@me/channels` 接口。当前实现是：接收 `recipientId`，如果 DM 已存在则返回，不存在则创建新 DM 并返回。此功能已满足需求。
    *   核对 `GET /api/users/@me/channels` 接口。当前实现是：返回当前用户的所有 DM 频道列表，并填充（populate）了 `recipients` 字段的用户信息。此功能已满足需求。

2.  **[新增] 实时事件广播**:
    *   在 `channel.service.ts` 的 `createDmChannel` 函数中，当**新创建**一个 DM 频道时，需要向**接收方（recipient）**的用户房间（`userId` room）广播一个事件。
    *   **建议事件**: `DM_CHANNEL_CREATE`。
    *   **事件载荷 (Payload)**: 完整的、已填充好 `recipients` 信息的频道对象 (Channel Object)。
    *   **目的**: 确保当用户 A 向用户 B 发起私聊时，如果用户 B 在线，其客户端能立即收到通知并动态地在 DM 列表中添加这个新的会话，无需刷新。

##### **阶段二：前端功能实现 (Frontend Implementation)**

1.  **[核心] 发起私聊入口**:
    *   **任务**: 改造 `FindUserModal.tsx` (`findUser` 模态框)。
    *   **逻辑**: 当前该模态框已能搜索用户并展示列表。需要修改点击用户条目的行为。
    *   **步骤**:
        *   当用户点击搜索结果中的某个用户时，调用 `channelApi.createDM(recipientId)`。
        *   在 API 请求期间，可以给被点击的用户条目设置一个加载状态（loading state），防止重复点击。
        *   API 请求成功后，获得返回的频道对象。
        *   调用 Zustand 的 `useUIStore.setCurrentServer(null)` 切换到 DM 视图。
        *   调用 `useUIStore.setCurrentChannel(channel._id)` 将新创建或已有的 DM 频道设为当前活动频道。
        *   调用 TanStack Query 的 `queryClient.invalidateQueries({ queryKey: ['dmChannels'] })` 来刷新左侧的 DM 列表。
        *   最后，关闭模态框 `closeModal()`。

2.  **[完善] 用户资料卡入口**:
    *   **任务**: 改造 `UserProfileModal.tsx` (`userProfile` 模态框)。
    *   **逻辑**: 在用户资料卡中提供一个直接发起私聊的按钮。
    *   **步骤**:
        *   在模态框中添加一个 "Send Message" 按钮。
        *   该按钮的点击逻辑与上述 `FindUserModal` 的点击逻辑完全相同：调用 `createDM` API，然后切换视图并关闭模态框。

3.  **[完善] UI 显示**:
    *   **任务**: 改造 `ChatHeader.tsx` 以适应 DM 场景。
    *   **逻辑**: 当处于 DM 频道时，聊天区域的头部应显示对方的用户名和在线状态，而非频道名。
    *   **步骤**:
        *   在 `ChatArea.tsx` 中，当 `currentServerId` 为 `null` 时，获取当前 DM 频道的详细信息（`recipients` 数组）。
        *   从 `recipients` 数组中找出**非当前登录用户**的那个用户对象。
        *   将这个“对方用户”对象传递给 `ChatHeader` 组件。
        *   `ChatHeader` 组件根据接收到的用户对象，显示其用户名、头像（未来）和在线状态，并隐藏服务器频道特有的图标（如 `#`）。

4.  **[核心] 实时接收新私聊**:
    *   **任务**: 创建一个新的自定义 Hook，例如 `useDmEvents.ts`，或在现有事件处理逻辑中添加。
    *   **逻辑**: 监听后端在阶段一新增的 `DM_CHANNEL_CREATE` WebSocket 事件。
    *   **步骤**:
        *   在 Hook 中，使用 `useEffect` 监听 socket 连接。
        *   注册 `socket.on('DM_CHANNEL_CREATE', handler)` 监听器。
        *   当接收到新频道对象时，使用 `queryClient.setQueryData` 或 `invalidateQueries` 来更新 `['dmChannels']` 的缓存，使新会话自动出现在左侧列表中。
        *   可以考虑在接收到新 DM 时，如果用户不在该频道，显示一个未读提示。