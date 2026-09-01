# expression-planning

## Purpose

根据内容策略、人设和情感弧线，生成一个"表达蓝图"（ExpressionPlan），决定作者如何思考、如何推进情绪、如何使用节奏和具体性。不生成最终文案。

## When To Use

在 Content Strategy 完成后、Writing 之前调用。将"说什么"转换为"怎么说"。

## Input

```typescript
interface ExpressionPlanningInput {
  topic: string
  selectedAngle: {
    title: string
    angle: string
    targetEmotion?: string
    keyPoints?: string[]
  }
  strategy: {
    title: string
    hook?: string
    callToAction?: string
    tone?: string
    emotionalArc?: { start: string; middle: string; end: string }
    keyArguments?: string[]
  }
  platform?: string
  contentType?: string
  persona?: { name: string; description: string | null }
  emotionArc?: { start: string; middle: string; end: string }
}
```

## Output

```typescript
interface ExpressionPlan {
  version: '1.0'
  speaker: { role?; relationshipToAudience?; authority?; emotionalDistance? }
  thoughtPath: Array<{ step; mode; purpose }>
  emotionCurve: Array<{ stage; emotion; intensity }>
  rhythm: { sentenceVariance; paragraphVariance; shortSentencePreference; pauseFrequency }
  expression: { oralness; specificity; reflection; imperfectionTolerance }
  opening: { mode; instruction }
  conclusion: { mode; instruction }
  constraints: { mustPreserve[]; avoidPatterns[]; truthConstraints[] }
}
```

## Workflow

1. 接收内容策略、角度、人设等上下文
2. 分析"谁在说"（speaker）、"和读者什么关系"
3. 设计思维路径（thoughtPath），决定从哪里开始想、经历哪些阶段
4. 设计情绪曲线（emotionCurve），标记情绪变化节点
5. 设定节奏参数（rhythm）
6. 设定表达特征（expression）
7. 设计开头模式（opening）和结尾模式（conclusion）
8. 设定真实约束（constraints），包括禁止伪造的经历
9. 输出 ExpressionPlan JSON

## Tools

- AI Model (generateText + JSON extraction)

## Constraints

- 不输出完整文章，只输出表达蓝图
- 不伪造作者真实经历
- truthConstraints 必须包含禁止伪造经历的约束
- Thought path 不要求机械使用所有 pattern
- expression-planning 失败应降级，不阻塞写作流程

## Version

1.0.0
