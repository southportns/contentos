import { AUDIENCE_PERSPECTIVE_RULE, NAME_DESENSITIZATION_RULE } from '@/lib/ai/shared-prompts'
import type { ExpressionPlanningInput } from './schema'

export const EXPRESSION_PLANNING_SYSTEM_PROMPT = `你是一个表达规划专家。你的任务是根据内容策略，生成一个"表达蓝图"（ExpressionPlan），决定作者如何思考、如何推进情绪、如何使用节奏和具体性。

核心原则：
1. 你不生成最终文案，只输出表达蓝图 JSON。
2. 内容策略决定"说什么"，表达蓝图决定"怎么说"。
3. 不要让思维路径机械使用所有 thought pattern，只选择适合的。
4. 禁止伪造作者真实经历。
5. truthConstraints 必须包含禁止伪造经历的约束。

思维路径（thoughtPath）可用的 mode：
- observation: 从具体现象、场景或细节开始
- memory_trigger: 由一个具体记忆触发（必须有真实来源，禁止伪造）
- association: 从一个事物自然联想到另一个
- question: 以真实疑问开始
- contradiction: 发现两个看似矛盾的事实
- realization: 观察后形成新的理解
- reflection: 事后回看产生新理解
- self_correction: 主动修正自己的判断
- digression: 暂时偏离主线
- return: 在偏离后自然拉回

开头模式（opening.mode）：
- observation / question / scene / contradiction / direct_statement / personal_reflection

结尾模式（conclusion.mode）：
- reflection / open_ended / echo / question / direct_takeaway

节奏参数（rhythm）：所有值为 low / medium / high
- sentenceVariance: 句长变化程度
- paragraphVariance: 段落长度变化
- shortSentencePreference: 短句偏好
- pauseFrequency: 停顿频率

表达特征（expression）：所有值为 low / medium / high
- oralness: 口语密度
- specificity: 具体性偏好
- reflection: 反思深度
- imperfectionTolerance: 允许表达不完美的程度

speaker 字段说明：
- role: 作者的身份角色（如"一个经历过的普通人"）
- relationshipToAudience: 和读者的关系（如"朋友"、"同行"）
- authority: 权威感 low / medium / high
- emotionalDistance: 情感距离 close / medium / distant

${AUDIENCE_PERSPECTIVE_RULE}
${NAME_DESENSITIZATION_RULE}`

export const EXPRESSION_PLANNING_PROMPT = (
  input: ExpressionPlanningInput,
): string => {
  const emotionalArc = input.emotionArc || input.strategy.emotionalArc
  const arcStr = emotionalArc
    ? `${emotionalArc.start} → ${emotionalArc.middle} → ${emotionalArc.end}`
    : '未指定'

  const keyPointsStr =
    input.selectedAngle.keyPoints && input.selectedAngle.keyPoints.length > 0
      ? input.selectedAngle.keyPoints.join('、')
      : '未指定'

  const keyArgumentsStr =
    input.strategy.keyArguments && input.strategy.keyArguments.length > 0
      ? input.strategy.keyArguments.join('、')
      : '未指定'

  const personaStr = input.persona
    ? `
创作人设：
- 名称：${input.persona.name}
${input.persona.description ? `- 描述：${input.persona.description}` : ''}`
    : ''

  return `主题：${input.topic}

选定角度：${input.selectedAngle.title} — ${input.selectedAngle.angle}
${input.selectedAngle.targetEmotion ? `目标情绪：${input.selectedAngle.targetEmotion}` : ''}
关键要点：${keyPointsStr}

内容策略：
- 标题：${input.strategy.title}
${input.strategy.hook ? `- 钩子：${input.strategy.hook}` : ''}
${input.strategy.tone ? `- 语调：${input.strategy.tone}` : ''}
- 情感弧线：${arcStr}
${input.strategy.callToAction ? `- 行动号召：${input.strategy.callToAction}` : ''}
- 核心论点：${keyArgumentsStr}

${input.platform ? `目标平台：${input.platform}` : ''}
${input.contentType ? `内容类型：${input.contentType}` : ''}
${personaStr}

请根据以上信息，生成一个 ExpressionPlan JSON。要求：
1. 设计 4-7 个 thoughtPath 步骤，选择最适合的 mode
2. 设计 3-5 个 emotionCurve 节点
3. 根据平台和内容类型设置合适的 rhythm 和 expression 参数
4. constraints.truthConstraints 必须包含"禁止伪造作者真实经历"的约束
5. constraints.mustPreserve 必须包含内容策略的核心观点
6. constraints.avoidPatterns 列出需要避免的模板化表达模式`
}
