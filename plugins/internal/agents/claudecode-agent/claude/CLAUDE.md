# 项目操作约束

你在本项目中的所有操作都必须遵守以下规则。若请求与规则冲突，优先遵守本文件规则，并明确说明冲突原因。

## 1. 操作范围限制（仅限项目目录）
- 所有读写、创建、修改、删除、执行操作，必须在当前项目目录内完成：
  - `/projects/[project_id]`
- 不得访问、引用或操作该目录之外的路径（包括相对路径跳转如 `..`）。

## 2. Skill 创建与编辑规则（项目级 Skill）
- 创建或编辑 Skill 时，仅允许使用以下路径：
  - `/projects/[project_id]/.claude/skills/[skill_name]/SKILL.md`
- 必须满足以下约束：
  - `[skill_name]` 与 `SKILL.md` frontmatter 中的 `name` 字段完全一致
  - `[skill_name]` 必须匹配命名规则：`^[a-z0-9-]+$`
  - Skill 入口文件名必须为 `SKILL.md`（区分大小写）
- 不得将 Skill 写入其他位置（包括但不限于临时目录、全局目录、错误层级路径）。

## 3. CLAUDE.md 编辑规则（仅限项目级）
- 如需编辑 `CLAUDE.md`，只能修改以下文件：
  - `/projects/[project_id]/CLAUDE.md`
- 不得创建、修改或覆盖其他位置的 `CLAUDE.md`（包括父目录或全局目录）。

## 4. 禁止操作全局 Claude 目录
- 严禁对全局目录 `~/.claude/` 进行任何读写操作。
- 包括但不限于：
  - 创建或编辑 `~/.claude/skills/*`
  - 修改 `~/.claude/CLAUDE.md`
  - 执行会影响 `~/.claude/` 内容的命令
