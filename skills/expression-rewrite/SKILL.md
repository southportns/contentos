# expression-rewrite

## Purpose

根据 Expression Audit 的问题诊断，只修改指定范围的表达，不做全文重写。

## When To Use

在 Expression Audit 不通过（pass=false）时调用。只修改 Audit 指出的区域。

## Input

```typescript
interface ExpressionRewriteInput {
  draft: string
  title?: string
  audit: ExpressionAudit
  expressionPlan?: ExpressionPlan
  strategy?: { title; keyArguments?; callToAction? }
  platform?: string
}
```

## Output

```typescript
interface ExpressionRewriteResult {
  version: '1.0'
  revisedContent: string
  revisedTitle?: string
  changedSections: Array<{
    location: string
    issueId: string
    original: string
    revised: string
    reason: string
  }>
  summary: string
}
```

## Rewrite Strategies

针对不同 issue type 使用不同策略：
- formulaic → 替换或删除模板化连接，不改变语义
- generic → 将抽象表达改为具体观察，但不虚构事实
- abstract → 优先具体化概念、动作、场景、结果
- uniform_rhythm → 调整句子和段落长度分布
- over_structured → 删除不必要的小结和显式连接
- over_explained → 删除重复解释，保留核心意思
- emotion_flat → 根据已有内容调整情绪表达，不凭空制造经历
- voice_drift → 回到 ExpressionPlan / Persona
- thoughtless_transition → 增加自然思维推进或改用隐性衔接
- fake_specificity → 删除伪具体细节，恢复可信的泛化表达

## Workflow

1. 接收初稿、Audit 结果、ExpressionPlan
2. 只针对 Audit 指出的 issues 进行局部修改
3. 每个修改记录 changedSections
4. 返回修改后的完整内容和变更清单

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 只修改被 Audit 指出的区域
- 不要无理由重写整篇文章
- 保留核心观点、事实和用户提供的真实经历
- 不要增加未经证实的信息
- 不要添加虚假的第一人称经历
- 不要为了自然而堆叠"其实、然后、就是、说实话"等口头禅
- Rewrite 失败保留原稿，不要把空字符串或半成品覆盖原稿
- ${'最大循环次数 = 1（P0.1 不做复杂多轮 loop）'}

## Version

1.0.0
