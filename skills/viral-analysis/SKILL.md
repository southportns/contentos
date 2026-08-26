# viral-analysis

## Purpose

分析内容数据，评估爆款潜力，生成结构化的病毒式传播分析报告。

## When To Use

在 content-search 完成后，对搜索到的内容进行爆款分析。

## Input

```typescript
interface ViralAnalysisInput {
  contents: Array<{
    platform: string
    url: string
    title: string | null
    content: string | null
    author: string | null
    publishedAt: string | null
    metrics?: {
      likes?: number | null
      comments?: number | null
      shares?: number | null
      favorites?: number | null
      views?: number | null
    } | null
  }>
  topicCategory?: string
}
```

## Output

```typescript
interface ViralAnalysisOutput {
  analyses: Array<{
    url: string
    platform: string
    viralScore: number
    emotionScore: number
    controversyScore: number
    noveltyScore: number
    utilityScore: number
    summary: string
    strengths: string[]
    weaknesses: string[]
    keyFactors: string[]
  }>
  patterns: {
    commonStrengths: string[]
    commonWeaknesses: string[]
    viralFactors: string[]
    avgViralScore: number
    topContents: Array<{
      url: string
      viralScore: number
    }>
  }
}
```

## Workflow

1. 遍历 contents
2. 对每条内容调用 LLM 进行结构化分析（Structured Output）
3. 生成爆款评分、情感评分、争议性评分、新颖性评分、实用性评分
4. 识别优点和缺点
5. 汇总生成 pattern 分析
6. 返回结构化结果

## Tools

- AI Model (generateObject)

## Constraints

- 评分范围 0-100
- 不虚构数据
- 缺失数据用 null
- 每条分析必须有 url

## Validation

- 评分 0-100
- viralScore 必须有
- url 非空

## Failure Handling

- 单条分析失败：跳过该条，继续其他
- 全部失败：返回空数组 + 错误信息

## Version

1.0.0
