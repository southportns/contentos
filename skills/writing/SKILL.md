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

- 不虚构数据和引用，生成的内容不违背事实
- 保持内容的语调一致
- 遵循策略结构
- 适合目标平台格式
- 文案的核心结构是钩子 → 痛点 → 干货 → 信任 → 行动号召五段式，本质是在 5 秒内阻止划走,增强完播率在前 10 秒给出留下来的理由、在中段交付价值、在结尾撬动互动数据
- 5秒完播率：直击痛点、切入主题，强调价值，在3秒内给观众看下去的理由。从“我的观点、我”的经验转变成对观众有用的方法和建议。例：如果你和我一样……千万不要…，因为……
引起目标用户的共鸣，把个人经历转化为用户价值。“我”的经历可以给用户带来什么价值（帮助、启发）例：我之前干…的时候，就发现…，今天我告诉你是怎么做的。
- 通用写作PREP公式：观点（point）→ 原因（reason）→ 案例（example）→ 观点（point），如介绍一部电影，可以先给出观点（这部电影值得一看），再给出原因（剧情紧凑、演员演技精湛），然后举例说明（某个经典场景或台词，或个人经历），最后再次强调观点（总之，这部电影不容错过）
- 口播文案公式让LLM通过上下文自行选定其中最为适配的一项：
 1.钩子开头+塑造期待+解决方案+结尾
 2.现象+危害+原因+解决办法
 3.炸裂式开头+人设信息+高密度的信息盘+互动式结尾
 4.积极结果+获得感+方案+互动式结尾
 5.金句+佐证+金句+佐证
 6.行业揭秘+塑造期待+解决方案
 7.利益传递+强化期待+解决办法+结尾
 8.事实+个人感受+发现问题+引出观点+讲故事+总结观点
- 如果提供了 persona，写作语气、用词风格、表达习惯必须符合人设的设定
- 共享约束（与 humanization、refine 一致，定义在 `src/lib/ai/shared-prompts.ts`）：
  - 观众视角表达：口播稿面向短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"（如"你有没有发现"改为"大家有没有发现"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套
  - 人名脱敏：文案中涉及真实人名时，不要使用全名，以"姓+某"的模式代替（如"张三"改为"张某"，"李四"改为"李某"，"王某某"改为"王某"）。公众人物、历史人物、名人等广为人知的人物可保留全名，但涉及负面描述或争议事件时应使用脱敏处理

## Version

1.4.0
