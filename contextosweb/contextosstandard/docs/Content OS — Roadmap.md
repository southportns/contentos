# Content OS — Roadmap

> 开发路线图  
> Version: 1.0

---

# 1. Development Strategy

采用：

> **Vertical Slice First**

而不是：

> 先把所有基础设施全部开发完。

第一目标：

> 尽快跑通一个完整的 Topic → Research → Angle → Writing → Evaluation 闭环。

---

# 2. Phase 0 — Project Foundation

## P0-01 项目初始化

### Tasks

```text
创建 Next.js 项目
配置 TypeScript
配置 Tailwind
配置 shadcn/ui
配置 ESLint
配置 Prettier
```

### Acceptance

```text
npm run dev
npm run lint
npm run build
```

全部通过。

---

# 3. P0-02 Project Documentation

建立：

```text
PROJECT.md
PRODUCT_SPEC.md
ARCHITECTURE.md
AGENTS.md
DEVELOPMENT.md
SKILL_SPEC.md
ROADMAP.md
```

Acceptance：

> Agent 能够根据文档理解项目结构。

---

# 4. P0-03 Application Shell

完成：

```text
Dashboard
Sidebar
Header
Workspace
Navigation
```

Acceptance：

> 用户可以进入 Content Workspace。

---

# 5. P0-04 Database Foundation

建立：

```text
User
Project
Topic
ResearchSession
Content
```

Acceptance：

```text
Create
Read
Update
Delete
```

正常运行。

---

# 6. P0-05 AI Runtime

接入：

```text
Vercel AI SDK
LangGraph
```

建立：

```text
Agent
State
Run
```

Acceptance：

> AI Agent 能完成一个最简单 Workflow。

---

# 7. P0-06 Research

接入：

```text
Firecrawl
```

建立：

```text
topic-research
content-search
```

Acceptance：

```text
输入 Topic
 ↓
Search
 ↓
获取 Content
 ↓
保存数据库
```

---

# 8. P0-07 Content Analysis

开发：

```text
viral-analysis
```

Acceptance：

系统能够分析：

```text
Hook
Emotion
Relatability
Novelty
Structure
Shareability
```

---

# 9. P0-08 Audience Insight

开发：

```text
audience-analysis
```

Acceptance：

输出：

```text
Pain Points
Emotions
Questions
Opinions
Controversies
```

---

# 10. P0-09 Angle Generation

开发：

```text
angle-generation
```

Acceptance：

一次生成：

```text
3～5 Angles
```

用户可以选择一个。

---

# 11. P0-10 Content Strategy

开发：

```text
content-strategy
```

Acceptance：

生成：

```text
Hook
Structure
Emotion Curve
Story
Conflict
Ending
CTA
```

---

# 12. P0-11 Writing

接入：

```text
Tiptap
```

开发：

```text
writing
```

Acceptance：

用户能够：

```text
生成文章
编辑
AI Rewrite
AI Continue
```

---

# 13. P0-12 Evaluation

开发：

```text
evaluation
```

Acceptance：

生成：

```text
Overall Score
Dimension Scores
Issues
Suggestions
```

---

# 14. P0-13 完整闭环

最终：

```text
Topic
 ↓
Research
 ↓
Content
 ↓
Viral Analysis
 ↓
Audience Insight
 ↓
Angles
 ↓
Strategy
 ↓
Writing
 ↓
Evaluation
```

Acceptance：

> 一个真实用户可以完整完成一次内容创作。

---

# 15. Phase 1 — Knowledge Layer

## P1-01 pgvector

加入：

```text
Embeddings
Semantic Search
```

---

## P1-02 Knowledge Retrieval

支持：

```text
Similar Content
Similar Topics
Related Insights
```

---

## P1-03 Document Import

接入：

```text
Unstructured
```

支持：

```text
PDF
DOCX
Markdown
TXT
```

---

# 16. Phase 2 — Research Intelligence

## P2-01 Deep Research

参考：

```text
Firesearch
Open Researcher
```

实现：

```text
Query Planning
Multi-step Research
Source Validation
Research Synthesis
```

---

# 17. Phase 3 — Workflow Intelligence

## P3-01 Workflow Visualization

接入：

```text
React Flow
```

展示：

```text
Agent
Skill
Tool
Human Approval
```

---

## P3-02 Custom Workflow

允许用户：

```text
添加 Skill
删除 Skill
调整顺序
设置条件
```

---

# 18. Phase 4 — Content Intelligence

增加：

```text
Trend Detection
Viral Prediction
Author Profile
Audience Profile
Platform Analysis
```

---

# 19. Phase 5 — Feedback Loop

用户发布内容后：

```text
Published Content
 ↓
Performance Data
 ↓
Evaluation
 ↓
Compare Prediction
 ↓
Update Knowledge
```

---

# 20. Phase 6 — Personal Content OS

系统学习用户：

```text
Writing Style
Preferred Topics
Preferred Emotions
Preferred Structures
Successful Angles
Failed Angles
```

最终形成：

> User Writing Profile

---

# 21. Phase 7 — Production Infrastructure

加入：

```text
LiteLLM
Langfuse
E2B
```

实现：

```text
Multi-model
Observability
Sandbox
Cost Control
```

---

# 22. Priority

## P0 — 必须完成

```text
Web
Database
AI Runtime
Research
Viral Analysis
Audience Insight
Angle
Writing
Evaluation
```

## P1 — 应该完成

```text
Vector Search
Knowledge Base
Document Import
Deep Research
```

## P2 — 后期

```text
Workflow Builder
Trend
Prediction
Personalization
Multi-model Gateway
Observability
Sandbox
```

---

# 23. Task Rules

每个开发任务必须包含：

```text
Task ID
Goal
Dependencies
Input
Output
Files
Acceptance Criteria
Test Requirements
```

---

# 24. Development Order

严格按照：

```text
P0-01
 ↓
P0-02
 ↓
P0-03
 ↓
P0-04
 ↓
P0-05
 ↓
P0-06
 ↓
P0-07
 ↓
P0-08
 ↓
P0-09
 ↓
P0-10
 ↓
P0-11
 ↓
P0-12
 ↓
P0-13
```

执行。

---

# 25. No Premature Optimization

P0 阶段禁止提前加入：

```text
Qdrant
E2B
LiteLLM
Langfuse
复杂 Knowledge Graph
复杂 Workflow Builder
自动发布
```

除非某个 Task 明确要求。

---

# 26. MVP Completion Criteria

MVP 完成必须满足：

```text
用户可以创建 Project

↓

输入 Topic

↓

启动 Research

↓

获取真实内容

↓

查看爆款分析

↓

查看 Audience Insight

↓

选择 Angle

↓

生成 Strategy

↓

生成 Draft

↓

编辑 Draft

↓

获得 Evaluation
```

---

# 27. First Real User Test

MVP 完成后必须使用真实主题进行测试。

例如：

```text
我们一生都在追求被爱的过程。
```

完整跑一遍。

记录：

```text
Research Time
AI Cost
Agent Duration
Number of Sources
Number of Contents
Angle Quality
Draft Quality
User Modification
Final Score
```

---

# 28. Roadmap Principle

开发顺序必须遵循：

```text
产品闭环
 >
基础设施完整
 >
高级能力
```

优先验证：

> **Content OS 是否真的能够帮助用户产生更好的内容。**

而不是：

> 是否拥有最多的 AI 功能。