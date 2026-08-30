# content-distillation

## Purpose

从用户上传的文章、报道或书籍内容中提炼核心素材、关键观点、情绪脉络和内容结构，结合用户的创作意图，生成差异化的口播稿创作角度和策略建议。

## When To Use

当用户在自由创作模式下上传一篇文章/报道/书籍内容，希望基于该内容自我学习和提炼，从中创作口播稿时使用。

## Input

```typescript
interface DistillationInput {
  sourceContent: {
    title: string | null
    content: string
    sourceType: string // article | report | book | essay | other
    fileName: string | null
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
interface DistillationOutput {
  sourceAnalysis: {
    coreTheme: string
    keyInsights: string[]
    contentStructure: string[]
    emotionalArc: { start: string; middle: string; end: string }
    memorableQuotes: string[]
    applicableAngles: string[]
    weaknesses: string[]
  }
  distilledAngles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    keyPoints: string[]
    whatExtracted: string
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

1. 接收上传内容和用户创作意图
2. 深度提炼内容核心主题、关键洞察、内容结构、情绪脉络
3. 提取可引用的金句和可应用的创作角度
4. 结合用户 Persona 和创作意图生成 3-5 个差异化的口播稿创作角度
5. 为每个角度说明从原文中提炼了什么、为什么这样切入
6. 提供口播稿策略建议（语调、结构、钩子策略、CTA 策略）

## Tools

- AI Model (generateText)

## Constraints

- 禁止简单复制或洗稿，必须提炼后重新构建
- 每个创作角度必须有明确差异化
- 必须结合用户的创作意图
- 如果提供了 persona，创作方向必须符合人设设定
- 不虚构数据和引用
- 金句必须来自原文，不得编造

## Validation

- distilledAngles 至少 3 个
- estimatedViralScore 在 0-100 范围内
- 每个角度必须有 whatExtracted 字段说明提炼内容
- memorableQuotes 不超过 5 条

## Failure Handling

- 上传内容为空 → 返回错误
- 用户想法为空 → 返回错误
- 内容过长 → 截取前 10000 字符处理
- AI 输出解析失败 → 重试或返回错误

## Version

1.0.0
