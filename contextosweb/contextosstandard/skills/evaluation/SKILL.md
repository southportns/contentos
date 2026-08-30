# evaluation

## Purpose

评估生成的内容初稿，给出多维度评分和改进建议。

## When To Use

在 writing skill 生成初稿后调用。

## Input

```typescript
interface EvaluationInput {
  content: string
  title: string
  strategy?: {
    title: string
    keyArguments: string[]
    emotionalArc: { start: string; middle: string; end: string }
    callToAction: string
  }
  selectedAngle?: {
    title: string
    targetEmotion: string
    keyPoints: string[]
  }
  platform?: string
}
```

## Output

```typescript
interface EvaluationOutput {
  overallScore: number
  scores: {
    emotionalImpact: number
    logicalClarity: number
    novelty: number
    readability: number
    utility: number
    platformFit: number
  }
  strengths: string[]
  weaknesses: string[]
  suggestions: Array<{
    section: string
    issue: string
    suggestion: string
    priority: 'high' | 'medium' | 'low'
  }>
  emotionalArcAnalysis: {
    achieved: boolean
    analysis: string
  }
  conclusion: string
}
```

## Workflow

1. 接收初稿内容和策略
2. 调用 LLM 进行多维度评估（Structured Output）
3. 评分：情感冲击力、逻辑清晰度、新颖度、可读性、实用性、平台适配度
4. 识别优点和缺点
5. 生成具体改进建议
6. 分析情感弧线是否达成
7. 返回评估结果

## Tools

- AI Model (generateObject)

## Constraints

- 评分范围 0-100
- 不虚构数据
- 建议必须具体可操作
- 不修改原文内容

## Version

1.0.0
