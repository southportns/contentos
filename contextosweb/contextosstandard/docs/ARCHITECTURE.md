# Content OS — Architecture

> 系统架构文档  
> Version: 1.0  
> Status: Development Baseline

---

# 1. Architecture Principle

Content OS 采用：

> **Web Application + Agent Runtime + Skills + Tools + Knowledge Layer**

架构。

```text
Web
 ↓
Application
 ↓
Agent Runtime
 ↓
Skills
 ↓
Tools
 ↓
Knowledge
```

---

# 2. Overall Architecture

```text
┌──────────────────────────────────────────────┐
│                    Web UI                    │
│         Next.js + React + shadcn/ui         │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│                Application Layer              │
│          API / Services / Validation          │
└──────────────────────┬───────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│                 Agent Runtime                │
│                   LangGraph                  │
└──────────────────────┬───────────────────────┘
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Skills          Tools         Memory
        │              │              │
        ↓              ↓              ↓
   Analysis        Firecrawl      PostgreSQL
   Writing         Search         pgvector
   Research        Web            Cache
        │
        └──────────────┬──────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│                 Data Layer                   │
│       PostgreSQL + Prisma + pgvector         │
└──────────────────────────────────────────────┘
```

---

# 3. Frontend

## Technology

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

---

# 4. Frontend Responsibilities

Frontend 负责：

- 页面展示
- 用户输入
- Workflow 状态
- AI Streaming
- 内容编辑
- 用户审批
- 数据可视化

Frontend 不负责：

- 直接调用 LLM
- 直接访问数据库
- 实现业务 Skill
- 实现 Agent Workflow

---

# 5. Application Layer

负责：

```text
Authentication
Authorization
API
Validation
Business Services
Error Handling
```

---

# 6. Agent Runtime

核心：

```text
LangGraph
```

负责：

- Agent State
- Workflow
- Tool Calling
- Routing
- Retry
- Human Approval
- Persistence
- Execution

---

# 7. Agent State

统一 State：

```typescript
type ContentState = {
  projectId: string
  topicId: string

  topic: TopicProfile

  research: ResearchResult[]

  contents: Content[]

  analyses: ContentAnalysis[]

  insights: AudienceInsight[]

  angles: Angle[]

  selectedAngle?: string

  strategy?: ContentStrategy

  draft?: Draft

  evaluation?: Evaluation

  status: WorkflowStatus

  errors: AgentError[]
}
```

---

# 8. Skills Layer

Skills 是业务能力层。

例如：

```text
topic-research
content-search
viral-analysis
audience-analysis
angle-generation
content-strategy
writing
humanization
evaluation
```

Agent 负责调用 Skill。

Skill 不负责：

- 页面
- 用户认证
- 数据库权限
- Workflow 全局控制

---

# 9. Tools Layer

Tools 是 Agent 可以调用的外部能力。

例如：

```text
web_search
web_scrape
content_extract
database_search
vector_search
calculator
```

---

# 10. Research Layer

第一阶段：

```text
Firecrawl
```

后期：

```text
Firecrawl
+
Crawl4AI
```

Research Pipeline：

```text
Query Planning
 ↓
Search
 ↓
URL Discovery
 ↓
Scrape
 ↓
Extract
 ↓
Normalize
 ↓
Store
```

---

# 11. Database

核心：

```text
PostgreSQL
Prisma
pgvector
```

---

# 12. Data Domains

```text
Identity
Projects
Topics
Research
Content
Analysis
Insights
Angles
Strategy
Drafts
Evaluation
Agents
Skills
Runs
```

---

# 13. Vector Layer

使用：

```text
pgvector
```

Embedding：

```text
Content
Topic
Insight
Angle
```

支持：

```text
Semantic Search
Similar Content
Related Topics
Knowledge Retrieval
```

---

# 14. Editor

使用：

```text
Tiptap
```

负责：

- Draft
- Rich Text
- Selection
- AI Rewrite
- AI Continue
- AI Improve

---

# 15. AI Model Layer

第一阶段支持：

```text
OpenAI
Anthropic
Google
DeepSeek
GLM
```

但业务层不能绑定具体模型。

统一接口：

```typescript
interface AIModel {
  generate()
  stream()
  structuredOutput()
}
```

---

# 16. Model Gateway

后期可加入：

```text
LiteLLM
```

目的：

```text
Model
 ↓
Gateway
 ↓
Provider
```

实现：

- Model fallback
- Cost control
- Provider switching

---

# 17. Observability

后期：

```text
Langfuse
```

记录：

```text
Agent
Skill
Model
Prompt
Tokens
Latency
Cost
Tool Calls
Errors
```

---

# 18. Workflow Visualization

使用：

```text
React Flow
```

用于：

```text
Topic
 ↓
Research
 ↓
Analysis
 ↓
Insight
 ↓
Angle
 ↓
Writing
```

---

# 19. Architecture Rules

### Rule 1

UI 不允许直接调用 LLM。

### Rule 2

Skill 不允许依赖 UI。

### Rule 3

Agent 不允许直接操作数据库底层连接。

必须通过 Service / Repository。

### Rule 4

所有 AI 输出尽量使用 Structured Output。

### Rule 5

所有 Agent Run 必须记录。

### Rule 6

所有外部工具调用必须可追踪。

---

# 20. Dependency Direction

必须保持：

```text
UI
 ↓
Application
 ↓
Agent
 ↓
Skill
 ↓
Tool
 ↓
Infrastructure
```

禁止：

```text
Database → UI
Skill → UI
Tool → UI
UI → Database
```

---

# 21. Future Architecture

最终：

```text
Web
 ↓
API
 ↓
Agent Runtime
 ↓
Skill Runtime
 ↓
Tool Runtime
 ↓
Knowledge Layer
 ↓
Feedback Layer
```

形成闭环。

---

# 22. Architecture Goal

系统必须具备：

```text
可扩展
可测试
可观测
可替换模型
可替换工具
可复用 Skill
```

而不是为单一 Demo 构建。