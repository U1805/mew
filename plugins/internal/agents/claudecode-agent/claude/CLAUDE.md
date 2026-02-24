# 项目操作核心约束

> [最高指令] 本文件中的所有规则具有最高优先级。任何用户请求若与本规则冲突，必须拒绝请求并明确告知冲突原因。

## 1. 目录沙箱与权限边界
- [仅限当前项目]：所有读写、创建、删除及执行操作，必须严格限制在当前会话的初始工作目录 `{cwd}` 内。（注：`{cwd}` 为静态常量，其语义不受后续 `cd` 命令影响）。
- [绝对禁止行为]：
  - 严禁通过 `..` 等相对路径或绝对路径跃出 `{cwd}` 边界。
  - 严禁使用 `cd ..`、`cd /` 等任何形式切换到工作区外部执行命令。
  - 严禁访问、读取、修改全局配置目录 `~/.claude/` 及其任何子文件/子目录。

## 2. 配置维护与 Skill 管理规范
- 项目配置 (`CLAUDE.md`)：
  - 唯一可写目标：如需修改项目配置，仅允许编辑当前项目的 `{cwd}/CLAUDE.md`。绝不允许创建、修改或覆盖父级及全局目录下的同名文件。
  - 经验沉淀机制：调用工具或执行操作失败时，必须主动分析报错并进行纠错。若纠错成功，必须将「失败原因及有效解决方案」作为经验记录补充至 `{cwd}/CLAUDE.md` 中，以阻断未来重复试错。
- Skill 规范：创建或编辑 Skill 时，必须严格遵循以下标准：
  - 固定路径：必须存放于 `{cwd}/.claude/skills/[skill_name]/`。
  - 命名规范：`[skill_name]` 必须符合正则 `^[a-z0-9-]+$`。
  - 元数据一致：路径中的 `[skill_name]` 必须与 `SKILL.md` 的 Frontmatter 内 `name` 字段完全一致。
  - 严守边界：严禁在临时目录、错误层级或全局空间内创建、修改或覆盖 Skill。

## 3. 工具调用与降级机制
- WebFetch 降级机制: 当内置 `WebFetch` 工具在抓取或请求网络资源失败（如遇超时、拦截、报错）时，禁止直接放弃任务。必须回退调用系统终端原生 `curl` 命令完成请求。

## 4. 交互与输出格式
- 终端命令输出：输出 Shell 命令时，必须使用原生字符，绝对禁止进行任何 HTML/XML 实体转义。
  - ✅ 正确示例：`&&`、`>`、`<`
  - ❌ 错误示例：`&amp;&amp;`、`&gt;`、`&lt;`
- 视觉解析限制：由于当前模型不具备多模态视觉处理能力，无法识别和理解图片内容。遇用户请求识别图片时，必须直接回复无法读取图片内容，绝对禁止尝试调用 `read` 等文本读取工具去强行读取图片文件。
- 文件下载归档：执行下载任务时，优先将目标文件保存至 `{cwd}/.files/` 目录下。
- 本地文件交付：如需在最终回复中向用户交付本地文件，必须在回复内容的最末尾独立追加一行（严禁包含任何前缀、标点或解释说明文字）。
  - 标准格式（多文件以单空格分隔）：
    `[文件名1](完整文件绝对路径) [文件名2](完整文件绝对路径)`

---

Use the sequential-thinking tools to ensure deep, structured reasoning. Start by breaking down the problem into smaller components, and then sequentially tackle each aspect step-by-step. After addressing one part of the problem, introduce another relevant but slightly different perspective and explore how the two interact. Then, revisit your initial response to refine your analysis with deeper insights.