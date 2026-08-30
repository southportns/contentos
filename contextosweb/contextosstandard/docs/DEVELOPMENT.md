# Content OS — Development Guide

> 开发规范  
> Version: 1.0

---

# 1. Technology Stack

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

## Backend

```text
Next.js Server
Node.js
```

## AI

```text
Vercel AI SDK
LangGraph
```

## Database

```text
PostgreSQL
Prisma
pgvector
```

## Research

```text
Firecrawl
```

## Editor

```text
Tiptap
```

---

# 2. Project Structure

```text
content-os/

├── app/
│
├── components/
│
├── hooks/
│
├── lib/
│   ├── ai/
│   ├── agents/
│   ├── services/
│   ├── repositories/
│   ├── tools/
│   └── utils/
│
├── skills/
│
├── prisma/
│
├── prompts/
│
├── tests/
│
├── docs/
│
├── PROJECT.md
├── PRODUCT_SPEC.md
├── ARCHITECTURE.md
├── AGENTS.md
├── DEVELOPMENT.md
├── SKILL_SPEC.md
└── ROADMAP.md
```

---

# 3. Naming

## Files

```text
kebab-case
```

例如：

```text
content-analysis.ts
topic-research.ts
```

## React Components

```text
PascalCase
```

例如：

```text
TopicWorkspace.tsx
ResearchPanel.tsx
```

## Functions

```text
camelCase
```

例如：

```text
analyzeContent()
generateAngles()
```

---

# 4. TypeScript

必须：

```text
strict: true
```

禁止无意义：

```typescript
any
```

优先：

```typescript
unknown
```

然后进行类型收窄。

---

# 5. React

优先：

```text
Server Components
```

只有需要：

```text
state
effect
browser API
interaction
```

时使用：

```text
"use client"
```

---

# 6. API Design

统一：

```text
/api/topics
/api/research
/api/contents
/api/analysis
/api/angles
/api/writing
/api/evaluation
```

API：

```text
POST
GET
PATCH
DELETE
```

按照资源语义设计。

---

# 7. Validation

所有外部输入必须验证。

推荐：

```text
Zod
```

例如：

```typescript
const TopicInput = z.object({
  topic: z.string().min(1),
  platform: z.string().optional()
})
```

---

# 8. Database

数据库访问必须经过：

```text
Repository
Service
```

禁止 React Component 直接访问数据库。

---

# 9. Prisma

数据库模型：

```text
prisma/schema.prisma
```

修改流程：

```text
修改 Schema
 ↓
Migration
 ↓
Generate
 ↓
Type Check
 ↓
Test
```

---

# 10. AI

所有模型调用集中在：

```text
lib/ai/
```

禁止散落：

```text
page.tsx
component.tsx
```

中。

---

# 11. Structured AI

优先：

```text
generateObject
```

或等价 Structured Output。

AI 输出必须定义 Schema。

---

# 12. Streaming

用户可见的 AI 长任务使用 Streaming。

例如：

```text
Research
Writing
Analysis
```

显示：

```text
正在搜索...
正在分析...
正在生成...
```

---

# 13. Agent

Agent 代码放：

```text
lib/agents/
```

Skill：

```text
skills/
```

Tool：

```text
lib/tools/
```

---

# 14. Skill

每个 Skill 至少包含：

```text
SKILL.md
```

如果有代码：

```text
index.ts
schema.ts
prompts.ts
```

---

# 15. Error Handling

不要：

```typescript
catch (e) {
  console.log(e)
}
```

必须：

```text
记录
分类
返回
处理
```

---

# 16. Logging

日志至少包含：

```text
request_id
user_id
project_id
agent_run_id
skill_id
duration
status
```

禁止记录：

```text
API Key
密码
Token
敏感信息
```

---

# 17. Testing

## Unit

测试：

```text
Score
Parser
Normalizer
Prompt Builder
Validators
```

## Integration

测试：

```text
API
Database
Agent
Tools
```

## E2E

核心流程：

```text
Create Project
 ↓
Create Topic
 ↓
Research
 ↓
Generate Angle
 ↓
Write
 ↓
Evaluate
```

---

# 18. Performance

优先关注：

```text
Initial Load
LCP
TTFB
API Latency
AI First Token
Research Duration
```

---

# 19. Dependencies

添加依赖前检查：

```text
是否已有类似能力？
是否真的需要？
项目是否活跃？
License 是否允许？
Bundle 是否合理？
```

---

# 20. Git Workflow

```text
main
develop
feature/*
fix/*
```

提交：

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

---

# 21. Pull Request

PR 必须说明：

```text
What
Why
How
Testing
Risk
```

---

# 22. Environment

必须提供：

```text
.env.example
```

例如：

```text
DATABASE_URL=
FIRECRAWL_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

真实密钥只能存在：

```text
.env.local
```

---

# 23. Development Workflow

标准开发流程：

```text
Read Task
 ↓
Read Docs
 ↓
Inspect Code
 ↓
Plan
 ↓
Implement
 ↓
Test
 ↓
Lint
 ↓
Build
 ↓
Review
 ↓
Update Docs
```

---

# 24. Definition of Done

必须：

```text
功能完成
类型通过
测试通过
Lint 通过
Build 通过
文档同步
```

---

# 25. Principle

代码应该：

> 简单、明确、可测试、可替换。

不要：

> 为未来不存在的需求提前设计复杂系统。