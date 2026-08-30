# Content OS — Product Specification

> 产品规格文档  
> Version: 1.0  
> Status: Draft for Development

---

# 1. 产品定义

## 1.1 产品名称

Content OS

## 1.2 产品定位

Content OS 是一个：

> **AI 内容研究、爆款分析、内容决策与写作系统。**

它不是简单的 AI Writer。

核心目标是帮助用户完成：

```text
发现值得写的主题
        ↓
研究互联网已有内容
        ↓
寻找高传播内容
        ↓
分析为什么爆
        ↓
理解用户真正关心什么
        ↓
生成内容切入角度
        ↓
制定内容策略
        ↓
完成写作
        ↓
进行传播潜力评估
        ↓
优化
        ↓
发布
        ↓
获得真实反馈
        ↓
反哺知识库
```

---

# 2. 核心用户

第一阶段主要面向：

- 内容创作者
- 自媒体作者
- 小红书创作者
- 抖音内容创作者
- 公众号作者
- 独立内容团队

第一阶段不针对大型企业内容团队。

---

# 3. 核心使用场景

用户每天打开 Content OS。

系统首先询问：

> 今天想写什么？

用户输入一个主题。

例如：

```text
我们一生都在追求被爱的过程。
```

系统开始自动完成研究。

---

# 4. 核心产品原则

## 4.1 Research First

禁止：

```text
Topic → 直接生成文章
```

必须：

```text
Topic
→ Research
→ Insight
→ Angle
→ Strategy
→ Writing
```

---

## 4.2 Human In The Loop

关键决策必须允许用户参与。

尤其是：

- Topic
- Angle
- Writing Direction
- Final Draft

AI 可以推荐。

但不能默认替用户决定最终内容方向。

---

## 4.3 Evidence First

AI 的重要判断应该尽量有数据或内容依据。

例如：

```text
为什么这个角度值得写？
```

应该能够回答：

```text
参考内容：
用户评论：
传播数据：
相似主题：
历史表现：
```

---

# 5. 核心 Workflow

```text
Topic
 ↓
Topic Research
 ↓
Content Discovery
 ↓
Viral Content Analysis
 ↓
Audience Insight
 ↓
Angle Generation
 ↓
Content Strategy
 ↓
Writing
 ↓
Humanization
 ↓
Evaluation
 ↓
Optimization
 ↓
Final Content
```

---

# 6. Topic

## 输入

用户输入：

```text
topic
```

可选：

```text
platform
audience
content_type
goal
tone
constraints
```

---

## 输出

Topic Profile：

```text
topic
category
keywords
related_topics
core_questions
audience
potential_angles
research_queries
```

---

# 7. Topic Research

## 目标

理解：

> 这个主题到底在讨论什么？

---

## 研究内容

- 搜索引擎结果
- 新闻
- 社交媒体内容
- 论坛
- 文章
- 视频
- 用户讨论

---

## 输出

```text
Topic Context

Core Questions

Related Topics

Trending Keywords

Potential Emotional Themes

Research Directions
```

---

# 8. Content Discovery

## 目标

寻找：

> 与当前 Topic 高度相关的真实互联网内容。

---

## 每条 Content 至少包含

```text
id
platform
url
title
author
content
published_at
metrics
```

---

## Metrics

尽可能记录：

```text
likes
comments
shares
favorites
views
```

注意：

> 不允许虚构缺失数据。

---

# 9. Viral Content Analysis

## 目标

分析：

> 为什么这条内容能够获得传播？

---

## 分析维度

### Hook

开头吸引力。

### Emotion

情绪强度。

### Relatability

用户共鸣。

### Novelty

观点新颖度。

### Structure

内容结构。

### Conflict

冲突。

### Story

故事性。

### Shareability

传播性。

---

## 输出

```text
hook_score
emotion_score
relatability_score
novelty_score
structure_score
shareability_score
viral_score
analysis
```

---

# 10. Audience Insight

## 目标

分析：

> 用户真正关心什么？

---

## 输入

```text
content
comments
metrics
topic
```

---

## 输出

```text
pain_points
emotions
questions
opinions
controversies
stories
desires
fears
```

---

# 11. Angle Generation

## 目标

从研究结果中生成：

> 值得写的内容切入角度。

---

## 输出

至少生成：

```text
3～5 个 Angles
```

每个 Angle：

```text
title
core_thesis
target_audience
emotion
novelty_score
relatability_score
shareability_score
risk
supporting_evidence
```

---

# 12. Human Approval

用户选择 Angle。

系统状态：

```text
GENERATED
 ↓
WAITING_FOR_APPROVAL
 ↓
APPROVED
```

只有用户批准后才进入 Content Strategy。

---

# 13. Content Strategy

输出：

```text
core_thesis
target_emotion
target_audience
hook_strategy
content_structure
story_strategy
conflict
turning_point
ending_strategy
cta_strategy
```

---

# 14. Writing

写作分为：

```text
Outline
 ↓
Draft
 ↓
Humanization
 ↓
Evaluation
```

---

# 15. Humanization

检测：

- AI 高频表达
- 模板化表达
- 空洞升华
- 过度排比
- 过度总结
- 情绪堆砌
- 机械连接词

目标：

> 提高真实作者感。

---

# 16. Evaluation

文章生成后必须评分。

评分：

```text
hook_score
emotion_score
relatability_score
novelty_score
structure_score
readability_score
shareability_score
platform_fit_score
ai_style_score
overall_score
```

---

# 17. Optimization

系统根据 Evaluation 输出：

```text
issues
suggestions
priority
```

用户可以：

```text
Apply All
```

或者逐条：

```text
Apply
Ignore
Edit
```

---

# 18. Content Lifecycle

```text
DRAFT
 ↓
RESEARCHING
 ↓
ANALYZING
 ↓
ANGLE_SELECTION
 ↓
STRATEGY
 ↓
WRITING
 ↓
EVALUATING
 ↓
OPTIMIZING
 ↓
READY
 ↓
PUBLISHED
 ↓
FEEDBACK
```

---

# 19. Dashboard

Dashboard 显示：

- 今日主题
- 最近项目
- 创作进度
- 待处理内容
- 最近文章
- 内容评分
- 历史表现

---

# 20. Workspace

Workspace 为主要工作区域。

布局：

```text
┌────────────┬──────────────────────┬──────────────┐
│ Workflow   │ Workspace            │ AI Assistant │
│            │                      │              │
│ Topic      │ 当前步骤内容         │ AI建议       │
│ Research   │                      │              │
│ Content    │                      │              │
│ Insights   │                      │              │
│ Angles     │                      │              │
│ Strategy   │                      │              │
│ Writing    │                      │              │
│ Evaluation │                      │              │
└────────────┴──────────────────────┴──────────────┘
```

---

# 21. 数据原则

所有重要 AI 输出必须持久化。

包括：

```text
Research
Content
Analysis
Insight
Angle
Strategy
Draft
Evaluation
Agent Run
```

---

# 22. MVP 范围

第一版只实现：

```text
Dashboard
Topic
Research
Content Discovery
Viral Analysis
Angle Generation
Writing
Evaluation
```

暂不实现：

```text
复杂社交账号管理
自动发布
商业化系统
多人协作
复杂知识图谱可视化
```

---

# 23. MVP 成功标准

用户能够：

```text
输入一个 Topic
        ↓
完成研究
        ↓
看到爆款内容
        ↓
看到分析
        ↓
选择 Angle
        ↓
生成文章
        ↓
获得评分
```

整个流程能够完整运行。

---

# 24. 非目标

Content OS 第一阶段不是：

- 通用聊天机器人
- 通用搜索引擎
- 自动发布平台
- 社交媒体
- SEO 工具
- 企业 CMS

---

# 25. 核心产品指标

第一阶段重点观察：

```text
Topic → Draft 完成率

Research → Angle 完成率

Angle → Draft 完成率

用户平均创作时间

AI 生成内容修改率

用户最终采用率

Evaluation 与真实传播结果的相关性
```

---

# 26. 最终产品目标

Content OS 最终需要形成：

> **研究驱动的内容生产闭环。**

最终：

```text
Internet
 ↓
Research
 ↓
Knowledge
 ↓
Insight
 ↓
Decision
 ↓
Content
 ↓
Real-world Feedback
 ↓
Knowledge
```

形成持续学习系统。