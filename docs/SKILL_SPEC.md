# Content OS — Skill Specification

> Skill 标准规范  
> Version: 1.0

---

# 1. Skill Definition

Skill 是 Content OS 的：

> **原子 AI 业务能力。**

Skill 不等于 Agent。

Skill 负责：

> 完成一个明确、可复用、可验证的业务任务。

Agent 负责：

> 决定什么时候调用哪个 Skill。

---

# 2. Skill Architecture

```text
Agent
 ↓
Skill
 ↓
Prompt
 ↓
Tools
 ↓
Knowledge
 ↓
Structured Output
```

---

# 3. Skill Requirements

每个 Skill 必须定义：

```text
Name
Purpose
Input
Output
Workflow
Tools
Constraints
Validation
Failure Handling
Examples
```

---

# 4. Skill Directory

```text
skills/

├── topic-research/
├── content-search/
├── viral-analysis/
├── audience-analysis/
├── angle-generation/
├── content-strategy/
├── writing/
├── humanization/
└── evaluation/
```

---

# 5. SKILL.md Template

每个 Skill 的：

```text
SKILL.md
```

必须包含：

```markdown
# Skill Name

## Purpose

## When To Use

## Input

## Output

## Workflow

## Tools

## Constraints

## Validation

## Failure Handling

## Examples
```

---

# 6. Input

Input 必须结构化。

例如：

```typescript
type ViralAnalysisInput = {
  contentId: string
  content: string
  metrics?: ContentMetrics
}
```

---

# 7. Output

Output 必须结构化。

例如：

```typescript
type ViralAnalysisOutput = {
  hookScore: number
  emotionScore: number
  relatabilityScore: number
  noveltyScore: number
  structureScore: number
  shareabilityScore: number
  viralScore: number
  reasoning: string
}
```

---

# 8. Score Rules

所有评分必须：

```text
0～100
```

并定义：

```text
0～20
21～40
41～60
61～80
81～100
```

对应含义。

---

# 9. Skill Responsibilities

Skill 只负责自己的任务。

例如：

```text
viral-analysis
```

负责：

> 分析内容为什么可能具有传播性。

不负责：

> 生成文章。

---

# 10. Skill Independence

Skill 必须尽可能：

```text
Input
 ↓
Process
 ↓
Output
```

避免依赖其他 Skill 的内部实现。

如果需要其他 Skill：

> 由 Agent Orchestrator 调度。

---

# 11. Tool Access

Skill 可以使用 Tool。

例如：

```text
content-search
 ↓
Firecrawl
```

但 Skill 不应该直接管理：

```text
Authentication
Database Connection
UI
```

---

# 12. Knowledge Access

Skill 可以读取：

```text
Knowledge Base
```

但必须通过：

```text
Repository
Retriever
Service
```

访问。

---

# 13. Validation

每个 Skill 必须验证：

```text
Input
Output
Score Range
Required Fields
```

---

# 14. Failure

可能失败：

```text
Invalid Input
Tool Failure
AI Failure
Missing Data
Timeout
Low Confidence
```

必须返回明确错误。

---

# 15. Core Skills

## 15.1 topic-research

输入：

```text
Topic
```

输出：

```text
Topic Profile
Research Questions
Keywords
Research Directions
```

---

## 15.2 content-search

输入：

```text
Research Queries
```

输出：

```text
Content[]
```

---

## 15.3 viral-analysis

输入：

```text
Content
Metrics
```

输出：

```text
Viral Score
Dimension Scores
Reasoning
```

---

## 15.4 audience-analysis

输入：

```text
Content
Comments
Metrics
```

输出：

```text
Audience Insights
```

---

## 15.5 angle-generation

输入：

```text
Topic
Research
Analysis
Insights
```

输出：

```text
3～5 Angles
```

---

## 15.6 content-strategy

输入：

```text
Selected Angle
Audience
Emotion
Research
```

输出：

```text
Content Strategy
```

---

## 15.7 writing

输入：

```text
Strategy
```

输出：

```text
Draft
```

---

## 15.8 humanization

输入：

```text
Draft
```

输出：

```text
Humanized Draft
Issues
Changes
```

---

## 15.9 evaluation

输入：

```text
Draft
Strategy
Platform
```

输出：

```text
Evaluation
```

---

# 16. Skill Versioning

Skill 必须有版本：

```text
1.0.0
```

修改：

```text
Major
Minor
Patch
```

---

# 17. Skill Testing

每个 Skill 必须至少拥有：

```text
Happy Path
Edge Case
Invalid Input
Failure Case
```

---

# 18. Skill Evaluation

Skill 需要记录：

```text
accuracy
latency
cost
failure_rate
user_acceptance
```

---

# 19. Skill Principle

Skill 必须：

> 单一职责、结构化输入、结构化输出、可测试、可替换。

---

# 20. Skill 与 Agent 的边界

```text
Skill：

“怎么完成一个任务？”

Agent：

“下一步应该做什么？”
```

这是 Content OS 最重要的架构边界之一。