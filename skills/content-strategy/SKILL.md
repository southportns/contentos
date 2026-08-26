# content-strategy

## Purpose

基于选定的内容角度，生成完整的内容策略，包括结构大纲、关键论点、引用素材建议。

## When To Use

在用户选择并确认角度后（Human Approval），生成内容策略。

## Human Approval

**此 Skill 的输出必须经过用户确认。** Agent 不得自动跳过。

## Input

```typescript
interface ContentStrategyInput {
  topic: string
  selectedAngle: {
    id: string
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  }
  topicProfile?: {
    keywords: string[]
    coreQuestions: string[]
  }
  audienceInsights?: {
    needs: string[]
    painPoints: string[]
  }
  platform?: string
  contentType?: string
  tone?: string
  wordCount?: number
}
```

## Output

```typescript
interface ContentStrategyOutput {
  title: string
  hook: string
  structure: Array<{
    section: string
    purpose: string
    keyArguments: string[]
    estimatedWords: number
  }>
  keyArguments: string[]
  emotionalArc: {
    start: string
    middle: string
    end: string
  }
  callToAction: string
  suggestedReferences: string[]
  tone: string
  estimatedWordCount: number
}
```

## Workflow

1. 接收选定角度和上下文
2. 调用 LLM 生成内容策略（Structured Output）
3. 生成标题、Hook、结构大纲
4. 生成关键论点和情感弧线
5. 生成 CTA 和引用建议
6. 返回供用户确认

## Tools

- AI Model (generateObject)

## Constraints

- 结构至少 3 个段落
- 不虚构引用数据
- 基于 selectedAngle 生成

## Version

1.0.0
