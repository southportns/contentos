# refine

## Purpose

对初稿进行二次精修，包含语气修改后重新生成口播稿、黄金三秒钩子选择、短视频标题选定。不改变总体内容方向。

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

  // 语气修改：指定新的语气/风格
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
1. 接收新语气要求
2. 保持核心观点和结构不变
3. 以新语气重新生成口播稿
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

## Version

1.0.0
