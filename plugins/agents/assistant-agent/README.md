# assistant-agent (Subaru)

一个面向 DM 的私人 LLM 助理插件（Go）。

## 配置（Bot.config）

```json
{
  "base_url": "https://api.openai.com/v1",
  "api_key": "sk-***",
  "model": "gpt-4o-mini"
}
```

## 运行

```bash
go run ./cmd/assistant-agent
```

## 技术路线

核心目标是成为一个能够整理记忆并与用户建立长期情感连接的“赛博伙伴”。她应该像一个坐在用户身边的朋友，能够感知情境、记住重要事情、拥有自己的情绪和个性、主动发起对话，并在需要时为用户提供帮助和陪伴。

设计多层上下文 (Prompt Stack) 结构。  
每次当一个新的“会话记录 (Session Record)”开始时，系统会构建这个完整的上下文，并将其提供给 LLM。

**Prompt Stack 概览**

| 层级 | 组件名称 | 职责与内容 | 更新状态 |
| :--- | :--- | :--- | :--- |
| **L0** | **System Persona** | **人格定义**：定义核心性格、价值观和说话风格。 | 静态 |
| **L1** | **Developer Instructions**| **规则与能力**：定义 LLM 的操作手册，包括工具使用、`SILENCE` 行为和情绪模型。 | 静态 |
| **L2** | **Session Metadata** | **环境感知**：提供对话的初始情境，包括时间、用户活跃度和初始情绪。 | 静态 |
| **L3** | **User Memory (Facts)** | **长期核心记忆**：存储关于用户的稳定事实，由 `FactEngine` 维护。 | 静态 |
| **L4** | **Recent Summaries** | **中期情景记忆**：存储过去会话记录的摘要，提供跨会话的连贯性。 | 静态 |
| **L5** | **Current Session Record**| **短期工作记忆**：当前会话的完整、原始消息流。 | 动态 |

除了 L5 当前会话窗口随着用户/LLM新消息的插入和超过 Token 上限后旧消息的移除而动态变化，L0-L4 的内容在当前会话中是静态的（在会话窗口第一条消息的时候就计算完成）。

> Current Session Record 中消息的 id 与频道/DM中消息的 id 绑定为相同值

### 上下文分层

**3.1 L0: System Persona (系统人格)**
*   **目的**: 塑造 Subaru 独一无二的灵魂。此层应专注于定义“她是谁”，而非“她能做什么”。
*   **内容**: 包含描述性的文本，定义其性格特征（如：外表冷静，内心温柔）、价值观（如：珍视承诺）、兴趣爱好和说话的口癖或风格。
*   **实现要点**: 保持此部分的简洁与纯粹，避免混入功能性指令，以防人格污染。

> This prompt designs originally authored by CJACK (CJackHwang).  
> Source: https://linux.do/t/topic/784164  
> Author: https://github.com/CJackHwang

**3.2 L1: Developer Instructions (开发者指令)**
*   **目的**: 作为 LLM 的操作手册，明确其行为边界和能力。
*   **内容**:
    *   **工具使用规则**: 何时以及如何调用工具。
    *   **`SILENCE` 行为**: 定义触发“已读不回” (`<SILENCE>` Token) 的条件，通常与情绪状态和用户输入的负面程度相关。
    *   **控制指令（Control Tokens）**:
        *   `<WANT_MORE>`：用于“还想继续补充更多内容”的续写请求（系统会再请求一次 LLM，并追加 user message `"(you want to say more)"`）。
        *   `<PROACTIVE>{"delay_seconds":180,"reason":"..."}`：用于申请“延迟一段时间后主动对话”的队列请求（原因与关联 Session Record 会被持久化）。
    *   **情绪模型指令**: 详细解释二维 V-A 情绪模型，告知 LLM 如何理解和更新其内部的 `valence` 和 `arousal` 值。
    *   **记忆交互指令**: 指导 LLM 如何识别用户“记住这个”的意图。

**3.3 L2: Session Metadata (会话元数据)**
*   **目的**: 为每次新会话提供初始的现实世界情境和情绪基调。
*   **内容**:
    *   `session_start_datetime`: 当前会话记录开始的日期和时间，精确到分钟即可。
    *   `time_since_last_message`: 距离上一个会话记录最后一条消息的时间间隔（例如：~12 hours）。
    *   `user_activity_frequency`: 描述用户近期的活跃度指标，例如
        - Active 1 day in the last 1
        - Active 5 days in the last 7
        - Active 18 days in the last 30
    *   `initial_mood`: 一个包含 `{ valence, arousal }` 的对象，基于上一轮情绪和时间衰减模型计算得出。

**3.4 L3: User Memory (Facts) - 长期记忆**
*   **目的**: 存储关于用户的稳定、核心事实，形成对用户的长期认知。
*   **内容**: 一个带 ID 的事实列表，例如 `[F01: User's name is Alex., F02: User is allergic to peanuts.]`。
*   **实现要点**:
    *   **容量限制**: 固定上限为 30 条，以控制上下文大小和成本。保存在本地 json 文件中
    *   **维护者**: 完全由异步后台服务 `FactEngine` 管理。
    *   **遗忘机制**: 采用**最近最少使用 (LRU)** 策略。`FactEngine` 会追踪哪些事实在对话中被提及，并更新其 `LastAccessedAt` 时间戳，在容量满时淘汰最久未被使用的事实。

**3.5 L4: Recent Summaries (近期摘要) - 中期记忆**
*   **目的**: 提供跨会话的上下文连贯性，让LLM知道“我们最近都聊了些什么”，而无需加载海量历史记录。
*   **内容**: 过去 N 个 `Session Record` 的摘要列表，格式为 `[RecordID: <UUID>, Summary: "Discussed user's upcoming project deadline and anxiety about it."]`。
*   **实现要点**:
    *   **精确索引**: 每条摘要必须包含其原始 `RecordID`，供 `HistorySearch` 工具进行精确回溯。
    *   **维护者**: 由异步后台服务 `SummaryGenerator` 在每个会话记录结束后生成，保存在本地 json 文件中

**3.6 L5: Current Session Record (当前会话记录) - 短期记忆**
*   **目的**: 维持当前对话的完整性和流畅性。
*   **内容**: 从本次会话记录的第一条消息开始的、未被压缩的完整对话历史。
*   **实现要点**:
    *   **边界定义**: 当两条消息的时间间隔超过 10 min，系统自动判定旧记录结束，新消息将开启一个全新的 `Session Record`。
    *   **滑动窗口**: 当对话变得过长，超过条数上限时，最旧的消息会被从窗口中移除，但 L0-L4 的内容保持不变。
    *   对话数据保存在 Mew 数据库中，Current Session Record 消息 ID 与 Mew 消息 ID 相同值，可以通过后端搜索接口实现消息检索和工具实现


### **情绪建模与回复机制**

**4.1 情绪建模：二维 V-A 空间 (Valence-Arousal Model)**
*   **模型**: 采用心理学上的 Valence-Arousal 模型来量化和追踪的情绪。
    *   **Valence (情绪效价)**: 情绪的积极/消极度 (-1.0 至 +1.0)。
    *   **Arousal (生理唤醒度)**: 情绪的能量/强度 (-1.0 至 +1.0)。
*   **常见情绪示例（仅作直观参考）**:
    | 情绪 | valence | arousal | 直观解释 |
    | :--- | ---: | ---: | :--- |
    | 平静 / 放松 | +0.2 | -0.4 | 正向但低能量 |
    | 开心 / 愉快 | +0.7 | +0.4 | 正向且有活力 |
    | 兴奋 / 激动 | +0.8 | +0.8 | 高正向高唤醒 |
    | 满足 / 安心 | +0.5 | -0.1 | 稳定正向、略低唤醒 |
    | 无聊 / 倦怠 | -0.2 | -0.5 | 负向且低能量 |
    | 焦虑 / 紧张 | -0.4 | +0.7 | 负向但高唤醒 |
    | 生气 / 恼火 | -0.7 | +0.8 | 高负向高唤醒 |
    | 难过 / 沮丧 | -0.7 | -0.3 | 负向且偏低唤醒 |
*   **工作流**:
    1.  **情绪延续与衰减**: 在新会话开始时，系统使用**指数衰减**公式计算 `initial_mood`：
        `InitialValue = BaselineValue + (LastValue - BaselineValue) * exp(-k * TimeDelta)`
        此公式分别应用于 `valence` 和 `arousal`，使其随时间推移自然地向的基准情绪（`BaselineMood`）回归。
    2.  **对话中更新**: LLM 根据 `Developer Instructions`，在内部根据对话内容实时调整其情绪状态。
    3.  **情绪持久化**: 在每个 `Session Record` 结束时，LLM 需要输出一个 `final_mood: { valence, arousal }` 对象，该对象将被存储起来，作为下一次计算的依据。

**4.2 “已读不回”机制 (`<SILENCE>` Token)**
*   **目的**: 赋予 Subaru 拒绝回复的权利，增强其人格的真实感和自主性。
*   **触发**: `Developer Instructions` 中会定义明确的规则，例如：当 Subaru 的情绪 `valence` 低于某个阈值，且用户输入了攻击性或无理取闹的内容时，LLM 应输出 `<SILENCE>` 特殊 Token。
*   **前端处理**: 客户端接收到 `<SILENCE>` 后，不应显示任何回复气泡。

**4.3 “续写”机制 (`<WANT_MORE>` Token)**
*   **目的**: 允许模型在“本轮还没说完”时请求一次追加生成，而无需用户手动追问。
*   **触发**: LLM 在正文结尾**额外输出一行**且只输出 `<WANT_MORE>`。
*   **系统处理**:
    1.  先发送本轮正文（去掉控制行）。
    2.  再追加一条 user message：`(you want to say more)`，并再次请求一次 LLM 生成补充内容。
    3.  仅续写 1 次（防止无限循环）。

**4.4 主动对话机制（`<PROACTIVE>...` 指令 + 队列）**
*   **目的**: 支持“过几分钟再回来聊”的主动跟进（例如用户分享新歌、让助手稍后提醒/继续聊）。
*   **触发**: LLM 在正文结尾**额外输出一行**：
    *   `<PROACTIVE>{"delay_seconds":180,"reason":"..."}`
*   **持久化队列**: 每个用户一个队列文件 `proactive.json`，每条元素包含：
    *   `added_at`：加入时间
    *   `request_at`：计划触发时间
    *   `reason`：触发原因（简短）
    *   `record_id`：关联的 Session Record ID（用于判断是否还“相关”）
    *   `channel_id`：关联频道（DM）
*   **到点执行与失效判断**:
    *   触发时会先加载 `record_id` 对应的完整 Session Record 文本，并让 LLM 决定“是否需要主动发消息”；如决定不发，输出 `<SILENCE>`。
    *   若用户在延迟期间已经继续对话、导致 `meta.record_id` / `meta.channel_id` 变化，则该队列元素会被视为已失效并丢弃（避免重复打扰）。


### **工具集**

职责明确的函数，用于扩展其获取信息的能力。

**5.1 Tool: RecordSearch**
*   **功能**: 当需要回顾过去某个具体对话的细节时调用。
*   **调用逻辑**:
    1.  首先在 L4 `Recent Summaries` 中寻找相关的 `RecordID`。
    2.  然后调用 `retrieve_record(record_id: "...")` 函数。
    3.  系统返回该 `RecordID` 对应的完整 `Session Record` 文本。

    4.  `Session Record` 文本放入上下文，模型回复
    5.  在模型给出回复后，将 `Session Record` 文本从上下文中用占位符 `[Session Record xxx has read]` 标记替换，避免上下文过长
*   **关键**: **这是一个基于精确 ID 的查找，而非向量检索 (RAG)**，保证了信息的准确性和可控性。

**5.2 Tool: HistorySearch**
*   **功能**: 当需要关键词搜索回顾过去某段具体对话的细节时调用。
*   **调用逻辑**:
    1.  调用 `retrieve_history(keyword: "...")` 函数。
    2.  系统返回该 `keyword` 对应的 10 条消息本文以及对应的 `Session Record ID`。
    3.  如有需要可以继续使用 `RecordSearch` 工具进行更精确的查找。

### **异步后台服务**

为了保证主对话线程的低延迟，所有复杂的记忆处理都在后台异步执行。

**6.1 SummaryGenerator (摘要生成器)**
*   **职责**: 为 `Session Record` 生成摘要。
*   **触发时机**: 在一个 `Session Record` 结束（用户超过 10min未回复）后触发。
*   **流程**: 接收结束的 `RecordID` 和对话文本，调用一个轻量级 LLM 生成摘要，并将结果存入 `Recent Summaries` json 文件。

**6.2 FactEngine (事实引擎)**
*   **职责**: 全权负责 L3 `User Memory (Facts)` 的生命周期管理。
*   Fact 结构：FactID, Content, CreatedAt, LastAccessedAt
*   **触发时机 (多模式)**:
    1.  **即时触发 (On-Demand)**: 用户发出“记住”等明确指令时。
    2.  **周期性触发 (Periodic)**: 每 5 分钟检查一次是否新增对话。
    3.  **终结触发 (End-of-Session)**: 在 `Session Record` 结束后进行一次全面整理。
*   **核心任务**:
    *   从对话 Session Record 中**提取**新的候选事实。
    *   与现有事实进行**更新/合并**，`{id: xxx, content: xxx}`
    *   分析对话内容，**识别**哪些既有事实被提及，并返回 `used_fact_ids` 列表。
    *   系统根据返回的 `used_fact_ids` **更新**事实的 `LastAccessedAt` 时间戳，以支持 LRU 遗忘策略。

**6.3 ProactiveScheduler（主动对话调度）**
*   **职责**: 处理 `<PROACTIVE>...` 写入的队列，到点后判断是否需要主动发消息。
*   **触发时机**: 低频轮询（例如每 10 秒）扫描用户队列，挑选 `request_at <= now` 的元素执行。
*   **安全策略**:
    *   关联 Session Record 已变化则丢弃（用户已继续聊，避免打断）。
    *   每条请求有重试上限（例如最多 3 次），避免异常情况下无限重试。
