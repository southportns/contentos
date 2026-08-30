# refine

## Purpose

对初稿进行二次精修，包含局部调整（通过提示词进行局部修改）、黄金三秒钩子选择、短视频标题选定。不改变总体内容方向。

## When To Use

在 writing + evaluation 完成后、终稿输出前调用。用户需要对初稿进行精细调整时使用。

## Input

```typescript
interface RefineInput {
  // 原始初稿
  content: string
  title: string
  hook: string
  wordCount: number

  // 精修模式
  mode: 'tone_change' | 'hook_select' | 'title_select'

  // 局部调整：指定局部修改提示词
  toneChange?: {
    newTone: string
  }

  // 黄金三秒钩子：从原始内容中提取候选钩子
  hookSelect?: {
    candidates: string[]
    selectedIndex: number
  }

  // 标题选定：从候选标题中选择
  titleSelect?: {
    candidates: string[]
    selectedIndex: number
  }

  // 上下文信息
  platform?: string
  topic?: string
  selectedAngleTitle?: string
}
```

## Output

```typescript
interface RefineOutput {
  content: string
  title: string
  hook: string
  wordCount: number
  changes: Array<{
    type: string
    original: string
    revised: string
    reason: string
  }>
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary: string
}
```

## Workflow

### tone_change 模式
1. 接收局部修改提示词
2. 保持核心观点和结构不变
3. 仅根据提示词修改相关部分，未提及的部分保持不变
4. 返回完整内容和变更清单

### hook_select 模式
1. 分析原始内容
2. 生成 3-5 个黄金三秒钩子候选
3. 返回候选列表供用户选择
4. 用户选择后替换原始开头

### title_select 模式
1. 基于内容生成 3-5 个短视频标题候选
2. 返回候选列表供用户选择

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 不改变总体内容方向和核心观点
- 保持策略中的核心论点不变
- 适合目标平台格式
- 评分范围 0-100
- 标题和钩子要适合短视频平台（如抖音）
- 黄金三秒钩子必须在3秒内抓住注意力
- 共享约束（与 writing、humanization 一致，定义在 `src/lib/ai/shared-prompts.ts`）：
  - 观众视角表达：口播稿面向短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"（如"你有没有发现"改为"大家有没有发现"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套
  - 人名脱敏：文案中涉及真实人名时，不要使用全名，以"姓+某"的模式代替（如"张三"改为"张某"，"李四"改为"李某"，"王某某"改为"王某"）。公众人物、历史人物、名人等广为人知的人物可保留全名，但涉及负面描述或争议事件时应使用脱敏处理

## Version

1.2.0
