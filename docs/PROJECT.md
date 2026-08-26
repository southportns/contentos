# AI 爆款内容研究与写作工具

> 项目代号：Content OS  
> 项目类型：AI 内容研究 / 爆款分析 / 选题生成 / 写作辅助工具  
> 产品形态：Web Application + AI Agent + Skills + 内容知识库

---

## 1. 项目概述

### 1.1 项目背景

传统 AI 写作工具大多采用：

> 输入一个主题 → AI 直接生成文章

这种方式虽然能够快速生成文字，但存在明显问题：

- 不知道用户真正想表达什么
- 缺乏对当前热点和用户情绪的理解
- 缺乏真实互联网内容作为参考
- 无法判断什么样的内容容易获得传播
- 文章结构往往高度模板化
- 容易出现“AI 味”
- 无法形成稳定、可重复的爆款内容生产流程

本项目希望解决的不是单纯的“AI 写文章”，而是建立一套：

> **从选题 → 内容研究 → 爆款拆解 → 观点提炼 → 内容结构 → 写作 → 评估 → 优化**

的完整内容生产系统。

---

# 2. 核心理念

产品核心不是：

> AI Writer

而是：

> **AI Content Research & Writing OS**

即：

**AI 内容研究与写作操作系统。**

系统需要帮助用户完成：

```text
今天写什么？
      ↓
这个话题为什么值得写？
      ↓
用户真正关心什么？
      ↓
网上已经有哪些爆款内容？
      ↓
爆款内容为什么爆？
      ↓
哪些观点可以借鉴？
      ↓
我们应该形成什么独特观点？
      ↓
文章应该如何组织？
      ↓
最终如何写出来？
      ↓
发布前是否值得发布？
```

---

# 3. 产品核心场景

用户每天只需要完成一个动作：

> **输入今天想讨论的主题。**

例如：

> “我们一生都在追求被爱的过程。”

系统自动围绕这个主题完成后续工作。

---

## 3.1 用户输入

用户可以输入：

```text
主题：
我们一生都在追求被爱的过程
```

也可以增加：

```text
目标平台：
小红书

内容类型：
情绪 / 人生感悟等

目标人群：
18～45岁女性

内容目的：
获得收藏和评论和点赞

期望风格：
克制、温柔、有共鸣等
```

---

# 4. 核心工作流

整个系统采用 Pipeline 架构。

```text
Topic
  ↓
Topic Research
  ↓
Content Discovery
  ↓
Viral Content Analysis
  ↓
Emotion Analysis
  ↓
Audience Insight
  ↓
Angle Generation
  ↓
Content Structure
  ↓
Writing
  ↓
Quality Evaluation
  ↓
Optimization
  ↓
Final Content
```

---

# 5. 核心模块

## 5.1 Topic Studio

### 功能

用户输入一个主题后，系统首先建立：

> Topic Profile

例如：

```text
主题：
我们一生都在追求被爱的过程

主题类型：
情感 / 人生 / 成长

核心关键词：

被爱
父母
童年
友情
爱情
婚姻
孤独
衰老
陪伴
安全感
```

系统进一步生成：

```text
核心问题：

为什么人一生都在寻找被爱？

不同年龄阶段的“被爱”分别是什么？

为什么成年以后越来越难感受到被爱？

人最终真正需要的是被爱，还是被理解？
```

---

# 6. 内容研究模块

## 6.1 Content Discovery

系统围绕主题进行互联网内容搜索。

研究对象包括已经获得高赞和高流量的：

- 小红书
- 抖音
- 微博
- 知乎
- 公众号
- 新闻
- 相关话题书籍
- 其他公开互联网内容

目标不是简单搜索关键词。

而是寻找：

> **真正具有传播价值的内容。**

---

## 6.2 内容采集

每一条内容形成统一的数据结构：

```text
Content

id
platform
url
author
title
content
publish_time

likes
comments
shares
favorites

engagement_rate

topic
keywords
emotions
content_structure
```

---

# 7. 爆款分析模块

这是项目最核心的模块之一。

系统不是简单统计：

> 哪篇文章点赞最多？

而是分析：

> **为什么这篇内容能够传播？**

---

## 7.1 爆款评分

建立 Viral Score：

```text
Viral Score
=
Engagement
+
Emotion
+
Novelty
+
Relatability
+
Structure
+
Shareability
```

最终形成：

```text
爆款指数：92/100
```

---

# 8. 爆款内容拆解

系统自动拆解每篇内容：

### Hook

开头为什么能够吸引用户？

### Problem

用户面对什么问题？

### Emotion

内容调动了什么情绪？

### Insight

作者提供了什么观点？

### Story

是否存在故事？

### Conflict

是否存在冲突？

### Resolution

最终如何解决？

### CTA

是否引导评论 / 收藏 / 转发？

---

## 8.1 内容结构示例

例如：

```text
Hook
↓
童年被父母爱
↓
成年寻找爱情
↓
进入婚姻
↓
开始理解父母
↓
年龄增长
↓
害怕失去陪伴
↓
发现真正需要的是“被需要”
↓
情绪升华
```

系统将其转换成：

> Content Structure Graph

---

# 9. 情绪分析模块

系统需要识别内容背后的情绪。

例如：

```text
孤独        92
遗憾        88
思念        86
治愈        81
安全感      79
共鸣        95
```

同时识别：

### 情绪变化曲线

```text
平静
 ↓
回忆
 ↓
失落
 ↓
共鸣
 ↓
情绪高潮
 ↓
释然
```

这可以帮助系统理解：

> **爆款内容的情绪节奏。**

---

# 10. 用户洞察模块

系统不仅研究文章，还要研究：

> 用户为什么会产生互动。

分析：

- 评论内容
- 用户表达
- 高频词
- 用户故事
- 用户争议
- 用户反驳
- 用户共鸣点

例如：

```text
用户真正讨论的不是“被爱”

而是：

“为什么长大以后越来越难被爱？”

“成年人的爱为什么需要交换？”

“父母的爱是不是有条件？”

“伴侣真的能够提供安全感吗？”

“人老了以后谁还会爱自己？”
```

系统将这些内容转换为：

> Audience Insight

---

# 11. 观点生成模块

系统不会直接开始写文章。

而是先生成：

> Content Angles

例如：

### Angle 01

我们一生都在寻找小时候失去的那种被爱。

### Angle 02

成年以后，我们追求的不是爱情，而是被坚定选择。

### Angle 03

人真正害怕的不是孤独，而是没有人需要自己。

### Angle 04

小时候被父母爱，成年后被伴侣爱，老年后却开始害怕没人爱。

然后给每个观点评分：

```text
Novelty
82

Emotion
94

Relatability
91

Shareability
88

Overall
91
```

---

# 12. Content Strategy

用户选择一个 Angle 后，系统开始制定文章策略。

输出：

```text
核心观点

目标情绪

目标用户

文章冲突

核心故事

情绪曲线

内容结构

开头策略

结尾策略

评论引导策略
```
并且以上生成的策略支持用户进行自行调整
---

# 13. Writing Engine

只有完成前面的研究之后，才进入写作。

写作模块负责：

```text
Outline
 ↓
Draft
 ↓
Humanization
 ↓
Emotion Optimization
 ↓
Platform Optimization
```

---

# 14. 写作模式

支持不同写作模式。

## 情绪型

重点：

```text
共鸣
故事
情绪
金句
```

## 观点型

重点：

```text
观点
论证
案例
反常识
```

## 故事型

重点：

```text
人物
冲突
转折
结局
```

## 知识型

重点：

```text
事实
数据
解释
方法
```

---

# 15. AI Humanization

系统需要重点解决：

> AI 味。

因此设置独立 Humanization Engine。

检测：

- 模板化表达
- 空洞升华
- 过度排比
- 过度总结
- AI 高频词
- 机械连接词
- 情绪过度
- 金句堆砌

目标：

> **让内容像一个真实的人写出来，而不是像 AI 写出来。**

---

# 16. Content Score

最终文章生成后进入评估系统。

评分维度：

```text
Hook Score
Emotion Score
Relatability Score
Novelty Score
Structure Score
Readability Score
Shareability Score
AI Score
Platform Fit
```

最终：

```text
Content Score
    91
```

同时输出：

```text
优势：

✓ 开头吸引力强
✓ 情绪递进自然
✓ 有较强共鸣
✓ 观点清晰

问题：

× 中段略显重复
× 缺少具体故事
× 结尾略模板化
```

---

# 17. Web 产品结构

前端采用 Dashboard + Workspace 的产品形态。

---

## 17.1 首页 Dashboard

核心信息：

```text
今日创作

今日选题

研究中的主题

待完成文章

历史爆款

内容表现
```

首页核心 CTA：

> **开始今天的创作**

---

# 18. Topic Workspace

主题工作台。

左侧：

```text
Topic
Research
Content
Insights
Angles
Strategy
Writing
Evaluation
```

中间：

> 当前工作内容

右侧：

> AI Assistant

形成：

```text
┌──────────────┬────────────────────┬──────────────┐
│ Workflow     │ Workspace          │ AI Assistant │
│              │                    │              │
│ Topic        │                    │              │
│ Research     │ 当前模块内容       │ AI建议       │
│ Content      │                    │              │
│ Insights     │                    │              │
│ Angles       │                    │              │
│ Strategy     │                    │              │
│ Writing      │                    │              │
│ Evaluation   │                    │              │
└──────────────┴────────────────────┴──────────────┘
```

---

# 19. Research Dashboard

用于查看互联网研究结果。

核心组件：

```text
热门内容
爆款排行榜
关键词
情绪分布
用户观点
内容结构
趋势变化
```

---

# 20. Viral Content Explorer

类似：

> 内容研究数据库。

用户可以按照：

```text
平台
主题
时间
点赞
评论
收藏
分享
情绪
内容类型
```

进行筛选。

并查看：

```text
爆款内容

为什么爆？

用户为什么评论？

用户为什么收藏？

用户为什么转发？
```

---

# 21. Knowledge Base

建立自己的内容知识库。

主要包含：

```text
Topics
Contents
Authors
Platforms
Keywords
Emotions
Audience Insights
Content Structures
Hooks
Angles
Writing Patterns
```

最终形成：

> **Content Knowledge Graph**

---

# 22. Skill 系统

原来的 Skill 不应该被删除。

而是成为 AI Agent 的能力层。

推荐架构：

```text
Web UI
   ↓
Application API
   ↓
Agent Orchestrator
   ↓
Skills
   ├── topic-research
   ├── content-search
   ├── viral-analysis
   ├── emotion-analysis
   ├── audience-analysis
   ├── angle-generation
   ├── content-strategy
   ├── writing
   ├── humanization
   └── evaluation
   ↓
Knowledge Base
```

---

# 23. Skill 标准

每个 Skill 独立存在。

例如：

```text
skills/
├── topic-research/
│   └── SKILL.md
│
├── content-search/
│   └── SKILL.md
│
├── viral-analysis/
│   └── SKILL.md
│
├── emotion-analysis/
│   └── SKILL.md
│
├── audience-analysis/
│   └── SKILL.md
│
├── angle-generation/
│   └── SKILL.md
│
├── content-strategy/
│   └── SKILL.md
│
├── writing/
│   └── SKILL.md
│
├── humanization/
│   └── SKILL.md
│
└── evaluation/
    └── SKILL.md
```

每一个 Skill 都应该：

```text
Input
↓
Processing
↓
Output
↓
Validation
```

标准化。

---

# 24. Agent Orchestrator

系统核心 Agent 不负责具体工作。

它负责：

> **调度 Skill。**

例如：

```text
用户输入 Topic

↓

Orchestrator

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

用户选择 Angle

↓

Content Strategy Skill

↓

Writing Skill

↓

Humanization Skill

↓

Evaluation Skill
```

---

# 25. 技术架构

推荐：

### Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

### Backend

```text
Next.js API
Node.js
```

### Database

```text
PostgreSQL
```

### ORM

```text
Prisma
```

### AI

支持多模型：

```text
OpenAI
Claude
Gemini
DeepSeek
GLM
```

通过统一 Model Gateway 管理。

---

# 26. 数据层

核心数据库：

```text
users

projects

topics

research_sessions

contents

content_metrics

content_analysis

keywords

emotions

audience_insights

content_structures

angles

content_strategies

drafts

evaluations

skills

agents

agent_runs
```

---

# 27. Agent Runtime

每一次 AI 工作都需要记录：

```text
agent_run

id
project_id
skill_id
input
output
model
tokens
latency
status
created_at
```

这样未来可以：

- Debug
- 重跑
- 对比模型
- 统计成本
- 优化 Prompt
- 训练自己的 Agent

---

# 28. 项目目录

推荐初始目录：

```text
content-os/

├── app/
│   ├── dashboard/
│   ├── projects/
│   ├── workspace/
│   ├── research/
│   ├── explorer/
│   └── settings/
│
├── components/
│   ├── dashboard/
│   ├── workspace/
│   ├── research/
│   ├── writing/
│   └── ui/
│
├── lib/
│   ├── ai/
│   ├── agents/
│   ├── skills/
│   ├── database/
│   ├── search/
│   └── evaluation/
│
├── skills/
│   ├── topic-research/
│   ├── content-search/
│   ├── viral-analysis/
│   ├── emotion-analysis/
│   ├── audience-analysis/
│   ├── angle-generation/
│   ├── content-strategy/
│   ├── writing/
│   ├── humanization/
│   └── evaluation/
│
├── prisma/
│   └── schema.prisma
│
├── prompts/
│
├── docs/
│
├── tests/
│
├── AGENTS.md
├── PROJECT.md
└── README.md
```

---

# 29. MVP

第一阶段不要一次实现全部功能。

MVP 只验证一个核心闭环：

```text
输入主题
   ↓
搜索相关内容
   ↓
分析爆款
   ↓
提炼用户洞察
   ↓
生成 3～5 个内容角度
   ↓
选择角度
   ↓
生成文章
   ↓
文章评分
```

---

# 30. MVP 页面

第一版只需要：

### ① Dashboard

```text
项目
最近创作
今日主题
```

### ② Topic Workspace

```text
输入主题
开始研究
```

### ③ Research

```text
搜索结果
爆款内容
用户评论
情绪分析
```

### ④ Angle

```text
内容角度
评分
选择
```

### ⑤ Writing

```text
文章编辑器
AI修改
文章评分
```

---

# 31. 第一阶段成功标准

不是：

> 页面做得多漂亮。

而是验证：

> **一个主题能不能经过系统研究后，明显提升最终内容质量。**

核心指标：

```text
研究耗时 ↓

选题效率 ↑

内容质量 ↑

爆款内容识别准确率 ↑

用户满意度 ↑

AI味 ↓
```

---

# 32. 第二阶段

当 MVP 跑通之后，再增加：

```text
历史内容数据库
趋势分析
平台差异分析
作者画像
用户画像
内容知识图谱
爆款预测
内容复盘
```

---

# 33. 第三阶段

最终形成：

> Personal Content OS

系统能够学习用户长期创作习惯。

例如：

```text
用户擅长：

情绪类内容
人生感悟
女性成长
关系话题

用户风格：

克制
温柔
有故事感
少鸡汤
```

系统逐渐形成：

> **用户自己的写作模型。**

---

# 34. 最终产品形态

最终不是一个：

> AI 写作网站。

而是一个：

> **AI 内容研究 + 爆款分析 + 创作决策 + 写作 + 复盘系统。**

完整闭环：

```text
                  ┌──────────────┐
                  │    Topic     │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Research   │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │ Viral Content│
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Insights   │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │    Angles    │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Strategy   │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Writing    │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │  Evaluation  │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │ Optimization │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Publish    │
                  └──────┬───────┘
                         ↓
                  ┌──────────────┐
                  │   Feedback   │
                  └──────┬───────┘
                         │
                         └──────────→ Knowledge Base
```

---

# 35. 产品定位

### 一句话定位

> **帮你找到值得写的内容，并告诉你为什么值得写，最后帮你把它写出来。**

### 核心价值

不是：

> “帮你写文章。”

而是：

> **“帮你做内容决策。”**

### 最终目标

建立一个能够持续学习互联网内容传播规律，并不断提高用户创作成功率的：

> **AI Content OS。**

---

# 36. 开发原则

项目开发必须遵循以下原则：

### 原则 1：Research First

不能让 AI 一上来就写。

必须：

```text
Research
→ Insight
→ Strategy
→ Writing
```

### 原则 2：Skill First

业务能力尽量沉淀到独立 Skill。

Web UI 只是 Skill 的可视化操作层。

### 原则 3：数据优先

所有研究结果尽可能结构化保存。

### 原则 4：可解释

AI 给出的：

```text
选题
观点
评分
文章
```

都应该能够解释：

> 为什么？

### 原则 5：可复盘

每一次内容创作都必须成为下一次创作的数据资产。

---

# 37. 最终愿景

用户每天打开系统。

看到：

> **今天写什么？**

输入一个模糊想法。

系统最终告诉他：

> “这个话题值得写。”

> “用户真正关心的是这个。”

> “过去有 37 个类似爆款。”

> “这些内容爆的原因是……”

> “我建议你从这个角度切入。”

> “这是最适合你的文章结构。”

> “这是初稿。”

> “目前传播潜力 87 分。”

然后用户只需要：

> **修改 → 发布 → 等待真实数据。**

真实数据再次进入系统。

最终形成：

```text
互联网内容数据
        ↓
研究
        ↓
知识
        ↓
AI决策
        ↓
内容创作
        ↓
真实传播结果
        ↓
反馈数据
        ↓
知识增长
        ↓
更好的下一次创作
```

这才是这个项目真正的核心壁垒。

**不是一个 AI 写作器，而是一套持续学习的内容生产系统。**