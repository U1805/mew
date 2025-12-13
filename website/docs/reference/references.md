---
sidebar_label: '参考'
sidebar_position: 20
slug: /guide/references
---

# 📚 参考

## 🧰 部署与基础设施

- 基础设施部署（MongoDB / Garage）：[基础设施部署](./infrastructure-setup.md)

## 🔧 故障排除 (Troubleshooting)

遇到问题了？别慌。这里汇集了 Mew 开发过程中最常见的“坑”及其解决方案。

在使用 Ctrl + F 搜索之前，请先检查这 **三大定律**：
1.  **Node 版本对了吗？** (推荐 `v18+`)
2.  **依赖装全了吗？** (根目录运行过 `pnpm install` 吗？)
3.  **环境变量配了吗？** (`.env` 文件存在吗？)

---

### 常见问题

- `MongoNetworkError` / 连接不上 Mongo：确认 `MONGO_URI` 与 Mongo 监听地址；本地默认 `mongodb://localhost:27017/mew`。
- 上传接口返回 500：通常是 `S3_*` 未配置或对象存储不可达；不使用上传可忽略。
- WebSocket 连接失败：确认后端在 `http://localhost:3000`，并且使用有效 JWT 作为 `auth.token`。

[常见报错与解决方案]

（欢迎补充：把复现步骤、报错信息与解决办法以 PR 形式加入本页。）
