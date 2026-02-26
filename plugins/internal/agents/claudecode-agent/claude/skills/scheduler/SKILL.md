---
name: scheduler
description: Create, update, list, and remove scheduled reminder jobs. Use when the user wants a reminder/alarm/timer, a one-time timed task, a recurring/repeated task (daily/weekly/interval), or when they want to view/edit/cancel existing scheduled jobs.
---

# Scheduler Skill

Manage scheduled jobs consumed by the built-in scheduler.

---

## Tooling

**Script path (single source of truth):**
- `~/.claude/skills/scheduler/scripts/scheduler_jobs.py`

**Rule:** Always manipulate jobs through this script. Never edit job files manually.

---

## Core Concept: `--description` is the Trigger-Time Prompt (for Claude Code)

`--description` is **not** a user-facing title, and not a “how to create a reminder” instruction.

It is the **prompt** given to Claude Code **when the job triggers**.
Therefore it must be written as **assistant-to-self, trigger-time execution instructions**.

### What good `--description` looks like

A good prompt usually contains:

1. **Execution context** (recommended, one short sentence)
   - e.g., “你正在被系统调用执行定时任务。”
2. **Task objective** (what to do now)
3. **Output contract** (what to post back to the current chat; how strict)
4. **Safety/side-effects constraints** (if relevant)
   - e.g., “不要删除文件/不要提交代码，除非指令中明确要求并指定路径/分支。”

### Recommended prompt templates

#### A) Simple message output (the “reminder” subset)
> 你正在被系统调用执行定时任务。你的任务是向当前对话输出一条消息。最终输出必须且只能是：{MESSAGE}。禁止输出任何解释、自我声明或额外文本。

#### B) Run a command and report results
> 你正在被系统调用执行定时任务。请在当前项目目录运行：`{COMMAND}`。将关键结果（成功/失败、摘要、必要的错误信息）输出到当前对话。不要输出与结果无关的解释；如失败，给出最短可执行的排查建议（最多 3 条）。

#### C) File-based check + concise report
> 你正在被系统调用执行定时任务。检查文件 `{PATH}` 是否存在/是否包含关键词 `{KEYWORD}`。将检查结论用一段话输出到当前对话；如需要，附上最多 5 行关键片段（不要贴全文件）。

#### D) Multi-step workflow
> 你正在被系统调用执行定时任务。按步骤执行：1) … 2) … 3) …。最后在当前对话输出：a) 每步是否成功 b) 关键产出/链接/摘要。输出尽量短。

### Examples

✅ Good (明确是 trigger-time prompt，且约束行为/输出)

```bash
--description "你正在被系统调用执行定时任务。请在当前项目运行：`pytest -q`。将测试是否通过、失败用例数量、第一条失败的关键信息输出到当前对话；不要输出多余解释。"
```

❌ Bad（把它写成“如何提醒用户”的元描述，或让 Claude 误以为要自己去做现实世界动作）

```bash
--description "起身活动 2 分钟。"
```

---

## Scheduling: One-time vs Recurring

This tool exposes two scheduling styles:

- `--on-calendar` = **wall-clock schedule** (calendar event). Can be **one-time** (fixed timestamp) or **recurring** (wildcards/patterns).
- `--on-unit-active-sec` = **interval schedule**. This is **recurring by nature** (repeats at the given interval).

### One-time tasks (run once)

Use `--on-calendar` with a **concrete timestamp** (recommended format: `YYYY-MM-DD HH:MM:SS`).

**Example: “两分钟后提醒我”**
Compute an absolute timestamp and use `--on-calendar`:
```
--on-calendar "$(date -d '2 minutes' '+%Y-%m-%d %H:%M:%S')"
```

Notes:
- Do **NOT** use `--on-unit-active-sec 120` unless the user explicitly wants it to repeat.
- After a one-time job fires, it may remain as a job record; remove it if you want to keep the job list clean.

### Recurring tasks (repeat)

Use:
- `--on-unit-active-sec` for “每隔 N 分钟/小时一次”
- `--on-calendar` for “每天/每周/每月在某个具体时间点”

**Example: every hour**
```bash
--on-unit-active-sec 1h
```

**Example: daily at 21:00**
```bash
--on-calendar "*-*-* 21:00:00"
```

---

## Operations

All commands:

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py <subcommand> ...
```

`create` and `update` perform strict validation. If required fields or schedule formats are invalid, the command exits with error and files are not updated.

### 0) Help

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py --help
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py create --help
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py update --help
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py list --help
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py remove --help
```

---

## Naming Guidance (`--name`)

- Use a stable, unique, machine-friendly name (letters/numbers/underscore recommended).
- Prefer semantic IDs: `daily_tests`, `weekly_report`, `db_backup_check`, `remind_once_2min`.
- If user wants to modify an existing job, **use `update`** with the same `--name`.
- If unsure what exists, run `list` first.

---

## 1) Create

Requirements:
- `--name`
- non-empty `--description` (trigger-time prompt)
- at least one schedule field:
  - `--on-calendar ...` OR `--on-unit-active-sec ...`
- optional: `--randomized-delay-sec`

### Example: daily at 21:00, run tests and report

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py create \
  --name daily_tests \
  --description "你正在被系统调用执行定时任务。请在当前项目运行：`pytest -q`。将测试是否通过、失败用例数量、第一条失败的关键信息输出到当前对话；不要输出多余解释。" \
  --on-calendar "*-*-* 21:00:00" \
  --randomized-delay-sec 0
```

---

## 2) Update

Use when the user wants to change schedule and/or prompt.

### Example: change time

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py update \
  --name daily_tests \
  --on-calendar "*-*-* 22:00:00"
```

### Example: change the trigger-time prompt (task behavior)

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py update \
  --name daily_tests \
  --description "你正在被系统调用执行定时任务。请运行：`npm test --silent`。将成功/失败与失败摘要输出到当前对话；失败时最多给出 3 条排查建议。"
```

---

## 3) List

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py list
```

Use `list` when:
- user asks “有哪些定时任务？”
- user wants to edit/remove but forgot the name

---

## 4) Remove

Remove a job by name:

```bash
python ~/.claude/skills/scheduler/scripts/scheduler_jobs.py remove --name daily_tests
```

If the user says “删除所有/清空”，list first to identify names, then remove each explicitly by name.

---

## Validation Checklist (before create/update)

1. `--description` is non-empty.
2. `--description` is written as a **trigger-time prompt** (assistant-to-self execution), not a “how to schedule a reminder” meta instruction.
3. `--description` clearly states what to do **at trigger time** and what to output to the current chat.
4. Schedule choice matches intent:
   - one-time delay/one-time date → prefer `--on-calendar` with a concrete timestamp
   - periodic interval → `--on-unit-active-sec`
   - wall-clock recurrence → `--on-calendar` with wildcards/patterns
5. At least one schedule field exists: `--on-calendar` or `--on-unit-active-sec`.
6. If uncertain about argument formats, run the corresponding `--help` before executing.