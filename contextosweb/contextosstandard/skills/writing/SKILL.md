# writing

## Purpose

基于内容策略，生成完整的初稿内容。支持 AI 写作 + 人工编辑混合流程。

## When To Use

在用户确认内容策略后（Human Approval），生成初稿。

## Input

```typescript
interface WritingInput {
  topic: string
  strategy: {
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
    tone: string
    estimatedWordCount: number
  }
  selectedAngle: {
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  }
  platform?: string
  tone?: string
  wordCount?: number
  persona?: {
    name: string
    description: string | null
  }
}
```

## Output

```typescript
interface WritingOutput {
  title: string
  content: string
  hook: string
  wordCount: number
  sections: Array<{
    section: string
    content: string
  }>
}
```

## Workflow

1. 接收内容策略
2. 按结构逐段生成内容
3. 确保情感弧线和语调
4. 生成完整初稿
5. 返回供用户编辑

## Tools

- AI Model (generateText / streamText)

## Constraints

- 不虚构数据和引用
- 保持语调一致
- 遵循策略结构
- 适合目标平台格式
- 如果提供了 persona，写作语气、用词风格、表达习惯必须符合人设的设定
- 观众视角表达：口播稿面向短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"（如"你有没有发现"改为"大家有没有发现"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套

## Version

1.2.0
