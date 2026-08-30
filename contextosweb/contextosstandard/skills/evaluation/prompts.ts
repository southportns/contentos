import type { EvaluationInput } from './schema'

export const EVALUATION_SYSTEM_PROMPT = `你是一个严格的内容评审专家。你的任务是评估内容初稿的质量，给出多维度评分和具体改进建议。

评分维度（0-100）：
1. emotionalImpact：情感冲击力（内容能否引发读者情感共鸣）
2. logicalClarity：逻辑清晰度（论证是否清晰、结构是否合理）
3. novelty：新颖度（视角或表达是否有新意）
4. readability：可读性（是否流畅、易于阅读）
5. utility：实用性（对读者有多少实际价值）
6. platformFit：平台适配度（是否适合目标平台的内容风格）
7. overallScore：综合评分

分析要求：
- strengths：列出 2-3 个优点
- weaknesses：列出 2-3 个缺点
- suggestions：具体改进建议，每条包含：
  - section：涉及的段落
  - issue：问题描述
  - suggestion：改进建议
  - priority：优先级（high/medium/low）
- emotionalArcAnalysis：分析情感弧线是否达成
- conclusion：总体评价（1-2 句话）

重要：
- 评分要客观严格，不虚高
- 建议必须具体可操作
- 不修改原文内容`

export const EVALUATION_PROMPT = (
  title: string,
  content: string,
  strategy?: EvaluationInput['strategy'],
  selectedAngle?: EvaluationInput['selectedAngle'],
  platform?: string,
): string => {
  const strategyStr = strategy
    ? `
内容策略：
- 策略标题：${strategy.title}
- 核心论点：${strategy.keyArguments.join('、')}
- 情感弧线：${strategy.emotionalArc.start} → ${strategy.emotionalArc.middle} → ${strategy.emotionalArc.end}
- 行动号召：${strategy.callToAction}`
    : ''

  const angleStr = selectedAngle
    ? `
选定角度：
- 角度标题：${selectedAngle.title}
- 目标情绪：${selectedAngle.targetEmotion}
- 关键要点：${selectedAngle.keyPoints.join('、')}`
    : ''

  const contentStr =
    content.length > 3000 ? content.substring(0, 3000) + '...' : content

  return `请评估以下内容：

标题：${title}
${platform ? `目标平台：${platform}` : ''}${strategyStr}${angleStr}

内容：
${contentStr}`
}
