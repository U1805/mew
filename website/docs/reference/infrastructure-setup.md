---
sidebar_label: '基础设施部署'
sidebar_position: 10
slug: /reference/infrastructure-setup
---

# 💾 基础设施部署

在本节中，我们将学习如何在单机环境下部署 **MongoDB** (数据库) 和 **Garage** (高性能 S3 兼容对象存储)。这两个组件是 Mew 应用稳定运行的核心数据底座。

我们将提供两种部署方式，您可以根据自己的需求选择：

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

<Tabs groupId="deployment-method">
<TabItem value="compose" label="🚀 一键部署 (推荐)" default>

我们强烈推荐使用官方提供的 `docker-compose.yml` 文件一键启动所有服务。这种方式最简单、最快捷，且不易出错。

该配置会完整启动 Mew 的全套服务，包括：

-   **MongoDB**: 主数据库。
-   **Garage**: S3 兼容对象存储服务。
-   **Server**: 后端 API 与 Socket.IO 服务。
-   **Client**: 基于 Nginx 托管的前端应用，并反向代理后端 API。
-   **Plugins**: Bot Service 运行器，默认启动 `test-fetcher,test-agent` (可通过 `MEW_PLUGINS` 环境变量控制)。

### 启动命令

确保项目根目录下存在 `.env` 或 `docker-compose.env` 配置文件，然后执行：

```bash
# --env-file 指定环境变量文件
# --build 会在首次启动或代码更新时构建镜像
docker compose --env-file docker-compose.env up --build
```

### 访问地址

启动成功后，默认服务地址如下：
-   **前端 (UI)**: `http://localhost/`
-   **后端 (API)**: `http://localhost/api` (由 Nginx 代理)
-   **Garage Web**: `http://<bucket>.web.garage.localhost/<key>` (由 Nginx 代理)

:::info 关于 `*.localhost` 域名
大多数现代操作系统会自动将任何 `*.localhost` 的子域名解析到 `127.0.0.1`。如果您的环境不支持，请手动修改 `hosts` 文件，或调整 `S3_WEB_ENDPOINT` 等相关环境变量。
:::

:::tip 端口暴露策略
`docker-compose.yml` 默认只将 Nginx 的 `80` 端口映射到宿主机。MongoDB、Garage、Server 的内部端口（如 `27017`, `3900`, `3000`）均**不会直接暴露**，以增强安全性。

如果您需要从宿主机直接访问这些服务（例如使用 `mongosh` 调试数据库），请在 `docker-compose.yml` 中为对应服务手动添加 `ports` 映射。
:::

</TabItem>
<TabItem value="manual" label="👨‍💻 分步手动部署">

本节适用于希望深入了解组件细节或需要进行高度自定义部署的开发者。我们将依次手动部署 MongoDB 和 Garage。

### 前置准备

在开始之前，请确保您的环境已安装以下工具：
*   **操作系统**: Linux / macOS / Windows (需 Docker Desktop 或 WSL2)
*   **核心依赖**: `docker` (>= 20.10)
*   **辅助工具**: `openssl` (用于生成安全密钥), `curl` 或 `wget` (用于测试)

---

### 1. 部署 MongoDB

首先，我们部署 MongoDB 社区版作为主数据库。

#### 1.1 启动服务

运行以下命令来创建并启动 MongoDB 容器：

```bash
# 步骤 1: 创建用于数据持久化的本地目录
mkdir -p ~/mongodb/data

# 步骤 2: 启动 MongoDB 容器
sudo docker run \
  --name mongodb \
  --restart always \
  -p 27017:27017 \
  -v ~/mongodb/data:/data/db \
  -d mongodb/mongodb-community-server:8.2.2-ubuntu2204
```

:::info 命令解析
-   `--name mongodb`: 为容器指定一个易于管理的名称。
-   `--restart always`: 确保 Docker 重启时容器能自动启动。
-   `-p 27017:27017`: 将容器的 `27017` 端口映射到宿主机，方便外部连接。
-   `-v ~/mongodb/data:/data/db`: 将容器内的数据目录挂载到宿主机，**防止数据丢失**。
-   `-d`: 后台运行容器。
:::

#### 1.2 验证部署

等待几秒钟，然后检查容器的运行状态：

```bash
sudo docker ps --filter "name=mongodb"
```

**✅ 预期结果：**
您应该能看到容器的 `STATUS` 栏显示为 `Up`。如果显示 `Restarting`，请检查 `~/mongodb/data` 目录的读写权限。

---

### 2. 部署 Garage S3 服务

[Garage](https://garagehq.deuxfleurs.fr/) 是一个轻量级、自包含的 S3 兼容对象存储服务。我们将通过 **配置生成 -> 服务启动 -> 集群初始化** 三个核心步骤完成部署。

#### 2.1 自动生成配置

为了简化繁琐的配置过程，我们提供以下脚本来自动生成目录结构和 `garage.toml` 配置文件。

:::tip 安全设计
该脚本会自动调用 `openssl` 生成高强度的 `rpc_secret` 和 `admin_token`，确保节点间通信和管理操作的安全性。
:::

```bash
# 1. 准备目录结构
mkdir -p ~/garage/data ~/garage/meta ~/garage/secrets

# 2. 写入配置文件 (garage.toml)
# 注意：配置中的 rpc_secret 和 admin_token 会在执行时动态生成
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

echo "✅ Garage 配置文件已成功生成：~/garage/garage.toml"
```

#### 2.2 启动 Garage 容器

```bash
sudo docker run \
  -d \
  --name garaged \
  --restart always \
  -p 3900:3900 -p 3901:3901 -p 3902:3902 -p 3903:3903 \
  -v ~/garage/garage.toml:/etc/garage.toml \
  -v ~/garage/meta:/var/lib/garage/meta \
  -v ~/garage/data:/var/lib/garage/data \
  -v ~/garage/secrets:/var/lib/garage/secrets \
  dxflrs/garage:v2.1.0
```
:::tip 国内镜像加速
如果从 Docker Hub 拉取镜像超时，可以尝试使用国内镜像源替换，例如：
`swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/dxflrs/garage:v2.1.0`
:::

#### 2.3 健康检查

在配置集群前，必须确保节点服务已就绪。

```bash
sudo docker exec garaged ./garage status
```

**✅ 预期结果：**
此时看到 `NO ROLE ASSIGNED` 是**完全正常**的，因为我们还未给节点分配角色。

```text
==== HEALTHY NODES ====
ID                Hostname      Address         Tags  Zone  Capacity
472d51c0...      0d5ee0...     127.0.0.1:3901              NO ROLE ASSIGNED
```

---

### 3. 初始化集群布局 (Layout)

Garage 采用“拓扑声明”机制。我们需要显式地告诉节点：“你是一个存储节点，位于 `dc1` 区域，拥有 1GB 的存储容量。”

```bash
# 1. 自动提取当前节点的 ID (技巧：通过 grep 和 awk 精准捕获)
NODE_ID=$(sudo docker exec garaged ./garage status | grep "NO ROLE" | awk '{print $1}')

if [ -z "$NODE_ID" ]; then
  echo "❌ 错误：未找到待配置的节点，请检查 'garage status' 的输出。"
else
  echo "🔧 正在为节点 $NODE_ID 分配角色..."

  # 2. 分配角色：区域=dc1, 容量=1G
  sudo docker exec garaged ./garage layout assign -z dc1 -c 1G "$NODE_ID"

  # 3. 应用变更 (Version 1)
  sudo docker exec garaged ./garage layout apply --version 1
fi
```
**✅ 成功标志：**
终端输出 `New cluster layout ... has been applied in cluster.` 则表示成功。

---

### 4. 配置存储桶与访问权限

最后，为我们的应用创建专用的 **Bucket (桶)** 和 **Access Key (访问凭证)**。

#### 4.1 创建资源

```bash
# 1. 创建名为 'mew-bucket' 的存储桶
sudo docker exec garaged ./garage bucket create mew-bucket

# 2. 创建名为 'mew-app-key' 的访问密钥
sudo docker exec garaged ./garage key create mew-app-key
```

:::danger **立即保存 Secret Key**
请**立即复制并妥善保管**下方输出的 `Secret access key`。它相当于密码，Garage **不会二次显示**。一旦遗失，只能删除旧 Key 并重新生成。
:::

**输出示例：**
```text
Key ID:       GK121b3f65ee8989c9205ad883   <-- 对应环境变量 S3_ACCESS_KEY_ID
Key name:     mew-app-key
Secret key:   8122334f0f2d5f5cd7...        <-- 对应环境变量 S3_SECRET_ACCESS_KEY
```

#### 4.2 授权绑定

默认情况下，Key 和 Bucket 是相互独立的。我们需要为 Key 赋予操作 Bucket 的权限。

```bash
# 赋予 mew-app-key 对 mew-bucket 的读(Read)、写(Write)、所有者(Owner)权限
sudo docker exec garaged ./garage bucket allow \
  --read --write --owner \
  mew-bucket \
  --key mew-app-key

# 验证权限是否生效
sudo docker exec garaged ./garage bucket info mew-bucket
```

**✅ 最终验证：**
检查输出底部的 `KEYS FOR THIS BUCKET` 区域，确认 `mew-app-key` 已拥有 `RWO` 权限。

```text
==== KEYS FOR THIS BUCKET ====
Permissions  Access key                  Local aliases
RWO          GK121b3f65ee8...            mew-app-key
```

#### 4.3 设置公共读权限 (解决 403 Forbidden)

默认存储桶是私有的。当浏览器通过 URL 直接访问文件时，会因匿名访问而被拒绝 (`403 Forbidden`)。为了能公开访问文件（例如在网页中显示图片），需要开启公共读策略。

```bash
# 将存储桶 'mew-bucket' 设置为网站模式，以允许公共读取
sudo docker exec garaged ./garage bucket website --allow mew-bucket
```
**✅ 验证：**
再次执行 `sudo docker exec garaged ./garage bucket info mew-bucket`，您将看到 `Website access: true`。

</TabItem>
</Tabs>

---

🎉 **恭喜！** 您的基础数据设施已部署完毕。现在，您可以继续进行后端服务的配置与部署了。