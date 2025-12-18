---
sidebar_label: '基础设施部署'
sidebar_position: 10
slug: /reference/infrastructure-setup
---

# 💾 基础设施部署

本文档将指导您在单机环境下部署 **MongoDB**（数据库）和 **Garage**（高性能对象存储）。这两个组件构成了 Mew 应用的核心数据底座。

## 📋 前置准备 (Prerequisites)

在开始之前，请确保您的环境满足以下要求：
*   **操作系统**：Linux 或 macOS
*   **依赖工具**：
    *   `docker` (>= 20.10)
    *   `openssl` (用于生成安全密钥)
    *   `curl` 或 `wget` (用于测试，可选)

---

## 0. 使用 Docker Compose（一键启动，推荐）

仓库已经提供 `docker-compose.yml`，会自动启动：

- MongoDB（数据库）
- Garage（S3 对象存储）
- Backend（API + Socket.IO）
- Frontend（Nginx 托管 + 反代 `/api`、`/socket.io`）
- `plugins/test` Bot（示例 Bot Service）

```bash
docker compose up --build
```

默认端口：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:3000`
- Garage S3 API：`http://localhost:3900`
- Garage Web（公共读）：`http://localhost:3902`

> ℹ️ Garage Web 默认使用 `*.web.garage.localhost`（例如：`http://mew-bucket.web.garage.localhost:3902/<key>`）。
> 大多数系统里 `*.localhost` 会解析到 `127.0.0.1`；如你的环境不支持，请改用 hosts/DNS 或调整 `S3_WEB_ENDPOINT`。

## 1. 部署 MongoDB

我们将部署 MongoDB 社区版作为主数据库。

### 1.1 启动服务

运行以下命令初始化容器：

```bash
# 1. 创建数据持久化目录
mkdir -p ~/mongodb/data

# 2. 启动 MongoDB 容器
# -p 27017:27017 : 暴露标准服务端口
# -v ...         : 将数据挂载到宿主机，防止容器删除后数据丢失
# --name mongodb : 指定容器名称以便后续管理
sudo docker run \
  --name mongodb \
  -p 27017:27017 \
  -v ~/mongodb/data:/data/db \
  -d mongodb/mongodb-community-server:8.2.2-ubuntu2204
```

### 1.2 验证部署

等待几秒钟后，检查容器状态：

```bash
sudo docker ps --filter "name=mongodb"
```

**✅ 预期结果：**
状态栏 (`STATUS`) 应显示为 `Up`。如果显示 `Restarting`，请检查 `~/mongodb/data` 的目录权限。

---

## 2. 部署 Garage S3 服务

[Garage](https://garagehq.deuxfleurs.fr/) 是一个轻量级、自包含的 S3 兼容对象存储服务。我们将通过 **配置生成** -> **服务启动** -> **集群初始化** 三步完成部署。

> 如果你使用的是仓库根目录的 `docker-compose.yml`，Garage 会由 `garage`/`garage-init` 服务自动启动并初始化（包含 bucket、key、website/public read）。
> 你可以直接跳过本节，或把本节作为“手动部署/生产部署”的参考。

### 2.1 自动化生成配置

为了简化繁琐的配置过程，我们使用以下脚本自动生成目录结构和 `garage.toml` 配置文件。

> 🛡️ **安全机制**：脚本会调用 `openssl` 自动生成高强度的 `rpc_secret`（节点通信密钥）和 `admin_token`，确保集群安全。

```bash
# === 配置开始 ===

# 1. 准备目录结构
mkdir -p ~/garage/data ~/garage/meta

# 2. 写入配置文件 (garage.toml)
cat > ~/garage/garage.toml <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"

replication_factor = 1

# RPC 通信配置 (节点间同步)
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$(openssl rand -hex 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.localhost"

[s3_web]
bind_addr = "[::]:3902"
root_domain = ".web.garage.localhost"
index = "index.html"

[k2v_api]
api_bind_addr = "[::]:3904"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "$(openssl rand -base64 32)"
metrics_token = "$(openssl rand -base64 32)"
EOF

echo "✅ Garage 配置文件已生成：~/garage/garage.toml"
```

### 2.2 启动 Garage 容器

```bash
sudo docker run \
  -d \
  --name garaged \
  --restart always \
  -p 3900:3900 -p 3901:3901 -p 3902:3902 -p 3903:3903 \
  -v ~/garage/garage.toml:/etc/garage.toml \
  -v ~/garage/meta:/var/lib/garage/meta \
  -v ~/garage/data:/var/lib/garage/data \
  dxflrs/garage:v2.1.0
```

> ℹ️ **国内镜像源加速**：
> 如遇拉取超时，可替换镜像为：`swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/dxflrs/garage:v2.1.0`

### 2.3 健康检查

在配置集群拓扑前，必须确保节点服务已就绪。

```bash
sudo docker exec garaged ./garage status
```

**✅ 预期结果：**
关注输出中的 `Capacity` 和状态列。此时看到 `NO ROLE ASSIGNED` 是**正常**的，因为我们还没分配角色。

```text
==== HEALTHY NODES ====
ID                Hostname      Address         Tags  Zone  Capacity
472d51c0...      0d5ee0...     127.0.0.1:3901              NO ROLE ASSIGNED
```

---

## 3. 初始化集群布局 (Layout)

Garage 采用独特的“拓扑声明”机制。我们需要显式告诉节点：“你是一个存储节点，位于 `dc1` 区域，拥有 1GB 容量。”

### 操作步骤

我们将使用脚本自动提取节点 ID 并应用配置，避免手动复制出错。

```bash
# 1. 自动提取当前节点的 ID
# 技巧：筛选状态为 NO ROLE 的节点行，提取第一列
NODE_ID=$(sudo docker exec garaged ./garage status | grep "NO ROLE" | awk '{print $1}')

if [ -z "$NODE_ID" ]; then
  echo "❌ 错误：未找到待配置的节点，请检查 'garage status' 输出。"
else
  echo "🔧 正在配置节点: $NODE_ID ..."

  # 2. 分配角色：区域=dc1, 容量=1G
  sudo docker exec garaged ./garage layout assign -z dc1 -c 1G "$NODE_ID"

  # 3. 应用变更 (Version 1)
  sudo docker exec garaged ./garage layout apply --version 1
fi
```

**✅ 成功标志：**
终端输出包含：`New cluster layout with updated role assignment has been applied in cluster.`

---

## 4. 配置存储桶与访问权限

最后，我们需要为应用创建专用的 **Bucket（桶）** 和 **Access Key（访问凭证）**。

### 4.1 创建资源

```bash
# 1. 创建存储桶 'mew-bucket'
sudo docker exec garaged ./garage bucket create mew-bucket

# 2. 创建访问密钥 'mew-app-key'
sudo docker exec garaged ./garage key create mew-app-key
```

> 🛑 **高危提醒：立即保存**
> 请务必复制下方的 **Secret access key**。
> Secret Key 类似于密码，Garage 不会二次显示它。一旦遗失，您只能删除旧 Key 并重新生成。

**输出示例：**
```text
Key ID:       GK121b3f65ee8989c9205ad883   <-- Access Key (用户ID)
Key name:     mew-app-key
Secret key:   8122334f0f2d5f5cd7...        <-- Secret Key (密码)
```

> 执行以下命令查看密钥详情:
> sudo docker exec garaged ./garage key info mew-app-key

将上面的 `Key ID` / `Secret key` 填入后端环境变量：

- `S3_ACCESS_KEY_ID=<Key ID>`
- `S3_SECRET_ACCESS_KEY=<Secret key>`

如果你使用的是 `docker-compose.yml`，默认会把它们写到 `garage_secrets` 卷里的 `s3-credentials.json`，并通过 `S3_CREDENTIALS_FILE` 注入给后端。

### 4.3 授权绑定

默认情况下 Key 和 Bucket 是隔离的。我们需要赋予 Key 对 Bucket 的读写权限。

```bash
# 赋予读(Read)、写(Write)、所有者(Owner)权限
sudo docker exec garaged ./garage bucket allow \
  --read --write --owner \
  mew-bucket \
  --key mew-app-key

# 验证权限表
sudo docker exec garaged ./garage bucket info mew-bucket
```

**✅ 最终验证：**
检查输出底部的 `KEYS FOR THIS BUCKET` 区域，确认 `mew-app-key` 拥有 `RWO` 权限。

```text
==== KEYS FOR THIS BUCKET ====
Permissions  Access key                  Local aliases
RWO          GK121b3f65ee8...            mew-app-key
```

### 4.4 设置公共读权限 (解决 403 Forbidden)

默认情况下，存储桶是私有的，只有授权的 Key (如 `mew-app-key`) 才能读写。当浏览器通过 URL 直接访问文件时，会因为匿名访问而被拒绝（`403 Forbidden`）。

要允许公开访问（例如，在 `<img>` 标签中显示图片），需要为存储桶设置公共读策略。

```bash
# 将存储桶 'mew-bucket' 设置为网站模式，以允许公共读取
sudo docker exec garaged ./garage bucket website --allow mew-bucket

# 验证公共读权限
sudo docker exec garaged ./garage bucket info mew-bucket
```

**✅ 验证：**
执行此命令后，你将看到桶信息包含如下内容：
```
==== BUCKET INFORMATION ====
Website access:    true
  index document:  index.html
  error document:  (not defined)
```

---

### 4.5 (可选) 清理与删除

如果您需要清理测试资源，可以使用以下命令删除存储桶和访问密钥。

```bash
# === 删除访问密钥 ===
# 如果不再需要某个密钥，可以将其删除。
# 警告：删除后，使用该密钥的应用将无法再访问 S3 服务。
sudo docker exec garaged ./garage key delete mew-app-key

# === 删除存储桶 ===
# 警告：此操作将永久删除桶及其中的所有数据，无法恢复！请谨慎操作。
sudo docker exec garaged ./garage bucket delete mew-bucket
```

🎉 **恭喜！** 您的基础数据设施已部署完毕。
