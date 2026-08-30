# content-adaptation

## Purpose

分析对标内容（原文案/口播文本），提炼其内容结构、核心观点、情绪曲线和爆款因子，然后结合用户的角色设定（Persona）和自身想法，生成差异化的改编方向和策略建议。

## When To Use

当用户在内容浏览器中发现一条对标内容，想要基于该内容进行二次改编创作时使用。

## Input

```typescript
interface AdaptationInput {
  referenceContent: {
    title: string | null
    content: string | null
    transcript: string | null
    platform: string
    author: string | null
    url: string | null
    metrics: {
      likes: number | null
      comments: number | null
      shares: number | null
      favorites: number | null
      views: number | null
    } | null
  }
  userIdea: string
  persona?: {
    name: string
    description: string | null
  }
  platform?: string
}
```

## Output

```typescript
interface AdaptationOutput {
  referenceAnalysis: {
    hookType: string
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    keyPoints: string[]
    viralFactors: string[]
    weaknesses: string[]
  }
  adaptedAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatChanged: string
    estimatedViralScore: number
  }>
  strategySuggestion: {
    tone: string
    structure: Array<{ section: string; purpose: string; keyArguments: string[] }>
    hookStrategy: string
    ctaStrategy: string
  }
}
```

## Workflow

1. 接收对标内容和用户想法
2. 深度拆解对标内容（钩子、结构、情绪、观点、爆款因子）
3. 结合用户 Persona 和想法生成 3-5 个差异化改编角度
4. 为每个角度说明与原内容的差异和改编理由
5. 提供改编策略建议

## Tools

- AI Model (generateText)

## Constraints

- 禁止简单换词或洗稿式改编
- 每个改编角度必须有明确差异
- 必须结合用户的自身想法
- 如果提供了 persona，改编方向必须符合人设设定
- 不虚构数据和引用

## Validation

- adaptedAngles 至少 3 个
- estimatedViralScore 在 0-100 范围内
- 每个角度必须有 whatChanged 字段说明差异

## Failure Handling

- 对标内容为空 → 返回错误
- 用户想法为空 → 返回错误
- AI 输出解析失败 → 重试或返回错误

## Version

1.0.0
