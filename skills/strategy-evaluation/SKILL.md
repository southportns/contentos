# strategy-evaluation

## Purpose

基于内容策略评分模型 Prompt，对内容在指定平台上的"内容策略适配度"和"潜在传播能力"进行结构化评估。

不是预测平台真实推荐算法，而是识别内容是否具备符合目标平台传播逻辑的结构性条件。

## When To Use

在 writing skill 生成初稿后调用。也可在 humanization 后调用。

## Input

```typescript
interface StrategyEvaluationInput {
  platform: 'douyin' | 'xiaohongshu' | 'wechat'
  topic: string
  audienceDescription?: string
  angle?: {
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  }
  strategy?: {
    title: string
    hook: string
    structure: Array<{
      section: string
      purpose: string
      keyArguments: string[]
      estimatedWords: number
    }>
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
    tone: string
  }
  draft: {
    title: string
    content: string
    wordCount?: number
  }
  researchData?: {
    contents: Array<{
      platform: string
      title: string | null
      viralScore?: number
    }>
    audienceInsights?: {
      needs: string[]
      painPoints: string[]
    }
  }
}
```

## Output

```typescript
interface StrategyEvaluationOutput {
  platform: string
  overallScore: number
  grade: 'exceptional' | 'strong' | 'good' | 'average' | 'poor'
  scores: Record<string, number>
  platformFit: number
  strategyConsistency: number
  strengths: string[]
  weaknesses: string[]
  criticalIssues: string[]
  improvementPriorities: Array<{
    priority: number
    problem: string
    reason: string
    suggestion: string
  }>
  shareAnalysis: {
    motivation: string
    target: string
    context: string
  }
  aiStyleRisk: number
  authenticityScore: number
  evidenceQuality: number
  confidence: number
  verdict: string
}
```

## Platform Scoring Models

### 抖音 (douyin)
权重: Hook 25%, Retention 25%, Emotion 20%, Interaction 15%, Shareability 10%, Novelty 5%

### 小红书 (xiaohongshu)
权重: Searchability 20%, Relatability 20%, Saveability 20%, Usefulness 15%, Trust 10%, Interaction 10%, Novelty 5%

### 公众号 (wechat)
权重: TitleClickability 20%, Depth 20%, Readability 15%, Trust 15%, EmotionalResonance 15%, Shareability 15%

## Overall Score Formula

```
Platform Weighted Score
×
Strategy Consistency Modifier (0.8~1.0)
×
Risk Modifier (0.75~1.0)
```

## Workflow

1. 识别目标平台，选择对应的评分模型
2. 评估基础维度（Hook、Emotion、Novelty、Structure、Clarity、Value、Shareability、Authenticity）
3. 评估平台特定维度（按平台权重）
4. 评估 Platform Fit 和 Strategy Consistency
5. 评估 AI Style Risk、Authenticity、Evidence Quality
6. 计算 Overall Score（加权 × 一致性修正 × 风险修正）
7. 生成 Strengths、Weaknesses、Critical Issues
8. 生成 Improvement Priorities（按 Impact × Difficulty 排序）
9. 生成 Share Analysis
10. 生成 Verdict

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 评分范围 0-100
- 五层级：90-100 极强 / 80-89 强 / 70-79 良好 / 60-69 一般 / 0-59 存在明显问题
- 不虚构数据、来源、评论
- 不声称知道平台内部算法
- 区分事实、研究证据、规则推断、主观判断
- 保守评分，不为讨好而给高分
- 如果证据不足，降低 Confidence

## Version

1.0.0
