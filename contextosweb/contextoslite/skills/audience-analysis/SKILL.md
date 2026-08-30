# audience-analysis

## Purpose

分析内容数据的受众画像，包括受众需求、痛点、情绪分布、行为模式。

## When To Use

在 viral-analysis 完成后，对搜索到的内容进行受众分析。

## Input

```typescript
interface AudienceAnalysisInput {
  contents: Array<{
    platform: string
    title: string | null
    content: string | null
    metrics?: {
      comments?: number | null
      likes?: number | null
    } | null
  }>
  topicCategory?: string
  topicKeywords?: string[]
}
```

## Output

```typescript
interface AudienceAnalysisOutput {
  demographics: {
    primaryAgeRange: string
    primaryGender: string
    secondaryAgeRange: string
    secondaryGender: string
  }
  needs: string[]
  painPoints: string[]
  emotions: Array<{
    emotion: string
    intensity: number
    percentage: number
  }>
  behaviors: string[]
  preferences: string[]
  contentGaps: string[]
}
```

## Workflow

1. 分析所有内容
2. 调用 LLM 推断受众画像（Structured Output）
3. 生成受众需求、痛点、情绪分布
4. 识别行为模式和偏好
5. 识别内容空白

## Tools

- AI Model (generateObject)

## Constraints

- 不虚构数据
- intensity 和 percentage 范围 0-100
- 所有推断基于内容数据

## Version

1.0.0
