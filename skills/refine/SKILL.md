# refine

## Purpose

对初稿进行二次精修，包含局部调整（通过提示词进行局部修改）、黄金三秒钩子选择、短视频标题选定、结构化问题修复（issue_fix）和去 AI 味（humanize）。不改变总体内容方向。

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
  mode:
    | 'tone_change'           // 局部调整
    | 'hook_select'           // 黄金三秒钩子候选
    | 'title_select'          // 短视频标题候选
    | 'hook_and_title_select' // 同时生成钩子和标题（高效模式）
    | 'issue_fix'             // 结构化问题修复（P0.3.9.1）
    | 'humanize'              // 去 AI 味（P0.3.9.1）

  // 局部调整：指定局部修改提示词
  toneChange?: {
    newTone: string
  }

  // 黄金三秒钩子：从候选中选择
  hookSelect?: {
    candidates: string[]
    selectedIndex: number
  }

  // 标题选定：从候选中选择
  titleSelect?: {
    candidates: string[]
    selectedIndex: number
  }

  // 上下文信息
  platform?: string
  topic?: string
  selectedAngleTitle?: string

  // ── P0.3.9.1 New optional structured contexts ──

  // 评测上下文（issue_fix 模式推荐）
  evaluationContext?: {
    suggestions: Array<{
      id?: string
      section: string
      issue: string
      suggestion: string
      priority: 'high' | 'medium' | 'low'
    }>
    weaknesses: string[]
    scores?: {
      emotionalImpact?: number
      logicalClarity?: number
      novelty?: number
      readability?: number
      utility?: number
      platformFit?: number
    }
  }

  // 风险上下文（约束 Refine 不能引入风险）
  riskContext?: {
    overallRiskLevel?: 'safe' | 'low' | 'medium' | 'high'
    risks: Array<{
      id?: string
      category: string
      description?: string
      suggestion?: string
      severity?: 'high' | 'medium' | 'low'
    }>
  }

  // 已审批策略（Refine 不可破坏的约束）
  approvedStrategy?: {
    title?: string
    keyArguments?: string[]
    emotionalArc?: {
      start?: string
      middle?: string
      end?: string
    }
    callToAction?: string
    tone?: string
    selectedAngleTitle?: string
  }

  // 创作者人设（humanize 模式推荐）
  persona?: string
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
    type:
      | 'hook_replaced'
      | 'title_replaced'
      | 'tone_change'
      | 'candidates_generated'
      | 'hook_generated'
      | 'title_generated'
      | 'issue_fix'
      | 'humanization'
    original: string
    revised: string
    reason: string
    linkedIssueId?: string    // P0.3.9.1: 关联评估问题 ID
    confidence?: number        // P0.3.9.1: 修改置信度 0-1
  }>
  hookCandidates?: string[]
  titleCandidates?: string[]
  summary: string

  // ── P0.3.9.1 New optional output fields ──
  resolvedIssues?: Array<{
    issueId: string
    resolution: string
    changeId?: string
  }>
  unresolvedIssues?: Array<{
    issueId: string
    reason: string
    suggestion: string
  }>
  preservedElements?: Array<{
    element: string
    reason: string
  }>
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

### issue_fix 模式（P0.3.9.1 新增）
1. 接收结构化评测反馈（evaluation suggestions + weaknesses + scores）
2. 结合风险约束（riskContext）和已审批策略（approvedStrategy）
3. 仅修复指定问题，不破坏已批准策略
4. 输出 resolvedIssues / unresolvedIssues / preservedElements

### humanize 模式（P0.3.9.1 新增）
1. 识别 AI 特征表达（模板句式、空洞排比、AI 词汇等）
2. 在保留核心信息的前提下重述为自然表达
3. 返回每条 humanization 修改到 changes 中

## Tools

- AI Model (generateText + JSON extraction / generateObject)

## Constraints

- 不改变总体内容方向和核心观点
- 保持策略中的核心论点不变
- 适合目标平台格式
- 评分范围 0-100
- 标题和钩子要适合短视频平台（如抖音）
- 黄金三秒钩子必须在3秒内抓住注意力
- issue_fix 模式：不破坏已批准的 keyArguments / emotionalArc / callToAction
- issue_fix 模式：不引入新的事实或数据
- humanize 模式：保留核心信息不变，不引入新内容
- 共享约束（与 writing、humanization 一致，定义在 `src/lib/ai/shared-prompts.ts`）：
  - 观众视角表达：口播稿面向短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"（如"你有没有发现"改为"大家有没有发现"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套
  - 人名脱敏：文案中涉及真实人名时，不要使用全名，以"姓+某"的模式代替（如"张三"改为"张某"，"李四"改为"李某"，"王某某"改为"王某"）。公众人物、历史人物、名人等广为人知的人物可保留全名，但涉及负面描述或争议事件时应使用脱敏处理

## Backward Compatibility

P0.3.9.1 fully preserves backward compatibility:
- All existing modes (`tone_change`, `hook_select`, `title_select`, `hook_and_title_select`) work identically
- All new fields (`evaluationContext`, `riskContext`, `approvedStrategy`, `persona`, `resolvedIssues`, `unresolvedIssues`, `preservedElements`) are **optional**
- Old requests without new fields continue to succeed
- The `useRefine` hook type accepts the extended contract but doesn't require new fields

## Version

2.0.0
