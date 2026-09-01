# expression-audit

## Purpose

判断文本是否存在明显的标准化表达问题，并输出结构化诊断。不负责全文改写，只负责发现问题、定位问题、解释问题、给出 rewrite instruction。

## When To Use

在 Writing 生成初稿后调用。如果 Audit 不通过（pass=false），则触发 expression-rewrite 进行定向修正。

## Input

```typescript
interface ExpressionAuditInput {
  draft: string
  title?: string
  expressionPlan?: ExpressionPlan
  strategy?: { title; keyArguments?; callToAction? }
  platform?: string
  persona?: { name; description }
}
```

## Output

```typescript
interface ExpressionAudit {
  version: '1.0'
  overallScore: number // 0-100
  dimensions: {
    naturalness: number
    voiceConsistency: number
    specificity: number
    rhythm: number
    thoughtAuthenticity: number
    emotionalAuthenticity: number
  }
  issues: Array<{
    id: string
    type: AuditIssueType
    severity: 'low' | 'medium' | 'high'
    location?: { paragraphIndex?; sentenceIndex?; quote? }
    diagnosis: string
    rewriteInstruction: string
  }>
  pass: boolean
}
```

## Audit Dimensions

- A. Formulaic Expression: 检测模板化语言（首先/其次/最后、值得注意的是等）
- B. Generic Abstraction: 检测抽象、空洞表达（很多人、我们每个人等）
- C. Sentence Uniformity: 检测句长和句法过于均匀
- D. Over Explanation: 检测每个观点都被解释到没有余地
- E. Artificial Emotion: 检测情绪曲线过于平滑或煽情
- F. Fake Specificity: 检测为了具体而凭空制造个人经历
- G. Voice Drift: 检测前后表达人格不一致
- H. Mechanical Transition: 检测过度程序化连接
- I. Thoughtless Transition: 检测观点间缺乏真实思维过渡

## Workflow

1. 接收初稿、ExpressionPlan、内容策略等上下文
2. 按六个维度评分（0-100）
3. 检测具体的 issues，定位到段落/句子
4. 为每个 issue 生成 rewriteInstruction
5. 判断是否 pass（overallScore >= threshold 且无 high severity issues）

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 不负责改写全文，只输出诊断
- 词语本身不能直接判定"AI"（如"其实""但是"可以是自然的人类词汇）
- 判断应同时考虑频率、位置、连续出现、上下文、结构、Persona、平台
- Audit 失败应降级，跳过 Rewrite，不阻塞后续流程

## Version

1.0.0
