# Plugins

这里放置各种 Bot Service（插件）。每个插件是一个独立的 Go module，通常会：

1. 从后端按 `serviceType` 拉取（bootstrap）所有 Bot 实例配置
2. 将每个 Bot 的 `config`（JSON 字符串，通常为数组）拆成多个独立任务并运行
3. 定期同步配置：新增/删除/变更时自动热重载

## 目录结构

- `plugins/sdk`：Bot SDK（通用代码：dotenv、环境变量解析、bootstrap client、通用 manager）
- `plugins/fetchers/*`：Fetcher 类 Bot（Go）
  - `plugins/fetchers/test-fetcher`：示例 Fetcher（serviceType=`test-fetcher`）
  - `plugins/fetchers/rss-fetcher`：RSS 抓取（serviceType=`rss-fetcher`）
- `plugins/agents/*`：Agent 类 Bot（Go）
  - `plugins/agents/test-agent`：示例 Agent（serviceType=`test-agent`）
  - `plugins/agents/jpdict-agent`：词典/翻译 Agent（serviceType=`jpdict-agent`）

## 通用环境变量

所有基于 `plugins/sdk` 的 Bot 通常都支持：

- `MEW_ADMIN_SECRET`：必填，对应后端 `MEW_ADMIN_SECRET`
- `MEW_URL`：后端基址（默认 `http://localhost:3000`）
- `MEW_API_BASE`：可选，直接指定 API 基址（如 `http://localhost:3000/api`；优先级高于 `MEW_URL`）
- `MEW_API_PROXY`：可选，请求代理（默认不使用代理；`env` 表示使用 `HTTP_PROXY/HTTPS_PROXY/NO_PROXY`）
- `MEW_CONFIG_SYNC_INTERVAL_SECONDS`：轮询同步间隔，默认 `60`
- `MEW_DOTENV`：可选，设置为 `0/false/off/no` 可禁用 `.env` 加载（默认启用）

`serviceType` 不通过环境变量设置，而是自动使用插件目录名（例如 `plugins/fetchers/test-fetcher` 的 `serviceType` 为 `test-fetcher`）。

## `.env.local` / `.env` 加载规则

`plugins/sdk` 会在启动时尝试从以下位置加载环境变量（仅在变量尚未设置时才会写入）：

- 当前工作目录：`.env.local`（优先）→ `.env`
- 插件源码目录：`.env.local`（优先）→ `.env`
- 插件分组目录（如 `plugins/fetchers/`）：`.env.local`（优先）→ `.env`
- `plugins/` 目录：`.env.local`（优先）→ `.env`（建议把通用变量放这里）

## 本地运行

示例：

```bash
go run ./plugins/fetchers/test-fetcher
go run ./plugins/fetchers/rss-fetcher
go run ./plugins/agents/test-agent
```
