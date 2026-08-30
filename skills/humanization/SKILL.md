# humanization

## Purpose

检测并消除 AI 生成内容中的"AI 味"，让内容读起来像真实作者写的，而非 AI 产出的。

## When To Use

在 writing skill 生成初稿后、evaluation 之前调用。也可在 evaluation 之后根据 AI Style Score 再次调用。

## Input

```typescript
interface HumanizationInput {
  content: string
  title?: string
  platform?: string
  tone?: string
}
```

## Output

```typescript
interface HumanizationOutput {
  content: string
  title: string
  changes: Array<{
    original: string
    revised: string
    reason: string
    type: 'template' | 'empty' | 'parallel' | 'summary' | 'aivocab' | 'connector' | 'emostack' | 'quotebomb'
  }>
  issues: Array<{
    type: string
    description: string
    severity: 'high' | 'medium' | 'low'
  }>
  aiStyleScore: number
  humanizedScore: number
}
```

## Workflow

1. 接收初稿内容
2. 调用 LLM 进行 AI 味检测和改写
3. 识别：模板化表达、空洞升华、过度排比、过度总结、AI 高频词、机械连接词、情绪堆砌、金句堆砌
4. 逐处改写为自然表达
5. 返回改写后内容 + 变更清单 + 评分

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 保持原文核心观点不变
- 不增加或删除实质性内容
- 评分范围 0-100
- aiStyleScore 越低越好（AI 味越少）
- humanizedScore 越高越好（真实作者感越强）
- 共享约束（与 writing、refine 一致，定义在 `src/lib/ai/shared-prompts.ts`）：
  - 观众视角表达：口播稿面向短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"（如"你有没有发现"改为"大家有没有发现"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套
  - 人名脱敏：文案中涉及真实人名时，不要使用全名，以"姓+某"的模式代替（如"张三"改为"张某"，"李四"改为"李某"，"王某某"改为"王某"）。公众人物、历史人物、名人等广为人知的人物可保留全名，但涉及负面描述或争议事件时应使用脱敏处理

## Version

1.2.0
