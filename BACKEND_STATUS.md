# 后端开发状态与计划

本文档旨在总结后端已完成的工作，并为下一阶段的开发制定清晰的计划。

## ✅ 已完成任务回顾

我们已经为后端服务构建了一个功能完善、经过全面测试且安全可靠的核心。所有任务均已开发完成并通过了严格的集成测试。

1.  **项目基础架构**:
    *   搭建了基于 `Express` 和 `TypeScript` 的 `pnpm monorepo` 工作区，并配置了热重载与环境加载。

2.  **核心 API 功能 (CRUD)**:
    *   **认证系统**: 实现了完整的用户注册、登录 (`JWT`) 及授权中间件。
    *   **服务器 (Server)**: 实现了创建 (`POST`)、获取详情 (`GET`) 和获取当前用户服务器列表 (`GET`) 的路由。
    *   **频道 (Channel)**: 实现了在服务器内创建频道 (`POST`) 的路由。
    *   **消息 (Message)**: 实现了获取频道历史消息 (`GET`) 的路由，并支持基于 `limit` 和 `before` 的分页。

3.  **WebSocket 实时网关**:
    *   **连接与认证**: 实现了 `Socket.IO` 与 `Express` 的集成，并通过 `JWT` 实现了安全的连接认证。
    *   **房间管理**: 完成了用户连接后，自动加入其所属服务器和频道的房间逻辑。
    *   **实时消息收发**: 完整实现了 `message/create` 事件，包括消息创建、数据库持久化和向房间内所有客户端的实时广播。

4.  **代码加固与审查修复**:
    *   **修复权限漏洞**: 修复了用户可跨服务器创建频道的严重安全漏洞，并通过新增的错误类型 (`ForbiddenError`) 确保返回正确的 403 状态码。
    *   **增强测试覆盖**: 根据代码审查报告，增加了针对**权限边界**（如跨用户操作）和**非法 ID 格式**的“攻击性”测试用例，显著提升了测试的健壮性。

5.  **测试与质量保证**:
    *   **搭建测试环境**: 使用 `Vitest` 和 `mongodb-memory-server` 搭建了完整的集成测试环境。
    *   **提升测试质量**: 根据审查建议，加固了 WebSocket 测试，确保其验证数据库的持久化；统一了测试数据的生成方式，使其更贴近真实业务逻辑。
    *   **稳定测试环境**: 通过在 `vitest.config.mts` 中配置 `threads: false`，彻底解决了因并行测试导致的 `mongodb-memory-server` 崩溃问题。
    *   **最终状态**: 完成了共计 **27** 个测试用例，新开发的功能全部通过测试。

## 🚀 下一步开发计划

在当前坚实的核心功能基础上，接下来的开发重点是完善资源的 CRUD 操作、实现核心的交互功能，并开始构建私信系统。

1.  **完善核心资源的 CRUD 操作**:
    *   **服务器 (Server)**:
        *   `PATCH /api/servers/:serverId`: 实现服务器信息（如名称、头像）的**编辑**功能。
        *   `DELETE /api/servers/:serverId`: 实现服务器的**删除**功能（需考虑权限和级联删除）。
    *   **频道 (Channel)**:
        *   `PATCH /api/channels/:channelId`: 实现频道信息（如名称、主题）的**编辑**功能。
        *   `DELETE /api/channels/:channelId`: 实现频道的**删除**功能。
    *   **消息 (Message)**:
        *   `PATCH /api/messages/:messageId`: 实现消息内容的**编辑**功能。
        *   `DELETE /api/messages/:messageId`: 实现消息的**删除**功能。

2.  **实现 WebSocket 事件同步**:
    *   为所有 `PATCH` 和 `DELETE` 操作创建对应的 WebSocket 事件 (例如 `CHANNEL_UPDATE`, `MESSAGE_DELETE` 等)，并进行广播，确保所有客户端的 UI 能够实时同步更新。

3.  **实现消息回应 (Reactions) 功能**:
    *   `PUT /api/messages/:messageId/reactions/:emoji/@me`: 添加一个表情回应。
    *   `DELETE /api/messages/:messageId/reactions/:emoji/@me`: 移除一个表情回应。
    *   创建并广播 `MESSAGE_REACTION_ADD` 和 `MESSAGE_REACTION_REMOVE` 两个 WebSocket 事件。

4.  **构建私信 (DM) 系统**:
    *   `POST /api/users/@me/channels`: 创建一个新的私信频道（请求体中包含 `recipientId`）。
    *   确保 `message/create` 事件在私信频道中能正常工作。
