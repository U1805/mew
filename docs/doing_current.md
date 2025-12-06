### **第一阶段：后端模型与基础逻辑 (Backend Foundation)**

**目标：** 建立支持新权限系统所需的所有数据结构，并确保核心业务（如服务器创建）能正确初始化这些结构。

-   **任务 1.1：定义权限并创建 `Role` 模型**
    -   **动作:**
        1.  在 `backend/src/constants/` 目录下创建 `permissions.ts`，定义所有权限常量。
        2.  创建 `backend/src/api/role/role.model.ts`，定义 `Role` 的 Mongoose Schema。
    -   **验证:**
        -   编写一个 Vitest 单元测试，直接使用 `Role` 模型在内存数据库中创建一个文档，然后读取并断言其字段符合预期。

-   **任务 1.2：改造 `ServerMember` 和 `Server` 模型**
    -   **动作:**
        1.  修改 `serverMember.model.ts`，移除旧的 `role` 字段，添加 `roleIds` (ObjectId 数组) 和 `isOwner` (Boolean) 字段。
        2.  修改 `server.model.ts`，添加 `everyoneRoleId` (ObjectId) 字段。
    -   **验证:**
        -   更新相关的单元测试。确保可以成功创建一个 `ServerMember` 并为其 `roleIds` 数组添加一个有效的 ObjectId。

-   **任务 1.3：为 `Channel` 模型添加权限覆盖结构**
    -   **动作:**
        1.  修改 `channel.model.ts`，添加 `permissionOverrides` 字段，其类型为一个包含 `targetType`, `targetId`, `allow`, `deny` 的子文档数组。
    -   **验证:**
        -   编写 Vitest 单元测试，创建一个 `Channel`，向其 `permissionOverrides` 数组中 push 一个覆盖对象，保存并重新读取，断言数据结构正确。

-   **任务 1.4：集成至“创建服务器”流程**
    -   **动作:**
        1.  修改 `server.service.ts` 中的 `createServer` 函数。
        2.  在创建服务器后，紧接着：
            a. 创建一个默认的 `@everyone` 角色。
            b. 将该角色的 ID存入服务器的 `everyoneRoleId` 字段。
            c. 将创建者的 `ServerMember` 记录中的 `isOwner` 字段设置为 `true`。
    -   **验证:**
        -   编写一个 Supertest 集成测试。调用 `POST /api/servers` 创建服务器。测试结束后，直接查询内存数据库，验证是否同时正确创建了 `Server`、`@everyone` `Role` 以及 `isOwner` 为 `true` 的 `ServerMember`。

-   **任务 1.5：集成至“成员加入”与“数据清理”流程**
    -   **动作:**
        1.  修改 `invite.service.ts` 中的 `acceptInvite`。新成员加入时，自动将其服务器的 `@everyone` 角色 ID 添加到其 `ServerMember` 的 `roleIds` 数组中。
        2.  在 `server.service.ts`、`role.service.ts` (新建)、`member.service.ts` 中实现级联删除逻辑，确保删除服务器、角色或成员时，相关的权限数据（`roleIds`, `permissionOverrides`）被清理干净。
    -   **验证:**
        -   **加入验证:** 编写集成测试，让一个新用户接受邀请，然后查询该用户的 `ServerMember` 记录，断言其 `roleIds` 包含 `@everyone` 角色 ID。
        -   **清理验证:** 为每个删除场景编写集成测试。例如，创建一个带角色的服务器，然后删除该角色，验证所有成员的 `roleIds` 和频道的 `permissionOverrides` 中该角色 ID 已被移除。

---

### **第二阶段：后端 API 开发 (Backend API)**

**目标：** 暴露用于管理新模型的 API 端点，并开始引入基础的权限检查。

-   **任务 2.1：实现角色管理的 CRUD API**
    -   **动作:**
        1.  创建 `role.routes.ts`、`role.controller.ts` 和 `role.service.ts`。
        2.  实现 `POST /`, `GET /`, `PATCH /:roleId`, `DELETE /:roleId` 端点。
        3.  **初步权限:** 暂时只检查请求者是否为 `isOwner`。
        4.  在 `DELETE` 逻辑中，明确禁止删除 `@everyone` 角色。
    -   **验证:**
        -   为每个端点编写 Supertest 集成测试。测试创建、获取、更新、删除角色的完整流程，并专门测试删除 `@everyone` 角色时是否返回 403 或 400 错误。

-   **任务 2.2：实现成员角色分配 API**
    -   **动作:**
        1.  在 `member.routes.ts` 中添加 `PUT /:userId/roles` 端点。
        2.  实现其 `controller` 和 `service` 逻辑，用请求体中的 `roleIds` 数组替换成员的 `roleIds`。
    -   **验证:**
        -   编写 Supertest 集成测试。创建一个成员和几个角色，调用此 API 为其分配角色，然后查询数据库验证其 `ServerMember.roleIds` 是否已正确更新。

-   **任务 2.3：实现频道权限覆盖 API**
    -   **动作:**
        1.  在 `channel.routes.ts` 中添加 `GET /:channelId/permissions` 和 `PUT /:channelId/permissions` 端点。
        2.  实现其 `controller` 和 `service` 逻辑。
    -   **验证:**
        -   编写 Supertest 集成测试。创建一个频道，`PUT` 一些权限覆盖规则，然后 `GET` 这些规则，断言返回的数据与之前发送的一致。

-   **任务 2.4：实现高级 API 安全校验**
    -   **动作:**
        1.  回到 `role.service.ts` 和 `member.service.ts`，为所有写操作添加**角色层级校验**逻辑：操作者的最高角色 `position` 必须高于目标角色/成员。
        2.  在 `channel.service.ts` 中为 `PUT /.../permissions` 实现**自我锁定防护**逻辑。
    -   **验证:**
        -   编写专门的**失败场景**集成测试。例如，测试一个低级角色管理员尝试修改高级角色时，API 是否返回 403 Forbidden。测试一个管理员移除自己 `MANAGE_CHANNEL` 权限时，API 是否返回错误。

---

### **第三阶段：权限计算与应用 (Permission Enforcement)**

**目标：** 实现权限计算的核心逻辑，并将其作为中间件应用到现有系统中。

-   **任务 3.1：构建权限计算器并进行单元测试**
    -   **动作:**
        1.  创建 `backend/src/utils/permission.service.ts`。
        2.  实现核心函数 `calculateEffectivePermissions`，严格按照附录中的伪代码逻辑。
    -   **验证:**
        -   **关键步骤:** 编写**纯粹的 Vitest 单元测试**。创建各种模拟的 `member`, `roles`, `channel` 对象作为输入，覆盖所有计算路径（如基础权限、deny 覆盖 allow、成员覆盖角色等），断言函数返回的最终权限 `Set` 与预期完全一致。

-   **任务 3.2：创建并应用权限检查中间件到一个路由**
    -   **动作:**
        1.  创建 `backend/src/middleware/checkPermission.ts`，并导出 `authorize(permission)` 工厂函数。
        2.  选择一个简单的路由，例如 `POST /.../messages`，应用 `authorize('SEND_MESSAGES')` 中间件。
    -   **验证:**
        -   编写集成测试。设置一个场景，让用户在某频道**没有** `SEND_MESSAGES` 权限。调用发消息 API，断言返回 403。然后赋予权限，再次调用，断言返回 201。

-   **任务 3.3：全面应用权限中间件**
    -   **动作:**
        1.  将 `authorize` 中间件应用到规划中提到的所有其他相关路由。
    -   **验证:**
        -   为每个新保护的路由补充至少一个成功和一个失败的权限集成测试。

-   **任务 3.4：重构 `getChannelsByServer` 并附加权限**
    -   **动作:**
        1.  重构 `channel.service.ts` 中的 `getChannelsByServer`。
        2.  实现一次性并行获取所有需要的数据。
        3.  在内存中过滤掉用户没有 `VIEW_CHANNEL` 权限的频道。
        4.  为每个返回的频道对象，附加一个 `permissions` 字段，其值为为该用户计算好的有效权限列表。
    -   **验证:**
        -   编写集成测试。创建一个有5个频道的服务器，赋予用户其中3个的 `VIEW_CHANNEL` 权限。调用 `GET /.../channels` API，断言响应数组的长度为3，并检查其中一个返回的频道对象是否包含正确的 `permissions` 字段。

-   **任务 3.5：实现 WebSocket 实时同步**
    -   **动作:**
        1.  在所有修改权限的服务（角色、成员、频道覆盖）的末尾，添加广播 `PERMISSIONS_UPDATE` 事件的代码。
        2.  实现当用户失去 `VIEW_CHANNEL` 权限时，强制其 Socket 离开对应频道 Room 的逻辑。
    -   **验证:**
        -   使用 `socket.io-client` 编写测试。客户端连接并监听事件。通过 API 调用修改权限，断言客户端收到了 `PERMISSIONS_UPDATE` 事件。然后，移除客户端的 `VIEW_CHANNEL` 权限，再向该频道广播一条测试消息，断言该客户端**没有**收到这条消息。

---

### **第四阶段：前端界面实现 (Frontend UI)**

**目标：** 为用户提供管理和感知新权限系统的界面。

-   **任务 4.1：前端数据接入与 `PermissionGate` 组件**
    -   **动作:**
        1.  修改前端 `types/index.ts`，在 `Channel` 类型上添加 `permissions: string[]` 字段。
        2.  创建一个 `usePermissions` hook 和一个 `<PermissionGate permission="SOME_PERMISSION">` 组件。
    -   **验证:**
        -   使用 MSW 模拟 `GET /.../channels` 的返回，使其包含 `permissions` 字段。编写 React Testing Library 组件测试，断言 `<PermissionGate>` 在有无权限时能正确地渲染或隐藏其子组件。

-   **任务 4.2：构建角色管理 UI (无交互)**
    -   **动作:**
        1.  在 `ServerSettingsModal` 中添加“角色”选项卡，并构建其静态 UI，包括角色列表和右侧的权限开关表。
    -   **验证:**
        -   通过 Storybook 或组件测试，传入模拟数据，验证 UI 渲染是否正确。

-   **任务 4.3：连接角色管理 UI 与 API**
    -   **动作:**
        1.  使用 TanStack Query 的 `useMutation` 将 UI 上的操作（创建、删除、修改名称/颜色/权限）连接到后端 API。
    -   **验证:**
        -   **端到端手动验证。** 在开发环境中，作为服务器所有者，尝试创建、编辑、删除角色，并观察网络请求和 UI 状态是否正确。

-   **任务 4.4：实现频道权限覆盖 UI**
    -   **动作:**
        1.  在 `ChannelSettingsModal` 中添加“权限”选项卡，构建其 UI，并连接到后端 API。
    -   **验证:**
        -   **端到端手动验证。** 在开发环境中，尝试为某个角色或成员在特定频道上设置允许/禁止权限。

-   **任务 4.5：应用 `PermissionGate` 并处理实时更新**
    -   **动作:**
        1.  在整个应用中，使用 `<PermissionGate>` 组件包裹所有需要权限控制的 UI 元素（如设置按钮、消息输入框等）。
        2.  在全局位置监听 `PERMISSIONS_UPDATE` WebSocket 事件，并在收到后调用 `queryClient.invalidateQueries` 使相关数据失效。
    -   **验证:**
        -   **端到端手动验证。**
            a. 以低权限用户登录，验证 UI 是否按预期禁用了功能。
            b. 打开两个浏览器，一个管理员，一个普通成员。管理员修改成员权限，观察成员的浏览器界面是否实时更新（例如，输入框变为禁用状态）。

# 当前开发进度：`mew` 服务器细粒度权限系统

### **第一阶段：后端模型与基础逻辑 (Backend Foundation)** - `已完成`

---

-   **任务 1.1：定义权限并创建 `Role` 模型** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已创建 `backend/src/constants/permissions.ts` 并定义权限常量。
        2.  已创建 `backend/src/api/role/role.model.ts` 并定义 `Role` 的 Mongoose Schema。

-   **任务 1.2：改造 `ServerMember` 和 `Server` 模型** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已修改 `member.model.ts`，移除了旧的 `role` 字段，添加了 `isOwner` 和 `roleIds`。
        2.  已修改 `server.model.ts`，添加了 `everyoneRoleId`。

-   **任务 1.3：为 `Channel` 模型添加权限覆盖结构** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已在 `channel.model.ts` 中添加了 `permissionOverrides` 子文档数组字段。

-   **任务 1.4：集成至“创建服务器”流程** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  `server.service.ts` 中的 `createServer` 函数已能自动创建并关联 `@everyone` 角色。原子性操作（事务）因测试环境无法支持 replica set 而被暂时移除，并已记录为技术债务。

-   **任务 1.5：集成至“成员加入”与“数据清理”流程** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  `invite.service.ts` 确保新成员能自动获得 `@everyone` 角色。
        2.  `server.service.ts` 等文件中已实现完整的级联删除逻辑。

---

### **第二阶段：后端 API 开发 (Backend API)** - `已完成`

---

-   **任务 2.1：实现角色管理的 CRUD API** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已创建 `role` 模块的完整 service, controller, routes。
        2.  已实现完整的 CRUD 端点，并移除了临时的 `isServerOwner` 中间件。

-   **任务 2.2：实现成员角色分配 API** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已在 `member.routes.ts` 中添加了 `PUT /.../roles` 端点及相应逻辑。
        2.  已使用 `isServerOwner` 中间件进行了保护。

-   **任务 2.3：实现频道权限覆盖 API** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已在 `channel.routes.ts` 中添加 `GET /:channelId/permissions` 和 `PUT /:channelId/permissions` 端点。
        2.  已实现相应的 controller 和 service 逻辑。
        3.  已为新端点编写了完整的 Supertest 集成测试，并通过所有测试。

-   **附加任务：代码库健康度维护** - `已完成`
    -   **状态：** ✅ 已完成。
    -   **结果：**
        1.  修复了 `gateway.test.ts` 中的单元测试超时问题，确保所有测试通过。
        2.  修复了 `server.service.ts` 中因类型不匹配导致的多个编译时错误，确保了项目可以成功启动和运行。
        3.  通过大规模重构统一了多个 service 文件 (`channel`, `server`, `user`) 的导出风格，解决了所有相关的 `TypeError`，提升了代码一致性。

-   **任务 2.4：实现高级 API 安全校验** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  **层级校验已实现:** 已创建 `hierarchy.utils.ts` 并将其逻辑集成到 `member` 和 `role` 服务中，确保低层级用户无法管理高层级用户/角色。
        2.  **临时中间件已移除:** 已从所有相关路由中移除了临时的 `isServerOwner` 检查。
        3.  **测试已通过:** 已为新的层级校验逻辑编写了并通过了所有相关的集成测试和单元测试。
        4.  **遗留问题:** `channel.service.ts` 中的“自我锁定防护”逻辑因依赖 **阶段三** 的 `permission.service` 而未实现。

---

### **第三阶段：权限计算与应用 (Permission Enforcement)** - `进行中`

---

-   **任务 3.1：构建权限计算器并进行单元测试** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已创建 `backend/src/utils/permission.service.ts`。
        2.  已实现核心函数 `calculateEffectivePermissions`。
        3.  已编写并通过了覆盖多种复杂场景的 12 个 Vitest 单元测试，确保了计算逻辑的健壮性。

-   **任务 3.2：创建并应用权限检查中间件到一个路由** - `已完成`
    -   **状态：** ✅ 已验证完成。
    -   **结果：**
        1.  已创建 `backend/src/middleware/checkPermission.ts` 并实现了 `authorize` 工厂函数。
        2.  已将 `authorize('SEND_MESSAGES')` 中间件成功应用于 `message.routes.ts` 中的消息发送路由。
        3.  为新的权限逻辑编写了并通过了完整的集成测试，覆盖了允许和拒绝的场景。
        4.  在实现过程中，修复了多个因类型定义严格导致的 TypeScript 编译错误，确保了 `dev` 服务器可以成功启动。

-   **任务 3.3：全面应用权限中间件** - `已完成`
    -   **状态：** ✅ 已验证完成
    -   **日期：** 2025-12-07
    -   **结果：**
        1.  **全面应用:** 已将重构后的 `authorizeChannel` 和 `authorizeServer` 中间件全面应用于 `channel`, `server`, `member`, `role`, 和 `message` 的路由中。
        2.  **中间件重构:** 将 `checkPermission.ts` 中的单一 `authorize` 中间件重构为 `authorizeChannel` and `authorizeServer`，以解决因 `channelId` 依赖导致的服务器级路由错误。
        3.  **测试修复与增强:**
            -   修复了因中间件重构而导致的大量（64个）单元测试失败。
            -   为新的权限逻辑在 `channel`, `server`, `member`, `role` 的测试文件中补充了单元测试。
            -   修复了权限计算服务中关于DM频道的逻辑错误。
        4.  **验证:** 所有后端测试 (191/191) 均已通过。
    -   **下一步:** 等待确认，准备开始 `3.5`。

-   **任务 3.4：重构 `getChannelsByServer` 并附加权限** - `已完成`
    -   **状态：** ✅ 已验证完成
    -   **日期：** 2025-12-07
    -   **结果：**
        1.  **函数重构:** 已成功重构 `channel.service.ts` 中的 `getChannelsByServer` 函数，现在它会一次性获取所有必需的数据（服务器、角色、成员信息）。
        2.  **权限过滤:** 重构后的函数现在会在内存中为用户过滤掉其不具备 `VIEW_CHANNEL` 权限的频道。
        3.  **权限附加:** 对于用户有权查看的每个频道，API 响应中现在都会附加一个 `permissions` 字段，其中包含为该用户计算出的最终有效权限列表。
        4.  **问题修复:** 解决了在 `ts-node` 开发环境中因 Mongoose 和 TypeScript 之间复杂的类型推断问题而导致的多个编译时错误。最终通过 `as any` 类型断言解决了这一问题，确保了开发服务器可以成功启动。
        5.  **测试验证:** 修复了因重构导致失败的单元测试，并增加了一个新的集成测试用例来专门验证频道过滤和权限附加功能。所有后端测试 (192/192) 均已通过。
    -   **下一步:** 等待确认，准备开始 `3.5`。

-   **任务 3.5：实现 WebSocket 实时同步** - `已完成`
    -   **状态：** ✅ 已验证完成
    -   **日期：** 2025-12-07
    -   **结果：**
        1.  **权限同步工具:** 已在 `permission.service.ts` 中创建 `syncUserChannelPermissions` 工具函数，用于在权限变更后检查并强制移除失去 `VIEW_CHANNEL` 权限用户的 Socket。
        2.  **事件广播集成:** 已将 `PERMISSIONS_UPDATE` 事件广播和 `syncUserChannelPermissions` 调用逻辑全面集成到 `role`、`member` 和 `channel` 服务的相关写操作（创建、更新、删除）中。
        3.  **端到端测试:** 在 `gateway.test.ts` 中增加了一个新的集成测试，专门验证了从通过 API 修改权限到目标用户的 Socket 被强制移出房间的完整流程，确保了数据隔离的实时性。
        4.  **问题修复:**
            -   修复了 `gateway.test.ts` 中因 `socketManager` mock 不完全导致的 `getIO` 返回 `undefined` 的问题，确保了测试可以正确运行。
            -   修复了在 `channel.service.ts` 和 `permission.service.ts` 中因 TypeScript 和 Mongoose 之间复杂的类型推断导致的多个编译时错误，确保了开发服务器可以成功启动。
        5.  **验证:** 所有后端测试 (193/193) 均已通过，开发服务器已能成功运行。
