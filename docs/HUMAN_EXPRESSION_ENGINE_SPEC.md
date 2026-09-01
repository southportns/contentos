# ContextOS Human Expression Engine v1.0

> Version: 1.0  
> Status: Proposed / Implementation Ready  
> Scope: ContextOS MVP → Human Expression Engine v1.0  
> Primary Goal: 降低大模型标准化表达，提高内容的自然表达、作者感、口语感、思维痕迹与个体一致性

---

## 1. 文档目的

本文档定义 ContextOS `Human Expression Engine v1.0` 的产品目标、架构、数据协议、Agent Workflow、Skill 改造、Prompt 设计原则、评估体系、测试方法以及分阶段实施计划。

本方案基于当前 ContextOS MVP 的实际架构设计。当前项目已经具备：主题研究、角度生成、内容策略、写作、二次精修、人性化润色、内容评估、AI 人设、情感弧线以及抖音内容采集等能力；仓库目前也已经将 AI 能力拆分为独立 Skill，例如 `writing`、`humanization`、`refine`、`style-distillation`、`evaluation` 等。citehttps://github.com/southportns/contentoshttps://github.com/southportns/contentos/tree/main/skills

因此，本次改造不采用“推倒重写”，而是在现有 Skill + Agent Workflow 架构上新增 **Expression Layer**，并重构现有 `humanization` 在工作流中的职责。

---

# 2. 核心结论

## 2.1 当前问题不是“去 AI 味 Prompt 不够强”

当前 ContextOS 已经存在独立的 `humanization` Skill，但它主要承担的是：对已经生成的文本进行 AI 痕迹识别、局部表达修改和整体人性化润色。

这种方式存在天然上限：

```text
Writing
  ↓
生成一篇标准化文本
  ↓
Humanization
  ↓
修改表面措辞
```

真正的人类表达并不是通过删除几个“AI 常用词”得到的，而是由以下因素共同决定：

- 作者是谁
- 作者如何观察问题
- 作者如何联想
- 作者如何形成观点
- 作者在哪里犹豫
- 作者在哪里转念
- 作者如何处理情绪
- 作者使用怎样的句长和节奏
- 作者如何表达具体细节
- 作者是否倾向于直接总结或留下余地

因此，Human Expression Engine 的核心不是“文本后处理”，而是：

> **在写作之前建立表达计划，在写作过程中约束表达生成，在写作之后审计并局部修正。**

---

# 3. 产品定位

## 3.1 Definition

`Human Expression Engine` 是 ContextOS 的独立表达智能层，负责将“内容策略”转换为“人类表达方式”，并建立从表达规划、写作、表达审计到局部重写的闭环。

核心公式：

```text
Content Strategy
      +
Expression Persona
      +
Thought Pattern
      +
Expression Rhythm
      +
Specificity
      +
Truth Constraints
      ↓
Human Expression Plan
      ↓
Writer
      ↓
Expression Audit
      ↓
Targeted Rewrite
      ↓
Naturalness Evaluation
```

## 3.2 产品目标

第一阶段只解决一个核心问题：

> **让 ContextOS 生成的内容，不再只是“表达正确”，而是更接近真实作者会说出来的话。**

---

# 4. 与当前 ContextOS 的关系

当前 README 定义的产品是“从主题研究、爆款分析、内容决策到口播稿写作的全流程 AI 内容创作系统”，并包含三种创作模式、内容浏览器、六步创作流程、人设系统、情感弧线、六维评估与人性化润色。citehttps://github.com/southportns/contentos/blob/main/README.md

当前核心技能包括：

```text
angle-generation
 content-search
 content-strategy
 evaluation
 humanization
 refine
 style-distillation
 writing
 topic-research
 viral-analysis
 audience-analysis
 risk-analysis
 content-adaptation
 content-distillation
 transcript-correction
```

这些能力继续保留，不进行无关重构。citehttps://github.com/southportns/contentos/tree/main/skills

新增的 Expression Layer 位于：

```text
内容理解层
    ↓
内容策略层
    ↓
表达智能层        ← Human Expression Engine
    ↓
写作层
    ↓
表达质量层
```

---

# 5. v1.0 总体架构

```text
                         ContextOS
                             │
       ┌─────────────────────┼─────────────────────┐
       ↓                     ↓                     ↓
Content Intelligence   Content Strategy   Expression Intelligence
       │                     │                     │
       │                     │          ┌──────────┼──────────┐
       │                     │          ↓          ↓          ↓
       │                     │       Persona    Thought     Rhythm
       │                     │          │          │          │
       │                     │          └────┬─────┴──────────┘
       │                     │               ↓
       └─────────────────────┴────→ Expression Planner
                                             │
                                             ↓
                                       Writing Engine
                                             │
                                             ↓
                                      Expression Audit
                                             │
                              ┌──────────────┴──────────────┐
                              ↓                             ↓
                            PASS                    Targeted Rewrite
                              │                             │
                              └──────────────┬──────────────┘
                                             ↓
                                      Quality Evaluation
                                             │
                                             ↓
                                        Final Content
```

---

# 6. 核心设计原则

## 6.1 Expression First

表达能力不再是写完后的“美容步骤”，而应该成为写作输入的一部分。

```text
错误：
Strategy → Writing → Humanization

正确：
Strategy → Expression Planning → Writing → Expression Audit → Rewrite
```

## 6.2 Strategy ≠ Expression

内容策略决定：

> 这篇内容应该讲什么。

表达计划决定：

> 这个作者准备怎么想到、怎么说这件事。

二者必须解耦。

## 6.3 不追求“伪装成人类”

系统不以绕过任何 AI 检测工具为产品目标。

目标是：

- 自然
- 有作者感
- 有表达变化
- 有具体性
- 有真实的思维路径
- 不机械套模板
- 不凭空制造个人经历

## 6.4 Truth First

不得为了“像真人”而伪造用户经历、日期、人物、场景、数据或事实。

系统必须区分：

```text
REAL_FACT
USER_EXPERIENCE
SOURCE_FACT
INFERRED
GENERIC_SCENE
FICTIONAL_EXAMPLE
```

只有明确允许的 `GENERIC_SCENE` / `FICTIONAL_EXAMPLE` 才可以被写成示例场景。

## 6.5 Local Rewrite

审计发现问题后，只修改问题段落、句子或表达单元，不默认全文重写。

---

# 7. 当前 MVP 的改造原则

## 7.1 保留

以下能力继续保留：

- `writing`
- `humanization`
- `refine`
- `style-distillation`
- `evaluation`
- 内容策略
- 情感弧线
- 人设

## 7.2 修改

### writing

从：

> 根据 Content Strategy 按结构完成文章。

改为：

> 根据 Content Strategy 决定内容覆盖，根据 Expression Plan 决定表达方式。

### humanization

从：

> 写作完成后的全文人性化重写。

改为：

> `Expression Audit`：定位模板化、抽象化、节奏单一、过度解释、虚假具体、表达人格漂移等问题。

原有的 AI 痕迹检测规则可以继续作为审计规则的一部分。

### evaluation

增加表达相关维度，不替换原有六维内容质量评估。

---

# 8. 新增 Skill 体系

建议 v1.0 新增三个核心 Skill：

```text
skills/
├── expression-planning/
├── expression-audit/
└── expression-rewrite/
```

同时逐步弱化原 `humanization` 的“全文重写”职责。

推荐长期结构：

```text
skills/
├── expression-planning/
│   ├── SKILL.md
│   ├── index.ts
│   ├── prompts.ts
│   ├── schema.ts
│   └── patterns/
│       └── thought-patterns.yaml
│
├── expression-audit/
│   ├── SKILL.md
│   ├── index.ts
│   ├── prompts.ts
│   ├── schema.ts
│   └── patterns/
│       └── ai-patterns.yaml
│
├── expression-rewrite/
│   ├── SKILL.md
│   ├── index.ts
│   ├── prompts.ts
│   └── schema.ts
│
├── humanization/        # legacy compatibility
├── refine/
├── style-distillation/
├── writing/
└── evaluation/
```

---

# 9. Expression Planning

## 9.1 职责

Expression Planning 不生成最终文本。

它只生成：

> **一个作者准备如何表达这件事情的蓝图。**

## 9.2 输入

```typescript
interface ExpressionPlanningInput {
  topic: TopicProfile;
  selectedAngle: SelectedAngle;
  strategy: ContentStrategy;
  audience: AudienceInsight;
  platform?: Platform;
  persona?: Persona;
  emotionalArc?: EmotionalArc;
  referenceContents?: ReferenceContent[];
  userExpressionProfile?: ExpressionProfile;
}
```

## 9.3 输出

```typescript
interface ExpressionPlan {
  version: "1.0";
  openingMode: OpeningMode;
  thoughtPath: ThoughtStep[];
  emotionalCurve: EmotionPoint[];
  rhythm: RhythmPlan;
  specificity: SpecificityPlan;
  voice: VoicePlan;
  transitions: TransitionPlan;
  structuralVariance: StructuralVariancePlan;
  truthConstraints: TruthConstraint[];
  conclusionMode: ConclusionMode;
}
```

---

# 10. Expression Blueprint 数据结构

推荐 JSON：

```json
{
  "version": "1.0",
  "openingMode": "observation",
  "thoughtPath": [
    {
      "type": "observation",
      "purpose": "建立共同经验"
    },
    {
      "type": "association",
      "purpose": "引出个人联想"
    },
    {
      "type": "contradiction",
      "purpose": "打破第一印象"
    },
    {
      "type": "realization",
      "purpose": "形成真正观点"
    },
    {
      "type": "reflection",
      "purpose": "留下余味"
    }
  ],
  "emotion": {
    "start": "calm",
    "middle": "reflective",
    "peak": "slightly_sad",
    "end": "restrained"
  },
  "rhythm": {
    "sentenceVariance": "high",
    "paragraphVariance": "high",
    "pauseDensity": "medium",
    "longSentenceRatio": 0.18
  },
  "specificity": {
    "level": "high",
    "preferConcreteObservation": true,
    "allowInventedPersonalExperience": false
  },
  "voice": {
    "distance": "friend",
    "authority": "experience",
    "humor": "low",
    "emotionDirectness": "medium"
  },
  "conclusionMode": "open_reflection"
}
```

---

# 11. Thought Pattern Library

这是 Human Expression Engine 最重要的规则资产之一。

## 11.1 Pattern 类型

```text
thought-patterns/
├── observation
├── memory-trigger
├── association
├── realization
├── contradiction
├── self-correction
├── hesitation
├── questioning
├── emotional-shift
├── digression
├── retrospective
└── open-reflection
```

## 11.2 Pattern 示例

### Self Correction

```yaml
id: self_correction
name: 自我修正
description: 说出一个判断后主动修正，使表达具有真实思考痕迹
allowed: true
risk: low
examples:
  - "我以前也一直这么觉得。"
  - "不过现在回头看，好像也不能这么说。"
constraints:
  max_per_1000_chars: 2
```

### Memory Trigger

```yaml
id: memory_trigger
name: 记忆触发
description: 当前观点被一个具体记忆或观察触发
allowed: true
requires_real_source: true
```

### Emotional Pause

```yaml
id: emotional_pause
name: 情绪停顿
description: 在情绪发生变化的位置允许短暂停顿或留白
allowed: true
examples:
  - "就是那一刻，我突然不知道该说什么。"
  - "后来想想……"
```

---

# 12. Rhythm Engine

## 12.1 目标

避免整篇文章出现：

```text
长度相似的句子
相同的转折方式
均匀段落
持续相同的信息密度
```

## 12.2 控制变量

```text
sentence_length_variance
paragraph_length_variance
punctuation_variance
pause_density
question_frequency
short_sentence_ratio
long_sentence_ratio
```

## 12.3 原则

不是要求“多短句”，而是要求：

> **句子长度有自然变化。**

不是要求“多口语”，而是要求：

> **语言节奏符合当前 Persona 和平台。**

---

# 13. Specificity Engine

## 13.1 Abstract → Concrete

把：

> 很多人都会感到孤独。

优先转换为：

> 有时候晚上回到家，房门一关，突然就发现今天一整天都没跟谁真正说过话。

但只有在没有冒充用户真实经历的前提下才能使用这种表达。

## 13.2 具体性来源优先级

```text
1. 用户明确提供的真实经历
2. 用户提供的素材
3. 来源内容中的真实细节
4. 不涉及个人事实的普遍场景
5. 抽象表达
```

---

# 14. Imperfection Engine

## 14.1 目标

允许表达自然出现：

- 自我修正
- 停顿
- 简短重复
- 语气缓冲
- 轻微转念
- 不完整句
- 局部留白

## 14.2 禁止

不允许为了“像真人”而机械插入：

```text
哈哈
嗯
那个
其实吧
我也不知道
……
```

这些元素必须有表达功能，否则属于另一种模板化。

---

# 15. Expression Persona

ContextOS 已经具备 AI 人设系统，因此 v1.0 不新增第二套“人设系统”，而是把现有人设扩展为 `Expression Profile`。

## 15.1 Persona

回答：

> 谁在说。

## 15.2 Expression Profile

回答：

> 这个人通常怎么说。

## 15.3 Profile 示例

```json
{
  "sentencePreference": "short_medium",
  "openingPreference": [
    "observation",
    "question"
  ],
  "emotionDirectness": "restrained",
  "firstPersonUsage": "high",
  "specificity": "high",
  "humor": "low",
  "conclusion": "open",
  "favoriteTransitions": [
    "其实",
    "后来",
    "不过"
  ],
  "avoidances": [
    "过度总结",
    "连续排比",
    "讲道理式结尾"
  ]
}
```

---

# 16. Expression Audit

## 16.1 职责

Expression Audit 不负责“把所有问题改掉”。

它只回答：

> 哪里不像一个自然的作者在表达？

## 16.2 检测维度

### A. Formulaic Expression

检测模板化语言。

### B. Structural Over-regularity

检测段落结构过于整齐。

### C. Sentence Uniformity

检测句长和句法过于均匀。

### D. Generic Abstraction

检测抽象、空洞表达。

### E. Over Explanation

检测每个观点都被解释到没有余地。

### F. Artificial Emotion

检测情绪曲线过于平滑或煽情。

### G. Fake Specificity

检测为了具体而凭空制造个人经历。

### H. Voice Drift

检测文章前后表达人格不一致。

### I. Mechanical Transition

检测“首先/其次/最后”等过度程序化连接。

### J. Thoughtless Transition

检测观点之间虽然逻辑正确，但缺乏真实思维过渡。

---

# 17. AI Pattern Library

现有 `humanization` Skill 中已有 AI 痕迹分类，应继续保留并扩展，而不是全部删除。当前仓库已经存在独立 `humanization` Skill 和其 `SKILL.md / prompts.ts / schema.ts / index.ts` 结构。citehttps://github.com/southportns/contentos/tree/main/skills/humanization

建议：

```yaml
patterns:
  - id: formulaic_intro
  - id: formulaic_summary
  - id: generic_abstraction
  - id: repeated_parallelism
  - id: excessive_connectors
  - id: over_explanation
  - id: generic_emotion
  - id: quote_bomb
  - id: uniform_sentence_rhythm
  - id: uniform_paragraph_rhythm
  - id: abstract_conclusion
  - id: fake_specificity
  - id: thoughtless_transition
  - id: voice_drift
```

注意：词语本身不能直接判定“AI”。例如“其实”“但是”“真正”都可以是自然的人类词汇。

判断应同时考虑：

```text
频率
位置
连续出现
上下文
结构
Persona
平台
```

---

# 18. Naturalness Judge

## 18.1 定位

`Naturalness Judge` 是表达层的质量裁判，不是“AI Detector”。

## 18.2 输出

```typescript
interface NaturalnessEvaluation {
  overall: number;
  dimensions: {
    naturalness: number;
    voiceConsistency: number;
    specificity: number;
    rhythm: number;
    thoughtAuthenticity: number;
    emotionalVariance: number;
    structuralVariance: number;
    oralness: number;
  };
  issues: ExpressionIssue[];
  rewriteTargets: RewriteTarget[];
}
```

## 18.3 建议评分

```text
Naturalness            20%
Voice Consistency      15%
Thought Authenticity   15%
Specificity            15%
Rhythm                 10%
Emotional Variance     10%
Structural Variance     5%
Oralness                5%
Content Preservation    5%
```

这个分数只用于内部优化，不向用户宣传成“真人率”或“AI 规避率”。

---

# 19. Targeted Rewrite

## 19.1 原则

审计结果：

```json
{
  "issues": [
    {
      "paragraph": 3,
      "type": "generic_abstraction",
      "severity": "high"
    }
  ]
}
```

Rewrite Agent 只收到：

```text
原段落
+
相邻上下文
+
问题类型
+
Expression Plan
+
Persona
```

而不是重新拿整个 Content Strategy 写全文。

## 19.2 Rewrite 策略

```text
formulaic
→ 改变表达路径

abstract
→ 增加可靠具体性

uniform_rhythm
→ 调整句长与停顿

over_explained
→ 删除多余解释

voice_drift
→ 恢复 Persona 特征

fake_specificity
→ 回退到可靠的非虚构场景
```

---

# 20. Agent Workflow 改造

当前 ContextOS 的创作流程包含从主题研究、角度选择、策略、初稿、人性化和评估等阶段；仓库的产品说明也明确将人性化润色作为二次精修能力。citehttps://github.com/southportns/contentos/blob/main/README.md

v1.0 改造为：

```text
Topic Research
     ↓
Viral Analysis
     ↓
Audience Analysis
     ↓
Angle Generation
     ↓
Content Strategy
     ↓
Expression Planning       ← NEW
     ↓
Writing
     ↓
Expression Audit          ← NEW
     ↓
Targeted Rewrite          ← NEW
     ↓
Quality Evaluation
     ↓
Risk Analysis
     ↓
Final Content
```

---

# 21. Context 传递规则

当前表达层必须避免一个问题：前面 Agent 已经产生的大量上下文，在后处理中被压缩成“只传文章正文”。

Expression Layer 至少应收到：

```typescript
interface ExpressionContext {
  topic;
  selectedAngle;
  strategy;
  audience;
  platform;
  persona;
  emotionalArc;
  draft;
  sourceFacts;
  userProvidedExperiences;
  referenceContents;
  expressionProfile;
}
```

任何涉及用户经历的表达，都应该能够追溯到 `userProvidedExperiences` 或明确允许的非个人示例。

---

# 22. content-agent.ts 改造逻辑

## 当前概念

```text
writingNode
   ↓
humanizationNode
   ↓
evaluationNode
```

## v1.0

```text
strategyNode
   ↓
expressionPlanningNode
   ↓
writingNode
   ↓
expressionAuditNode
   ↓
conditionalRewriteNode
   ↓
evaluationNode
```

伪代码：

```typescript
const expressionPlan = await runExpressionPlanning({
  topic: state.topic,
  selectedAngle: state.selectedAngle,
  strategy: state.strategy,
  audience: state.audience,
  platform: state.platform,
  persona: state.persona,
  emotionalArc: state.strategy?.emotionalArc,
});

const draft = await runWriting({
  ...existingWritingContext,
  expressionPlan,
});

const audit = await runExpressionAudit({
  ...fullExpressionContext,
  draft,
  expressionPlan,
});

const finalDraft = audit.requiresRewrite
  ? await runExpressionRewrite({
      ...fullExpressionContext,
      draft,
      expressionPlan,
      audit,
    })
  : draft;
```

最终再进入现有 Evaluation。

---

# 23. Writing Skill 改造规范

Writing Skill 不应该再承担“所有事情”。

## Writing 负责

```text
内容完整性
事实覆盖
策略执行
平台适配
表达实现
```

## Expression Planning 负责

```text
怎么开始
怎么想到
哪里转念
哪里停顿
哪里具体化
情绪怎么变化
怎么结束
```

## Expression Audit 负责

```text
哪里过度标准化
哪里缺乏作者感
哪里过于抽象
哪里太整齐
哪里像模板
```

## Expression Rewrite 负责

```text
只修问题区域
```

---

# 24. Prompt 设计

## 24.1 禁止采用“一条超级 Prompt”

不要建立一个几千字 Prompt，把：

- 平台规则
- 爆款规则
- 人设
- 去 AI 味
- 思考方式
- 口语化
- 内容策略

全部塞进 Writing Prompt。

这样会造成：

- Prompt 优先级冲突
- 规则相互覆盖
- 模型注意力分散
- 调试困难
- 无法知道到底是哪一层产生了问题

## 24.2 采用模块化 Prompt

```text
Core Writing System Prompt
+
Content Strategy
+
Expression Plan
+
Persona Profile
+
Platform Profile
+
Truth Constraints
+
Task Context
```

---

# 25. Expression Writer Prompt 核心原则

建议系统提示核心思想：

```text
You are not trying to sound “human”.
You are writing as a specific person with a specific way of thinking.

Follow the content strategy for what must be communicated.
Follow the expression plan for how the thought unfolds.

Do not make every paragraph perfectly complete.
Do not explain every conclusion.
Do not manufacture personal experiences.
Do not insert casual filler merely to appear conversational.
Do not mechanically vary sentence length.
Do not replace a human voice with generic colloquial language.

Preserve facts, sources, intent and strategy.
Let expression variation emerge from the persona and thought path.
```

中文核心规则：

```text
不要刻意“装成人”。
你要做的是按照指定作者的思维和表达习惯进行表达。

内容策略决定必须表达什么。
表达计划决定作者如何想到并说出这些内容。

不要让每个段落都像一个完整的论证单元。
不要把所有观点都解释到最后。
不要凭空创造第一人称经历。
不要为了口语化机械添加语气词。
不要为了制造变化而机械打乱句子长度。

优先保持真实、具体、自然和作者一致性。
```

---

# 26. Naturalness Judge Prompt

Judge 不应该问：

> “这像不像 AI？”

而应该问：

```text
1. 这像不像一个具体的人在说？
2. 这个人有没有自己的表达选择？
3. 观点之间是否存在自然的思维路径？
4. 句子和段落是否过于均匀？
5. 是否出现模板化表达？
6. 是否有过度解释？
7. 情绪变化是否机械？
8. 是否存在未经依据的个人经历？
9. 是否偏离 Persona？
10. 修改后是否仍然保留原始内容策略？
```

---

# 27. Evaluation 改造

现有六维质量评估继续保留：

```text
情感冲击
逻辑清晰
新颖度
可读性
实用性
平台适配
```

ContextOS 当前 README 已明确采用上述六维评估体系。citehttps://github.com/southportns/contentos/blob/main/README.md

新增内部表达维度：

```text
Naturalness
Voice Consistency
Thought Authenticity
Specificity
Rhythm
Emotional Variance
Structural Variance
Oralness
```

最终：

```text
Content Quality Score
+
Expression Quality Score
```

两套分数不混成一个不可解释的数字。

---

# 28. 不建议 v1.0 上机器学习分类器

v1.0 优先使用：

```text
LLM structured judge
+
deterministic text statistics
+
pattern library
```

先不要直接训练一个“AI 文本分类模型”。

原因：

1. 体裁差异很大。
2. 小红书、抖音口播、公众号不能共用一套统计阈值。
3. “像 AI”不是一个单一稳定标签。
4. 首先需要真实 Benchmark 数据，才能决定哪些特征值得训练。

---

# 29. Deterministic Metrics

无需模型即可计算：

```text
sentence_count
mean_sentence_length
sentence_length_std
paragraph_count
paragraph_length_std
question_ratio
first_person_ratio
connector_ratio
repeated_phrase_ratio
template_pattern_hits
abstract_noun_ratio
concrete_noun_ratio
quotation_ratio
```

## Human Variation Index

可以建立内部指标 `HVI`：

```text
HVI =
  sentence_variance
+ paragraph_variance
+ vocabulary_variance
+ syntax_variance
+ transition_variance
```

但 HVI 只能作为辅助信号，不可作为“真人证明”。

---

# 30. Benchmark 系统

这是 v1.0 非常重要的一部分。

目录：

```text
benchmark/
├── human/
├── ai/
├── rewritten/
├── mixed/
└── reports/
```

建议第一批数据：

```text
100 篇真人文本
100 篇原始 AI 文本
100 篇 ContextOS 输出
100 篇 ContextOS Human Expression Engine 输出
```

每篇数据标注：

```text
platform
content_type
author_style
length
human_likeness
voice_strength
specificity
rhythm
emotion
```

---

# 31. Blind Test

不要只让模型评价自己的输出。

至少加入人工盲测：

```text
A = 真人原文
B = 原始 AI
C = ContextOS
D = ContextOS + Human Expression Engine
```

受试者回答：

```text
哪一篇最像真实作者写的？
哪一篇最自然？
哪一篇最有个人感？
哪一篇最愿意继续读？
```

这是 v1.0 最核心的产品指标之一。

---

# 32. Acceptance Criteria

v1.0 不以“检测器分数达到某个值”作为唯一验收条件。

建议验收：

### P0

- Expression Plan 可以稳定生成。
- Writer 能消费 Expression Plan。
- Audit 能输出结构化问题。
- Rewrite 可以局部修复。
- 整个流程最多循环 3 次。
- 原有六维评估不受影响。
- 不产生未经允许的个人经历。

### P1

人工盲测中，`ContextOS + Expression Engine` 相对于当前 `ContextOS MVP` 在“自然度 / 作者感 / 节奏”维度得到明显提升。

### P2

相同 Persona 下，重复生成内容的表达特征趋于稳定；不同 Persona 之间具有可感知差异。

---

# 33. 性能与成本约束

v1.0 默认最多：

```text
Expression Planning: 1 LLM call
Writing:             1 LLM call
Expression Audit:    1 LLM call
Rewrite:             0–1 LLM call
Final Evaluation:    existing call
```

正常情况下：

```text
4–5 次模型调用
```

后续可以通过：

- 小模型执行 Audit
- 确定性统计先过滤
- 低风险文本跳过 Rewrite
- 缓存 Expression Profile

降低成本。

---

# 34. Retry / Loop Policy

```typescript
const MAX_EXPRESSION_REVISIONS = 3;

if (audit.overall >= 85) {
  return PASS;
}

if (audit.blockers.length > 0) {
  return REWRITE;
}

if (revisionCount >= MAX_EXPRESSION_REVISIONS) {
  return PASS_WITH_WARNINGS;
}
```

不能无限循环。

---

# 35. 数据库 v1.0

当前 MVP 使用 SQLite + Prisma，因此 v1.0 不要求立即切 PostgreSQL；可以在现有 Prisma 架构基础上增加模型。当前仓库 README 明确使用 SQLite（Prisma + better-sqlite3）。citehttps://github.com/southportns/contentos/blob/main/README.md

建议模型：

```text
ExpressionProfile
ExpressionPlan
ExpressionAudit
ExpressionRevision
ThoughtPattern
ExpressionBenchmark
BenchmarkResult
```

## ExpressionProfile

```text
id
personaId
version
profileJson
createdAt
updatedAt
```

## ExpressionPlan

```text
id
contentId
version
planJson
createdAt
```

## ExpressionAudit

```text
id
contentId
revision
scoreJson
issuesJson
createdAt
```

## ExpressionRevision

```text
id
contentId
sourceVersion
targetVersion
changedSections
reasonJson
createdAt
```

---

# 36. API 建议

新增内部 API：

```text
POST /api/ai/expression/plan
POST /api/ai/expression/audit
POST /api/ai/expression/rewrite
POST /api/ai/expression/evaluate
```

如果当前项目已有统一 AI skill API 调度层，则优先复用现有模式，不为了 Expression Engine 单独创建新的基础设施层。

---

# 37. UI v1.0

第一阶段不建议增加复杂用户界面。

已有“人性化润色”界面可以逐步改成：

```text
Expression Quality

Naturalness       86
Voice             89
Specificity       81
Rhythm            84
Thought Flow      88

Detected Issues
● 第 2 段：过度解释
● 第 4 段：结构过于整齐
● 第 5 段：抽象表达偏多
```

用户可以选择：

```text
[ 保持 ]
[ 局部优化 ]
[ 深度优化 ]
```

不要在 UI 中展示：

> “AI Detection Score”

而应该展示：

> “表达自然度”

---

# 38. Platform Adaptation

Expression Engine 不应该替代现有平台 Skill。

最终组合方式：

```text
Platform Profile
+
Expression Profile
```

例如：

```text
抖音：
口语密度高
短句多
停顿明显
表达直接

小红书：
个人观察强
场景丰富
情绪更细腻
适度结构化

公众号：
句子可更完整
思考深度更高
允许更明显的观点展开
```

平台规则决定“适合哪里”，Expression Profile 决定“像谁”。

---

# 39. Style Distillation 改造

当前项目已经存在 `style-distillation` Skill，因此不再新建独立的 Style Extraction 系统。citehttps://github.com/southportns/contentos/tree/main/skills/style-distillation

修改为：

```text
Style Distillation
      ↓
Style Profile
      ↓
Expression Profile
      ↓
Expression Planning
```

Style Distillation 负责“分析”。

Expression Profile 负责“持久化”。

Expression Planning 负责“本次写作如何应用”。

---

# 40. Personal Expression Profile 第二阶段能力

用户产生足够内容后：

```text
历史内容
↓
Style Distillation
↓
Expression Feature Extraction
↓
Personal Expression Profile
```

例如：

```text
Opening:
Observation 58%
Question 25%
Statement 17%

Emotion:
Restrained 72%
Direct 18%
Strong 10%

Conclusion:
Open 68%
Direct 22%
CTA 10%
```

这个 Profile 将是 ContextOS 长期差异化资产。

---

# 41. Future Human Corpus

P2 再建立真人语料分析体系。

数据源可以包括：

```text
真实创作者内容
抖音口播
小红书笔记
公众号文章
知乎回答
播客转录
高质量评论区
```

重点不是简单 RAG，而是提取：

```text
sentence rhythm
thought transitions
specificity
emotion movement
self-correction
vocabulary
structure variance
```

最终构建：

> Human Expression Pattern Library

---

# 42. 安全与真实性规则

## 禁止

```text
伪造用户经历
伪造引用
伪造来源
伪造数据
伪造人物
伪造“我亲身经历”
```

## 可以

```text
基于用户真实信息重新组织表达
使用来源中的真实场景
使用明确标记的假设性例子
使用普遍生活场景，但不冒充作者经历
```

---

# 43. 版本规划

## Phase 0 — Architecture

目标：建立协议和目录。

```text
ExpressionPlan schema
ExpressionAudit schema
ExpressionRewrite schema
content-agent state 扩展
```

## Phase 1 — Core Loop

```text
Expression Planning
→ Writing
→ Audit
→ Rewrite
```

这是第一个可用版本。

## Phase 2 — Quality System

```text
Deterministic metrics
Naturalness Judge
HVI
Benchmark
```

## Phase 3 — Personalization

```text
Style Distillation
→ Expression Profile
→ Personalized Writing
```

## Phase 4 — Learning Loop

```text
Published Content
→ Performance
→ Expression Analysis
→ Profile Update
```

---

# 44. 第一阶段不做什么

为了避免 ContextOS 再次变成“Skill 堆积”：

v1.0 不做：

- 训练自有语言模型
- 独立 AI Detector SaaS
- 大规模向量数据库
- 自动爬取海量真人语料
- 复杂 RLHF
- 复杂用户画像
- 自动学习用户的一切表达习惯
- 追求“AI 检测 0%”

这些全部后置。

---

# 45. 开发优先级

```text
P0-1  ExpressionPlan schema
P0-2  expression-planning Skill
P0-3  修改 writing Skill
P0-4  expression-audit Skill
P0-5  expression-rewrite Skill
P0-6  修改 content-agent workflow
P0-7  增加 Expression Quality evaluation
P0-8  增加 benchmark

P1-1  Deterministic metrics
P1-2  Thought Pattern Library
P1-3  AI Pattern Library
P1-4  UI expression quality

P2-1  Personal Expression Profile
P2-2  Human Corpus
P2-3  Learning Loop
```

---

# 46. Coding Agent 实施要求

Coding Agent 在开始前必须：

```text
1. 阅读 PROJECT.md
2. 阅读 PRODUCT_SPEC.md
3. 阅读 ARCHITECTURE.md
4. 阅读 SKILL_SPEC.md
5. 阅读 DEVELOPMENT.md
6. 阅读 ROADMAP.md
7. 阅读 AGENTS.md
8. 检查 src/lib/agents
9. 检查 skills/writing
10. 检查 skills/humanization
11. 检查 skills/refine
12. 检查 skills/style-distillation
13. 检查 skills/evaluation
14. 检查 Prisma schema
```

当前项目的 `AGENTS.md` 已明确要求 Agent 在编码前先阅读项目级设计文档并检查相关 Skill 和数据库模型，因此 Expression Engine 的开发应继续遵守这一规范。citehttps://github.com/southportns/contentos/blob/main/AGENTS.md

---

# 47. Coding Agent 禁止事项

```text
禁止推倒重写 Content Agent
禁止删除现有 humanization
禁止修改无关 Skill
禁止新增第二套 Persona 系统
禁止为了表达引擎修改数据库基础设施
禁止为了 v1.0 引入 ML training pipeline
禁止使用“AI Detector Score”作为产品核心指标
```

---

# 48. 最终架构

ContextOS v1.0 最终形成：

```text
┌──────────────────────────────────────────────┐
│                  ContextOS                   │
├──────────────────────────────────────────────┤
│                                              │
│ Content Intelligence                         │
│ ├── Topic Research                            │
│ ├── Content Search                            │
│ ├── Viral Analysis                            │
│ ├── Audience Analysis                         │
│ └── Content Distillation                      │
│                                              │
│ Content Strategy                              │
│ ├── Angle Generation                          │
│ ├── Content Strategy                          │
│ └── Emotional Arc                             │
│                                              │
│ Expression Intelligence                       │
│ ├── Persona                                   │
│ ├── Style Profile                             │
│ ├── Thought Pattern                           │
│ ├── Expression Planning                       │
│ ├── Rhythm                                    │
│ └── Specificity                               │
│                                              │
│ Writing                                       │
│                                              │
│ Expression Quality                            │
│ ├── Expression Audit                          │
│ ├── Naturalness Judge                         │
│ └── Targeted Rewrite                          │
│                                              │
│ Content Quality                               │
│ ├── Six-Dimension Evaluation                  │
│ ├── Risk Analysis                             │
│ └── Platform Fit                              │
│                                              │
└──────────────────────────────────────────────┘
```

---

# 49. 最终产品定义

ContextOS 不应该只是：

> AI 帮你写内容。

也不应该只是：

> AI 帮你去掉 AI 味。

Human Expression Engine 引入之后，ContextOS 的核心能力应该变成：

> **理解内容应该说什么，再理解一个人会怎么说这件事，最后把两者结合成真正可发布的内容。**

最终形成：

```text
Content Intelligence
        ↓
Content Strategy
        ↓
Human Expression
        ↓
Writing
        ↓
Quality Control
        ↓
Published Content
        ↓
Performance Feedback
        ↓
Expression Profile Evolution
```

这条链路才是 ContextOS 长期真正值得积累的数据和能力。

---

# 50. v1.0 Definition of Done

当以下条件全部满足时，Human Expression Engine v1.0 视为完成：

```text
[ ] ExpressionPlan schema 完成
[ ] expression-planning Skill 完成
[ ] writing Skill 能消费 ExpressionPlan
[ ] expression-audit Skill 完成
[ ] expression-rewrite Skill 完成
[ ] content-agent Workflow 接入 Expression Layer
[ ] Expression Context 不丢失
[ ] Truth Constraints 生效
[ ] Audit → Rewrite 闭环生效
[ ] 最大循环次数受控
[ ] Expression Quality 独立评估
[ ] Benchmark 数据集建立
[ ] 至少完成一次人工盲测
[ ] 当前 MVP 所有原有功能仍可正常运行
```

---

# 51. 推荐的下一步开发任务

第一批不要同时开发全部模块。

最合理的开发任务是：

```text
TASK P0.1
Human Expression Engine Foundation

1. 创建 ExpressionPlan schema
2. 创建 expression-planning Skill
3. 将 ExpressionPlan 注入 writing
4. 创建 expression-audit Skill
5. 创建 expression-rewrite Skill
6. 修改 content-agent workflow
7. 保留 humanization 作为兼容层
8. 加入基础测试
```

完成这一步后，再进行：

```text
P0.2
Naturalness Judge + deterministic metrics

P0.3
Benchmark + blind test

P0.4
Personal Expression Profile
```

---

# 52. 核心原则总结

```text
1. 不从“改词”开始，从“表达决策”开始。
2. Strategy 决定说什么，Expression 决定怎么说。
3. 不把 Humanization 当成最终答案，而把它变成 Audit。
4. 不全文重写，优先局部修改。
5. 不伪造第一人称经历。
6. 不依赖一个“AI 味分数”。
7. 先做可验证 Benchmark，再做模型优化。
8. 先做规则 + LLM Judge，再考虑训练模型。
9. Persona 与 Expression Profile 分离。
10. 最终目标不是“像真人”，而是“像这个具体的人”。
```

---

## References

- ContextOS Repository: https://github.com/southportns/contentos
- ContextOS README: https://github.com/southportns/contentos/blob/main/README.md
- ContextOS Skills: https://github.com/southportns/contentos/tree/main/skills
- Humanization Skill: https://github.com/southportns/contentos/tree/main/skills/humanization
- Writing Skill: https://github.com/southportns/contentos/tree/main/skills/writing
- Style Distillation Skill: https://github.com/southportns/contentos/tree/main/skills/style-distillation
- AGENTS.md: https://github.com/southportns/contentos/blob/main/AGENTS.md

