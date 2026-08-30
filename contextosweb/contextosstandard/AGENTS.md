# Content OS — AGENTS.md

> AI Agent 开发规范  
> Version: 1.0

---

# 1. Mission

你正在开发：

> Content OS

这是一个：

> AI 内容研究、爆款分析、内容决策与写作系统。

你的目标不是快速生成 Demo。

你的目标是：

> **构建可长期维护、可扩展、可验证的产品。**

---

# 2. Before Coding

任何任务开始前必须：

```text
1. 阅读 PROJECT.md
2. 阅读 PRODUCT_SPEC.md
3. 阅读 ARCHITECTURE.md
4. 阅读 SKILL_SPEC.md
5. 阅读 DEVELOPMENT.md
6. 阅读 ROADMAP.md
7. 检查现有代码
8. 检查相关 Skill
9. 检查相关数据库模型
```

禁止直接开始编码。

---

# 3. Task Scope

一次只解决当前 Task。

不得：

- 擅自扩展需求
- 顺手重构整个项目
- 修改无关模块
- 添加未要求功能

---

# 4. Architecture Rules

必须遵守：

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
UI → LLM
UI → Database
Skill → UI
Tool → UI
```

---

# 5. Skill Rules

所有 AI 业务能力必须优先考虑：

> 是否应该成为 Skill？

禁止把复杂 AI 逻辑直接写进：

```text
React Component
API Route
Page
```

---

# 6. Database Rules

任何数据库修改必须：

```text
修改 Schema
 ↓
Migration
 ↓
更新类型
 ↓
测试
```

禁止：

> 只修改数据库但不更新 Prisma Schema。

---

# 7. AI Output Rules

优先使用：

```text
Structured Output
```

而不是依赖：

```text
Free-form Text
```

例如：

```json
{
  "viral_score": 87,
  "emotion_score": 91,
  "reasoning": "..."
}
```

---

# 8. AI Reliability

Agent 必须处理：

```text
Timeout
Retry
Invalid Output
Missing Data
Tool Failure
Model Failure
```

不能假设：

> LLM 永远返回正确格式。

---

# 9. External Data Rules

禁止虚构：

```text
点赞
评论
收藏
发布时间
作者
URL
```

如果没有数据：

```text
null
unknown
unavailable
```

而不是生成一个看起来合理的数字。

---

# 10. User Approval

以下步骤必须支持 Human Approval：

```text
Angle Selection
Content Strategy
Final Draft
```

Agent 不得默认跳过。

---

# 11. Web Research

Research 必须：

```text
Search
 ↓
Source
 ↓
Extract
 ↓
Analyze
```

重要结论必须保留 Source。

---

# 12. Code Quality

要求：

```text
TypeScript strict
No any unless justified
Small functions
Single responsibility
Clear naming
No duplicated business logic
```

---

# 13. Components

React Component 不应该包含复杂业务逻辑。

应使用：

```text
hooks
services
lib
agents
skills
```

进行拆分。

---

# 14. API

API 必须：

```text
Validate Input
Authenticate
Authorize
Execute
Handle Error
Return Typed Response
```

---

# 15. Error Handling

错误必须分类：

```text
ValidationError
AuthenticationError
AuthorizationError
ToolError
AIError
DatabaseError
SystemError
```

---

# 16. Testing

新功能至少需要：

```text
Unit Test
```

涉及 API / Agent 时增加：

```text
Integration Test
```

涉及完整用户流程时：

```text
E2E Test
```

---

# 17. Before Finishing Task

必须执行：

```text
1. Type Check
2. Lint
3. Test
4. Build
```

如果某项失败：

> 不允许声称任务完成。

---

# 18. Documentation

新增：

```text
Feature
Skill
API
Database
Environment Variable
```

必须同步更新对应文档。

---

# 19. Environment Variables

禁止：

```text
commit API key
commit secret
commit token
```

必须使用：

```text
.env.local
```

并提供：

```text
.env.example
```

---

# 20. Git

Commit 使用：

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

---

# 21. Do Not

禁止：

```text
为了修一个 bug 重写整个模块
为了方便绕过架构
为了 Demo 写死数据
把 AI 输出直接保存为不可解析文本
复制大量第三方代码
添加没有明确价值的依赖
```

---

# 22. Definition of Done

一个 Task 只有同时满足：

```text
功能完成
+
类型正确
+
测试通过
+
Lint 通过
+
Build 通过
+
文档更新
+
没有破坏已有功能
```

才算完成。

---

# 23. Final Rule

如果需求与现有架构冲突：

> 不允许自行选择。

必须：

```text
暂停
 ↓
说明冲突
 ↓
提出方案
 ↓
等待确认
```