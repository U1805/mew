# 开发规划：`mew` 服务器细粒度权限系统

**版本：** 3.0
**最后更新：** 2025-12-06

---

### 1. 概述

#### 1.1. 核心目标
在现有 `OWNER` 和 `MEMBER` 的基础上，为 `mew` 项目引入一个灵活、强大且可扩展的基于角色的访问控制（RBAC）系统。此系统将允许服务器所有者对成员在特定频道内的权限进行精细化管理。

#### 1.2. 设计隐喻
本规划严格遵循并借鉴 Discord 权限系统的核心设计思想，其关键在于：
*   **角色 (Roles):** 作为权限的集合，是权限分配的基本单位。
*   **权限覆盖 (Permission Overrides):** 允许在特定频道或针对特定成员，对角色赋予的基础权限进行修改。

#### 1.3. 关键概念
*   **权限 (Permission):** 系统中一个最小化的操作许可，例如 `SEND_MESSAGES`。
*   **角色 (Role):** 一个或多个权限的命名集合，拥有层级、颜色等属性。
*   **权限覆盖 (Permission Override):** 针对特定频道，为某个角色或成员设置的权限修改规则。覆盖规则分为“允许”(Allow)和“禁止”(Deny)。
*   **核心裁决规则：** 权限的最终结果由多个层级的规则叠加计算得出，遵循 **“特异性优先” (Specificity First)** 和 **“同级 Deny 优先” (Deny over Allow at the same level)** 原则。
    *   **层级顺序：** 基础权限 (`@everyone` 全局) -> 角色权限 (全局) -> 频道 `@everyone` 覆盖 -> 频道角色覆盖 -> 频道成员特定覆盖。
    *   **优先级：** 更具特异性的规则（如成员特定覆盖）会覆盖更通用的规则（如角色全局权限）。
    *   服务器所有者（`isOwner`）和拥有 `ADMINISTRATOR` 权限的角色是例外，它们将绕过所有权限检查。

---

### 2. 实施阶段

#### **阶段一：后端数据模型与核心逻辑设计 (Backend Foundation)**

**目标：** 构建权限系统的数据库基础，优化数据结构以确保高性能查询与数据一致性。

1.  **定义权限字典 (Permission Dictionary):**
    *   创建新文件 `backend/src/constants/permissions.ts`。
    *   在此文件中，将权限按作用域进行明确分类。详细列表见 **附录 3.1**。
    *   **[性能考量]** 初期实现可使用字符串数组，但为未来优化，建议为每个权限定义一个 `BigInt` 类型的位掩码（Bitmask），以便通过位运算高效计算权限。

2.  **创建 `Role` 模型:**
    *   在 `backend/src/api/role/` (新建) 目录下，创建 `role.model.ts`。
    *   **Schema 字段:**
        *   `name`: (String, required) - 角色名称。
        *   `serverId`: (ObjectId, ref: 'Server', required, index: true) - 所属服务器。
        *   `permissions`: ([String], default: []) - 权限键的数组。
        *   `color`: (String, default: '#99AAB5') - 十六进制颜色代码。
        *   `position`: (Number, required, index: true) - 角色层级，数字越低层级越低。
        *   `isDefault`: (Boolean, default: false, index: true) - 标识 `@everyone` 角色。

3.  **修改 `Server` 模型:**
    *   路径: `backend/src/api/server/server.model.ts`。
    *   新增 `everyoneRoleId`: `(ObjectId, ref: 'Role')` - 用于存储 `@everyone` 角色的ID，避免重复查询。

4.  **修改 `ServerMember` 模型:**
    *   路径: `backend/src/api/member/member.model.ts`。
    *   移除 `role: 'OWNER' | 'MEMBER'` 字段。
    *   新增 `roleIds`: `[{ type: Schema.Types.ObjectId, ref: 'Role' }]`。
    *   新增 `isOwner`: `(Boolean, default: false, index: true)` - 明确标识服务器所有者，其权限将绕过所有检查。

5.  **修改 `Channel` 模型 (嵌入权限覆盖):**
    *   路径: `backend/src/api/channel/channel.model.ts`。
    *   新增 `permissionOverrides`: `[{ _id: false, targetType: String, targetId: ObjectId, allow: [String], deny: [String] }]`。
    *   **设计决策：** 将权限覆盖作为子文档嵌入到 Channel 模型中。这能极大提升读取性能，因为获取频道信息时无需进行额外的数据库 `lookup`。

6.  **业务逻辑与数据一致性保障:**
    *   **服务器创建 (`server.service.ts`):**
        1.  创建服务器时，自动生成一个 `@everyone` 角色 (`isDefault: true`, `position: 0`)，并赋予基础权限。
        2.  将新创建的 `@everyone` 角色 ID 保存到服务器文档的 `everyoneRoleId` 字段。
        3.  创建者的 `ServerMember` 记录中，`isOwner` 字段设为 `true`。
    *   **新成员加入 (`invite.service.ts`):**
        1.  新成员的 `ServerMember` 记录的 `roleIds` 数组中，自动添加该服务器的 `everyoneRoleId`。
    *   **级联删除与清理 (Cascading Deletes & Clean-up):**
        1.  **删除服务器时:** 级联删除所有关联的 `Role` 文档。
        2.  **删除角色时:**
            a. 从所有 `ServerMember.roleIds` 中 `$pull` 该角色 ID。
            b. 从所有 `Channel.permissionOverrides` 中 `$pull` 以该角色为 `targetId` 的规则。
        3.  **成员离开/被踢时:** 从所有 `Channel.permissionOverrides` 中 `$pull` 以该成员 `userId` 为 `targetId` 的规则。

---

#### **阶段二：后端 API 端点开发 (Backend API Exposure)**

**目标：** 创建管理新模型的 RESTful API 端点，并集成严格的安全校验。

1.  **角色管理 API (`/api/servers/:serverId/roles`):**
    *   `POST /`: 创建新角色。
    *   `GET /`: 获取服务器所有角色列表，按 `position` 排序。
    *   `PATCH /:roleId`: 更新角色信息（名称、颜色、权限）。
    *   `PATCH /positions`: 批量更新角色顺序。Body: `[{ roleId: String, position: Number }]`。
    *   `DELETE /:roleId`: 删除角色。**必须拦截并禁止删除 `isDefault: true` 的角色。**
    *   **所有写操作均需 `MANAGE_ROLES` 权限。**

2.  **成员角色分配 API (`/api/servers/:serverId/members/:userId/roles`):**
    *   `PUT /`: 替换指定成员的所有角色。Body: `{ roleIds: [String] }`。需 `MANAGE_ROLES` 权限。

3.  **频道权限覆盖 API (`/api/servers/:serverId/channels/:channelId/permissions`):**
    *   `GET /`: 获取频道的所有权限覆盖设置。
    *   `PUT /`: 批量更新或创建权限覆盖规则。Body: `[{ targetType, targetId, allow, deny }]`。需 `MANAGE_CHANNEL` 权限。

4.  **安全与校验 (Security & Validation):**
    *   **层级限制：**
        *   所有角色管理和分配的操作，必须校验操作者的最高角色层级 (`position`) **严格高于** 目标角色/成员的最高角色层级。
        *   成员无法踢出/封禁层级高于或等于自身的成员。
        *   所有者 (`isOwner: true`) 不受此限制。
    *   **自我锁定防护 (Self-Lockout Prevention):**
        *   在 `PUT /.../permissions` 端点，必须校验：如果操作会导致请求者本人失去对该频道的 `MANAGE_CHANNEL` 权限（且请求者不是所有者或管理员），则请求必须被拒绝。
    *   **输入校验 (Zod)：** 所有接收权限数组的 API 端点，必须使用 `z.enum()` 结合 `permissions.ts` 中的权限常量进行严格校验。

---

#### **阶段三：权限逻辑集成与执行 (Permission Enforcement)**

**目标：** 将新的权限系统应用到现有业务逻辑中，实现高性能、准确的权限控制。

1.  **开发权限计算服务 (`permission.service.ts`):**
    *   创建新服务 `backend/src/utils/permission.service.ts`。
    *   **核心函数 `calculateEffectivePermissions(userId, channel)`:**
        1.  **输入：** 用户ID、**已包含权限覆盖的**频道对象。
        2.  **策略：** **完全在应用服务层进行内存计算**，不产生额外数据库查询。
        3.  **逻辑 (详细见附录 3.2):**
            a. **数据预加载 (Eager Loading):** 调用此函数前，必须已一次性获取 `ServerMember`（含 `roleIds`）、服务器所有 `Role` 及目标 `Channel`。
            b. **特殊情况处理：** 检查用户是否为 `isOwner` 或频道类型为 `DM`，若是，直接返回包含所有权限的集合。
            c. 累加计算基础权限、角色权限，并依次应用 `@everyone` 覆盖、角色覆盖和成员特定覆盖。
            d. **裁决核心：** 最终权限 = `(基础权限 ∪ 所有Allow覆盖) - 所有Deny覆盖`。
        4.  **输出：** 该用户在该频道的最终有效权限集合 (Set<string>)。

2.  **创建权限检查中间件 (`checkPermission.ts`):**
    *   在 `backend/src/middleware/` 中创建 `checkPermission.ts`。
    *   导出一个工厂函数 `authorize(permission: PermissionEnum)`，其内部调用权限计算服务，若无权限则抛出 `ForbiddenError`。

3.  **应用权限中间件:**
    *   **路由层:**
        *   `message.routes.ts`: `POST /` 应用 `authorize('SEND_MESSAGES')`。
        *   `channel.routes.ts`: `PATCH`, `DELETE` 应用 `authorize('MANAGE_CHANNEL')`。
        *   `server.routes.ts`: `PATCH` 应用 `authorize('MANAGE_SERVER')`。
        *   `member.routes.ts`: `DELETE /:userId` 应用 `authorize('KICK_MEMBERS')`。
    *   **服务层重构 (`channel.service.ts`):**
        *   **重构 `getChannelsByServer`:**
            1.  **一次性数据获取：** 使用 `Promise.all` 并行获取服务器所有 `Channel`（含 `permissionOverrides`）、所有 `Role` 以及当前用户的 `ServerMember`。
            2.  **内存过滤：** 在应用层（Node.js），遍历频道列表，为每个频道调用 `calculateEffectivePermissions`。
            3.  **最终返回：** 只返回用户拥有 `VIEW_CHANNEL` 权限的频道。**为每个返回的频道对象附加 `permissions` 字段，包含为当前用户计算好的权限列表**，供前端直接使用。

4.  **实现权限实时同步 (Implement Real-time Permission Sync):**
    *   **新增 WebSocket 事件：** 定义下行事件 `PERMISSIONS_UPDATE`。
    *   **后端广播：** 当角色、成员角色、频道覆盖被修改时，向服务器房间或特定用户房间广播 `PERMISSIONS_UPDATE` 事件，Payload 可包含变更范围（如 `serverId` 或 `channelId`）。
    *   **[关键安全措施] WebSocket Room 权限同步:**
        *   在权限变更后，必须重新计算受影响用户的 `VIEW_CHANNEL` 权限。
        *   如果用户失去了对某个频道的 `VIEW_CHANNEL` 权限，**必须在后端强制将其 Socket 从对应的频道 Room 中移除 (`socket.leave(channelId)`)**，以防止数据泄露。
    *   **前端响应：** 客户端监听 `PERMISSIONS_UPDATE` 事件，作废（invalidate）本地的用户、频道、服务器等相关数据缓存，触发重新获取。

---

#### **阶段四：前端 UI/UX 实现 (Frontend Implementation)**

**目标：** 构建直观、易用的前端界面来管理和展示新的权限系统。

1.  **服务器设置 -> 角色管理页面:**
    *   在 `ServerSettingsModal` 中新增“角色”选项卡。
    *   **左侧：** 角色列表，支持拖拽调整 `position`，并通过 `PATCH /positions` API 批量更新。
    *   **右侧：** 所选角色的配置区，包含名称、颜色选择器、按分组展示的权限开关列表。

2.  **频道设置 -> 权限管理页面:**
    *   在 `ChannelSettingsModal` 中新增“权限”选项卡。
    *   界面允许添加角色或成员以创建覆盖规则。
    *   每个权限提供三态开关：`继承 (默认)`、`允许 (√)`、`禁止 (×)`。
    *   UI 必须清晰展示权限的最终生效状态及其来源。

3.  **成员管理 UI 更新:**
    *   成员列表的右键菜单中增加“角色”子菜单，允许通过复选框快速分配/撤销角色。

4.  **前端权限感知:**
    *   **策略：** 前端无需自行计算权限。直接使用从 `GET /.../channels` 等 API 响应中附带的、后端已计算好的 `permissions` 字段。
    *   **组件封装：** 创建一个 `<PermissionGate permission="MANAGE_MESSAGES">` 组件，它会从上下文中读取当前频道的权限，判断是否渲染其子组件。
    *   **应用：** 使用 `PermissionGate` 或自定义 hook `usePermissions()` 在 UI 中动态禁用/隐藏功能入口（如消息输入框、设置按钮）。
    *   **实时更新：** 监听 `PERMISSIONS_UPDATE` WebSocket 事件，并调用 `queryClient.invalidateQueries` 作废相关缓存（如 `['channels', serverId]`），实现 UI 权限的实时同步。

---

### 3. 附录

#### 3.1. 权限字典

**服务器级权限 (Server-Level Permissions):**
*   `ADMINISTRATOR`: **超级管理员**。拥有此权限的角色将绕过所有频道的权限覆盖，获得所有权限。
*   `MANAGE_ROLES`: 创建、编辑、删除角色，并将其分配给成员。
*   `KICK_MEMBERS`: 将成员从服务器中移除。
*   `CREATE_INVITE`: 创建服务器的邀请链接。
*   `MANAGE_SERVER`: 修改服务器名称、图标等信息。
*   `MANAGE_WEBHOOKS`: 创建、编辑和删除 Webhook。

**频道级权限 (Channel-Level Permissions):**
*   `VIEW_CHANNEL`: 查看频道，阅读消息历史。
*   `MANAGE_CHANNEL`: 修改频道名称、主题，或删除频道。
*   `SEND_MESSAGES`: 在频道中发送消息。
*   `MANAGE_MESSAGES`: 删除他人的消息。
*   `ADD_REACTIONS`: 为消息添加回应。
*   `ATTACH_FILES`: 在频道中上传文件。
*   `MENTION_EVERYONE`: 允许使用 @everyone 和 @here。

#### 3.2. 权限计算伪代码

```typescript
// function calculateEffectivePermissions(member, roles, everyoneRole, channel)
// 返回: Set<string>

// 1. 处理特殊情况
if (member.isOwner) return new Set(ALL_PERMISSIONS);
if (channel.type === 'DM') return new Set(DM_PERMISSIONS);

// 2. 计算基础权限 (合并 @everyone 和用户所有角色的全局权限)
let basePermissions = new Set(everyoneRole.permissions);
member.roleIds.forEach(roleId => {
    const role = roles.find(r => r._id === roleId);
    if (role) {
        role.permissions.forEach(p => basePermissions.add(p));
    }
});

// 3. 如果基础权限包含 ADMINISTRATOR, 直接返回所有权限
if (basePermissions.has('ADMINISTRATOR')) return new Set(ALL_PERMISSIONS);

// 4. 应用频道覆盖规则
let effectivePermissions = new Set(basePermissions);

// 4a. 应用 @everyone 的覆盖
const everyoneOverride = channel.permissionOverrides.find(o => o.targetId === everyoneRole._id);
if (everyoneOverride) {
    everyoneOverride.deny.forEach(p => effectivePermissions.delete(p));
    everyoneOverride.allow.forEach(p => effectivePermissions.add(p));
}

// 4b. 按 position 升序应用角色覆盖
const memberRoles = member.roleIds.map(id => roles.find(r => r._id === id)).sort((a,b) => a.position - b.position);
memberRoles.forEach(role => {
    const roleOverride = channel.permissionOverrides.find(o => o.targetId === role._id);
    if (roleOverride) {
        roleOverride.deny.forEach(p => effectivePermissions.delete(p));
        roleOverride.allow.forEach(p => effectivePermissions.add(p));
    }
});

// 4c. 应用成员特定的覆盖
const memberOverride = channel.permissionOverrides.find(o => o.targetType === 'member' && o.targetId === member.userId);
if (memberOverride) {
    memberOverride.deny.forEach(p => effectivePermissions.delete(p));
    memberOverride.allow.forEach(p => effectivePermissions.add(p));
}

// 5. 返回最终权限
return effectivePermissions;