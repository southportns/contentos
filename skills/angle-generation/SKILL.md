# angle-generation

## Purpose

基于主题画像、爆款分析和受众洞察，生成多个内容切入角度供用户选择。

## When To Use

在 viral-analysis 和 audience-analysis 完成后调用。

## Human Approval

**此 Skill 的输出必须经过用户选择和确认。** Agent 不得自动跳过。

## Input

```typescript
interface AngleGenerationInput {
  topic: string
  topicProfile: {
    category: string
    keywords: string[]
    coreQuestions: string[]
    potentialAngles: string[]
  }
  viralPatterns?: {
    commonStrengths: string[]
    viralFactors: string[]
    avgViralScore: number
  }
  audienceInsights?: {
    needs: string[]
    painPoints: string[]
    emotions: Array<{ emotion: string; intensity: number }>
    contentGaps: string[]
  }
  count?: number
}
```

## Output

```typescript
interface AngleGenerationOutput {
  angles: Array<{
    id: string
    title: string
    angle: string
    reasoning: string
    targetEmotion: string
    estimatedViralScore: number
    difficulty: 'low' | 'medium' | 'high'
    keyPoints: string[]
    audienceAppeal: string
  }>
}
```

## Workflow

1. 接收主题画像、爆款 pattern、受众洞察
2. 调用 LLM 生成多个内容角度（Structured Output）
3. 每个角度包含标题、切入角度、理由、目标情绪、预估爆款分、难度、关键点
4. 返回给用户选择

## Tools

- AI Model (generateObject)

## Constraints

- 至少生成 3 个角度
- 每个角度必须有独立的切入点
- 不虚构数据
- estimatedViralScore 范围 0-100

## Version

1.0.0
