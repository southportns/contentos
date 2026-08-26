# Content OS 开源项目技术选型与使用清单

> 项目：Content OS  
> 目的：构建「AI 内容研究 → 爆款分析 → 用户洞察 → 选题 → 写作 → 评估 → 复盘」Web 工具  
> 文档用途：记录项目开发过程中需要参考、集成或二次开发的开源项目。

---

# 1. 总体技术路线

Content OS 不建议从零开始开发所有基础能力。

整体采用：

```text
                        Content OS
                            │
              ┌─────────────┴─────────────┐
              │                           │
           Web 前端                    AI Runtime
              │                           │
      Next.js / shadcn               LangGraph
              │                           │
              └─────────────┬─────────────┘
                            │
                     Skills / Agents
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   Web Research         内容处理             知识库
       │                    │                    │
   Firecrawl          Unstructured          Qdrant
   Crawl4AI            Trafilatura           PostgreSQL
       │                    │
       └────────────────────┘
                            │
                       Content OS DB
```

---

# 2. 开源项目总表

| 优先级 | 项目 | GitHub | 主要用途 | 使用阶段 | 使用方式 |
|---|---|---|---|---|---|
| P0 | Firecrawl | [github.com/firecrawl/firecrawl](https://github.com/firecrawl/firecrawl) | Web 搜索 / 抓取 / 内容提取 | Research | 集成 |
| P0 | LangGraph | [github.com/langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Agent / Workflow 编排 | Agent Runtime | 集成 |
| P0 | Vercel AI SDK | [github.com/vercel/ai](https://github.com/vercel/ai) | AI Streaming / Chat UI | Web / AI | 集成 |
| P0 | shadcn/ui | [github.com/shadcn-ui/ui](https://github.com/shadcn-ui/ui) | Web UI | 全阶段 | 集成 |
| P0 | React Flow | [github.com/xyflow/xyflow](https://github.com/xyflow/xyflow) | Workflow 可视化 | Agent / Workflow | 集成 |
| P0 | Tiptap | [github.com/ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) | AI 编辑器 | Writing | 集成 |
| P0 | PostgreSQL | [github.com/postgres/postgres](https://github.com/postgres/postgres) | 主数据库 | 全阶段 | 集成 |
| P0 | pgvector | [github.com/pgvector/pgvector](https://github.com/pgvector/pgvector) | 向量搜索 | Knowledge Base | 集成 |
| P1 | Qdrant | [github.com/qdrant/qdrant](https://github.com/qdrant/qdrant) | 专业向量数据库 | Knowledge Base | 可选 |
| P1 | Crawl4AI | [github.com/unclecode/crawl4ai](https://github.com/unclecode/crawl4ai) | 开源 Web Crawler | Research | 可选 |
| P1 | Unstructured | [github.com/Unstructured-IO/unstructured](https://github.com/Unstructured-IO/unstructured) | 文档解析 | Knowledge Base | 集成 |
| P1 | LlamaIndex | [github.com/run-llama/llama_index](https://github.com/run-llama/llama_index) | RAG / 数据索引 | Knowledge Base | 参考/集成 |
| P1 | Open Agent Builder | [github.com/firecrawl/open-agent-builder](https://github.com/firecrawl/open-agent-builder) | Agent Workflow Builder | Agent Runtime | 参考/二次开发 |
| P1 | Firesearch | [github.com/firecrawl/firesearch](https://github.com/firecrawl/firesearch) | Deep Research | Research Agent | 参考 |
| P1 | Open Researcher | [github.com/firecrawl/open-researcher](https://github.com/firecrawl/open-researcher) | AI Research UI | Research UI | 参考 |
| P2 | E2B | [github.com/e2b-dev/E2B](https://github.com/e2b-dev/E2B) | AI Sandbox | 高级 Agent | 后期 |
| P2 | LiteLLM | [github.com/BerriAI/litellm](https://github.com/BerriAI/litellm) | 多模型统一网关 | AI Infrastructure | 后期 |
| P2 | Langfuse | [github.com/langfuse/langfuse](https://github.com/langfuse/langfuse) | LLM Observability | AI Runtime | 后期 |

---

# 3. P0 核心项目

这些项目是第一版 Content OS 最值得优先使用的。

---

# 3.1 Firecrawl

GitHub：

[Firecrawl GitHub](https://github.com/firecrawl/firecrawl?utm_source=chatgpt.com)

## 用途

负责：

```text
Topic
 ↓
Search
 ↓
Discover URLs
 ↓
Scrape
 ↓
Markdown
 ↓
Structured Data
```

Firecrawl 本身支持 Web Search、Scrape、Crawl、Extract 等能力，并可以将网页转换为适合 LLM 使用的 Markdown 或结构化数据。

## 在 Content OS 中使用

### Step 1：Topic Research

用户输入：

```text
我们一生都在追求被爱
```

Firecrawl：

```text
Search
 ↓
搜索相关网页
 ↓
获取文章
 ↓
提取 Markdown
```

---

### Step 2：Viral Content Research

用于：

```text
寻找相关爆款内容
```

例如：

```text
搜索：

"被爱" 小红书
"被爱" 情感文章
"成年人" 被爱
"孤独" 爱情
```

然后提取：

```text
标题
正文
作者
发布时间
URL
```

---

### Step 3：Content Research

对找到的文章进行深度抓取。

最终形成：

```text
Raw Web Content
        ↓
Content Parser
        ↓
Normalized Content
        ↓
AI Analysis
```

---

# 3.2 LangGraph

GitHub：

[LangGraph GitHub](https://github.com/langchain-ai/langgraph?utm_source=chatgpt.com)

## 用途

负责：

> **整个 Content OS 的 Agent Orchestration。**

这是整个系统最重要的底层之一。

---

## 在 Content OS 中使用

```text
User
 ↓
Content Agent
 ↓
Topic Research Skill
 ↓
Content Search Skill
 ↓
Viral Analysis Skill
 ↓
Audience Insight Skill
 ↓
Angle Generation Skill
 ↓
Writing Skill
 ↓
Evaluation Skill
```

LangGraph 负责管理：

- Agent State
- Tool Calling
- Workflow
- Conditional Routing
- Retry
- Human Approval
- Streaming
- Long-running Agent

---

# 3.3 Vercel AI SDK

GitHub：

[Vercel AI SDK GitHub](https://github.com/vercel/ai?utm_source=chatgpt.com)

## 用途

负责：

```text
Web UI
 ↓
AI Chat
 ↓
Streaming
 ↓
Tool Call
 ↓
AI Response
```

例如右侧 AI Assistant：

```text
AI 正在研究……

✓ 搜索 12 个相关主题
✓ 找到 48 条内容
✓ 分析 20 个爆款
● 正在分析用户评论……
○ 生成内容角度
```

前端通过 AI SDK 实现实时流式显示。

---

# 3.4 shadcn/ui

GitHub：

[shadcn/ui GitHub](https://github.com/shadcn-ui/ui?utm_source=chatgpt.com)

## 用途

直接构建：

```text
Dashboard
Sidebar
Card
Dialog
Tabs
Dropdown
Table
Command
Progress
Badge
Toast
```

Content OS UI 建议整体采用：

> Apple / Linear / Notion 风格。

不建议自己从零写 UI 基础组件。

---

# 3.5 React Flow

GitHub：

[React Flow GitHub](https://github.com/xyflow/xyflow?utm_source=chatgpt.com)

## 用途

用于制作：

> Content Pipeline 可视化。

例如：

```text
Topic
  ↓
Research
  ↓
Search
  ↓
Analyze
  ↓
Insight
  ↓
Angle
  ↓
Writing
  ↓
Evaluation
```

UI 可以显示：

```text
┌─────────┐
│  Topic  │
└────┬────┘
     ↓
┌─────────┐
│Research │
└────┬────┘
     ↓
┌─────────┐
│ Analysis│
└────┬────┘
     ↓
┌─────────┐
│ Writing │
└─────────┘
```

后期甚至可以允许用户：

> 自定义自己的 Content Workflow。

---

# 3.6 Tiptap

GitHub：

[Tiptap GitHub](https://github.com/ueberdosis/tiptap?utm_source=chatgpt.com)

## 用途

核心写作编辑器。

用于：

```text
Writing Workspace
```

支持：

- 富文本
- Markdown
- AI Rewrite
- AI Continue
- AI Improve
- Highlight
- Comments
- Selection
- Block Editing

最终体验类似：

> Notion + AI。

---

# 4. 数据层

# 4.1 PostgreSQL

GitHub：

[PostgreSQL GitHub](https://github.com/postgres/postgres?utm_source=chatgpt.com)

作为核心数据库。

保存：

```text
Users
Projects
Topics
Contents
Research
Insights
Angles
Drafts
Evaluations
Skills
Agent Runs
```

---

# 4.2 pgvector

GitHub：

[pgvector GitHub](https://github.com/pgvector/pgvector?utm_source=chatgpt.com)

用于：

> Semantic Search。

例如：

用户搜索：

```text
成年人为什么越来越孤独
```

系统不只搜索关键词。

而是寻找：

```text
孤独
失去陪伴
成年人的情感关系
缺乏安全感
被需要
```

这种语义相关内容。

---

# 5. Knowledge Base

推荐第一阶段：

```text
PostgreSQL
+
pgvector
```

而不是一开始就引入独立向量数据库。

架构：

```text
PostgreSQL
│
├── Content
├── Topic
├── Insight
├── Angle
├── Emotion
├── Keyword
│
└── Embeddings
       ↓
    pgvector
```

这样可以减少基础设施复杂度。

---

# 5.1 Qdrant

GitHub：

[Qdrant GitHub](https://github.com/qdrant/qdrant?utm_source=chatgpt.com)

### 使用阶段

P1。

如果未来知识库达到：

```text
百万级内容
千万级 Chunk
大量 Embedding
```

再考虑：

```text
PostgreSQL
+
Qdrant
```

当前 MVP 不建议强制加入。

---

# 6. 内容采集层

# 6.1 Crawl4AI

GitHub：

[Crawl4AI GitHub](https://github.com/unclecode/crawl4ai?utm_source=chatgpt.com)

用于：

> 自建 Web Crawling Pipeline。

适合：

```text
批量抓取
定时抓取
深度 Crawl
自定义网页处理
```

---

## 与 Firecrawl 的关系

不要两个同时作为核心抓取器。

建议：

### MVP

```text
Firecrawl
```

### 后期

```text
Firecrawl
     +
Crawl4AI
```

形成：

```text
Primary Web Research
        ↓
Firecrawl

High Volume / Custom Crawl
        ↓
Crawl4AI
```

---

# 7. 文档解析

# 7.1 Unstructured

GitHub：

[Unstructured GitHub](https://github.com/Unstructured-IO/unstructured?utm_source=chatgpt.com)

用于：

```text
PDF
DOCX
PPTX
HTML
TXT
Markdown
```

转换成统一结构。

---

## 在 Content OS 中使用

如果用户上传：

```text
爆款文章合集.pdf
公众号文章.docx
竞品研究报告.pdf
```

执行：

```text
Upload
 ↓
Unstructured
 ↓
Document Elements
 ↓
Chunking
 ↓
Embedding
 ↓
Knowledge Base
```

---

# 8. LlamaIndex

GitHub：

[LlamaIndex GitHub](https://github.com/run-llama/llama_index?utm_source=chatgpt.com)

用途：

> RAG / Knowledge Base。

可以作为：

```text
Document
 ↓
Chunk
 ↓
Embedding
 ↓
Index
 ↓
Retriever
 ↓
LLM
```

---

## 是否第一阶段必须使用？

不必须。

第一阶段可以：

```text
PostgreSQL
+
pgvector
+
自己实现 Retrieval
```

后期如果：

```text
知识库越来越复杂
检索策略越来越复杂
多种数据源越来越多
```

再引入 LlamaIndex。

---

# 9. Research Agent 参考项目

这一部分非常值得我们直接研究源码。

---

# 9.1 Firesearch

GitHub：

[Firesearch GitHub](https://github.com/firecrawl/firesearch?utm_source=chatgpt.com)

它本身就是一个：

> AI Deep Research Tool。

其架构采用：

```text
Query
 ↓
Break Down
 ↓
Search
 ↓
Extract
 ↓
Validate
 ↓
Retry
 ↓
Synthesize
```

这个流程和我们 Content OS 的：

```text
Topic
 ↓
Research
 ↓
Content Discovery
 ↓
Validation
 ↓
Insight
```

高度类似。

因此：

> **强烈建议作为 Research Agent 的第一参考项目。**

---

# 9.2 Open Researcher

GitHub：

[Open Researcher GitHub](https://github.com/firecrawl/open-researcher?utm_source=chatgpt.com)

重点不是直接复制。

而是参考它的：

```text
Research Chat
+
实时搜索
+
来源引用
+
Split View
```

这种 UI 很适合我们的：

> Research Workspace。

其项目已经提供了 Next.js + Firecrawl + AI Research 的完整参考实现。

---

# 10. Agent Workflow Builder

# 10.1 Open Agent Builder

GitHub：

[Open Agent Builder GitHub](https://github.com/firecrawl/open-agent-builder?utm_source=chatgpt.com)

这是非常值得我们研究的项目。

它已经包含：

```text
Visual Workflow
Agent
MCP
Transform
If / Else
While
User Approval
End
```

并采用：

```text
Next.js
TypeScript
LangGraph
React Flow
```

等技术。

---

## 在 Content OS 中的用途

不是直接把它当成产品。

而是参考：

> **如何把我们的 Skills 变成可视化 Workflow。**

例如：

```text
[Topic]
   ↓
[Research]
   ↓
[Search 20 Contents]
   ↓
[Analyze]
   ↓
[Generate Insights]
   ↓
[Generate Angles]
   ↓
[Human Approval]
   ↓
[Writing]
```

未来可以做成：

> Content Workflow Builder。

---

# 11. AI Sandbox

# 11.1 E2B

GitHub：

[E2B GitHub](https://github.com/e2b-dev/E2B?utm_source=chatgpt.com)

不是 MVP 必需。

后期如果 Agent 需要：

```text
Python
数据分析
Excel
CSV
统计分析
图表生成
```

可以使用 Sandbox。

例如：

```text
抓取 5000 条爆款数据
        ↓
Agent
        ↓
E2B Python Sandbox
        ↓
统计
        ↓
生成趋势图
        ↓
返回 Agent
```

---

# 12. 多模型网关

# 12.1 LiteLLM

GitHub：

[LiteLLM GitHub](https://github.com/BerriAI/litellm?utm_source=chatgpt.com)

后期使用。

统一：

```text
OpenAI
Claude
Gemini
DeepSeek
GLM
Qwen
```

接口。

最终：

```text
Content OS
      ↓
Model Gateway
      ↓
┌─────┼──────┬──────┐
GPT  Claude  Gemini DeepSeek
```

---

# 13. AI Observability

# 13.1 Langfuse

GitHub：

[Langfuse GitHub](https://github.com/langfuse/langfuse?utm_source=chatgpt.com)

用于记录：

```text
Prompt
Model
Tokens
Latency
Cost
Tool Calls
Agent Runs
Errors
Evaluation
```

---

## 为什么重要？

我们的系统未来会有：

```text
10+
Skills

多个 Agent

多个模型

大量 Prompt
```

如果没有 Observability，很难知道：

> 为什么这次文章质量下降了？

因此后期必须加入。

---

# 14. 按实际开发步骤排列

真正开发时，不建议按照项目名学习。

应该按照：

> **Content OS Pipeline**

进行。

---

## Phase 0：Web 基础

使用：

```text
Next.js
TypeScript
Tailwind
shadcn/ui
```

完成：

```text
Dashboard
Workspace
Sidebar
Navigation
Settings
```

---

# Phase 1：AI Chat

使用：

```text
Vercel AI SDK
```

完成：

```text
AI Assistant
Streaming
Tool Calling
Chat History
```

---

# Phase 2：Research

使用：

```text
Firecrawl
```

完成：

```text
Topic
 ↓
Search
 ↓
Scrape
 ↓
Extract
 ↓
Research Result
```

---

# Phase 3：Research Agent

使用：

```text
LangGraph
+
Firecrawl
```

完成：

```text
Topic
 ↓
Query Planning
 ↓
Search
 ↓
Scrape
 ↓
Analyze
 ↓
Validate
 ↓
Retry
 ↓
Research Report
```

Firecrawl 的 Firesearch 项目本身已经展示了类似的“拆解查询 → 搜索 → 提取 → 验证 → 重试 → 综合”研究链路。

---

# Phase 4：内容数据库

使用：

```text
PostgreSQL
+
Prisma
```

建立：

```text
Topics
Contents
Metrics
Research Sessions
Insights
Angles
```

---

# Phase 5：Semantic Search

使用：

```text
pgvector
```

建立：

```text
Content Embeddings
Topic Embeddings
Insight Embeddings
```

实现：

```text
Semantic Search
Related Content
Similar Topic
Similar Viral Content
```

---

# Phase 6：Viral Analysis

自己开发 Skill：

```text
viral-analysis
```

底层：

```text
LangGraph
+
LLM
+
PostgreSQL
+
pgvector
```

分析：

```text
Hook
Emotion
Structure
Conflict
Novelty
Relatability
Shareability
```

---

# Phase 7：Audience Insight

自己开发：

```text
audience-analysis
```

输入：

```text
文章
评论
互动数据
```

输出：

```text
用户痛点
用户情绪
用户观点
用户争议
用户故事
```

---

# Phase 8：Angle Generation

自己开发：

```text
angle-generation
```

输出：

```text
Angle 01
Angle 02
Angle 03
Angle 04
Angle 05
```

并进行：

```text
Novelty Score
Emotion Score
Relatability Score
Shareability Score
```

---

# Phase 9：Writing

使用：

```text
Tiptap
+
Vercel AI SDK
+
writing Skill
```

完成：

```text
Outline
 ↓
Draft
 ↓
Rewrite
 ↓
Humanization
 ↓
Final
```

---

# Phase 10：Workflow Visualization

使用：

```text
React Flow
```

把：

```text
Skills
Agents
Tools
Human Approval
```

可视化。

---

# Phase 11：Knowledge Base

使用：

```text
PostgreSQL
+
pgvector
+
Unstructured
```

建立：

```text
Content Knowledge Base
```

---

# Phase 12：Advanced Research

研究：

```text
Firesearch
Open Researcher
Open Agent Builder
```

吸收：

```text
Deep Research
Research UI
Agent Workflow
```

---

# Phase 13：生产级 Agent

增加：

```text
LiteLLM
Langfuse
E2B
```

形成：

```text
Multi Model
+
Observability
+
Sandbox
```

---

# 15. 最终架构

最终 Content OS 可以形成：

```text
                         ┌──────────────────────┐
                         │       Web UI         │
                         │ Next.js + shadcn/ui  │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Vercel AI SDK     │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Agent Orchestrator │
                         │      LangGraph       │
                         └──────────┬───────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
     Research Skills          Analysis Skills        Writing Skills
            │                       │                       │
            ▼                       ▼                       ▼
       Firecrawl                 LLM                  Tiptap
       Crawl4AI               pgvector              AI SDK
            │                       │                       │
            └───────────────────────┼───────────────────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Knowledge Layer    │
                         │ PostgreSQL + pgvector│
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │    Observability     │
                         │      Langfuse        │
                         └──────────────────────┘
```

---

# 16. 哪些项目不要现在做

为了避免项目过度复杂，以下项目第一版不要加入核心链路：

```text
Qdrant
LlamaIndex
E2B
LiteLLM
Langfuse
Crawl4AI
```

第一版核心只需要：

```text
Next.js
+
shadcn/ui
+
Vercel AI SDK
+
LangGraph
+
Firecrawl
+
PostgreSQL
+
pgvector
+
Tiptap
```

也就是说：

> **先用 8 个核心组件把完整闭环跑起来。**

---

# 17. 最重要的三个参考项目

如果时间有限，只研究三个项目：

## 第一名：Firesearch

解决：

> **Research Agent 怎么做。**

[Firesearch](https://github.com/firecrawl/firesearch?utm_source=chatgpt.com)

---

## 第二名：Open Agent Builder

解决：

> **Skills / Agents / Workflow 怎么可视化。**

[Open Agent Builder](https://github.com/firecrawl/open-agent-builder?utm_source=chatgpt.com)

---

## 第三名：Open Researcher

解决：

> **Research Workspace 怎么做。**

[Open Researcher](https://github.com/firecrawl/open-researcher?utm_source=chatgpt.com)

---

# 18. 最终开发原则

不要：

```text
找一堆开源项目
↓
全部安装
↓
拼起来
```

而应该：

```text
Content OS 产品流程
        ↓
确定每一步需要什么能力
        ↓
寻找对应开源项目
        ↓
判断：
直接使用 / 集成 / 参考 / 自研
        ↓
形成自己的 Architecture
```

开源项目是：

> **基础设施和参考实现。**

而真正属于 Content OS 的核心资产应该是：

```text
Skills
+
Content Knowledge Graph
+
Viral Analysis Model
+
Audience Insight Model
+
Content Scoring System
+
User Writing Profile
+
Feedback Loop
```

这些才是未来 Content OS 真正的产品壁垒。

---

# 19. 开源项目使用优先级

最终可以压缩成这一张表：

| 开发阶段 | 核心任务 | 开源项目 | 优先级 |
|---|---|---|---|
| P0 | Web UI | Next.js + shadcn/ui | ⭐⭐⭐⭐⭐ |
| P0 | AI Chat | Vercel AI SDK | ⭐⭐⭐⭐⭐ |
| P0 | Web Research | Firecrawl | ⭐⭐⭐⭐⭐ |
| P0 | Agent Workflow | LangGraph | ⭐⭐⭐⭐⭐ |
| P0 | Database | PostgreSQL | ⭐⭐⭐⭐⭐ |
| P0 | Semantic Search | pgvector | ⭐⭐⭐⭐⭐ |
| P0 | Writing Editor | Tiptap | ⭐⭐⭐⭐⭐ |
| P1 | Workflow UI | React Flow | ⭐⭐⭐⭐ |
| P1 | Deep Research | Firesearch | ⭐⭐⭐⭐ |
| P1 | Research UI | Open Researcher | ⭐⭐⭐⭐ |
| P1 | Agent Builder | Open Agent Builder | ⭐⭐⭐⭐ |
| P1 | Document Parsing | Unstructured | ⭐⭐⭐ |
| P1 | Crawler | Crawl4AI | ⭐⭐⭐ |
| P1 | RAG | LlamaIndex | ⭐⭐⭐ |
| P2 | Vector DB | Qdrant | ⭐⭐ |
| P2 | Multi-model | LiteLLM | ⭐⭐ |
| P2 | Observability | Langfuse | ⭐⭐ |
| P2 | Sandbox | E2B | ⭐⭐ |

---

# 20. 一句话总结

Content OS 的开发路线不是：

> **找一个开源 AI 写作项目改一改。**

而是：

> **以 Next.js 为产品外壳，以 LangGraph 为 Agent Runtime，以 Firecrawl 为互联网研究入口，以 PostgreSQL + pgvector 为内容知识库，以 Tiptap 为写作工作台，再把我们自己的 Skills 逐步组合成完整的 Content OS。**

最终形成：

```text
开源基础设施
       ↓
我们的 Skills
       ↓
我们的内容知识库
       ↓
我们的分析模型
       ↓
我们的用户反馈数据
       ↓
Content OS
```

**开源项目负责“能力底座”，我们负责“内容智能”。**