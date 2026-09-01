import { AUDIENCE_PERSPECTIVE_RULE, NAME_DESENSITIZATION_RULE } from '@/lib/ai/shared-prompts'
import type { ExpressionAuditInput } from './schema'
import type { ExpressionPlan } from '@/lib/expression/types'

export const EXPRESSION_AUDIT_SYSTEM_PROMPT = `你是一个表达审计专家。你的任务是判断文本是否存在明显的标准化表达问题，并输出结构化诊断。

你不负责改写全文，只负责：
1. 发现问题
2. 定位问题（段落、句子、引用原文）
3. 解释问题
4. 给出 rewrite instruction

审计维度（每项 0-100）：
- naturalness: 自然度。文本是否像标准化生成，还是像真实作者写的
- voiceConsistency: 声音一致性。前后表达人格是否一致
- specificity: 具体性。是否缺乏具体观察或有效信息
- rhythm: 节奏。句长和段落长度是否有自然变化
- thoughtAuthenticity: 思维真实性。观点之间是否存在自然的思维路径
- emotionalAuthenticity: 情感真实性。情绪变化是否机械
- structuralNaturalness: 结构自然度。文章是否组织得过于工整、完整、对称、可预测

structuralNaturalness 检查清单：
- 每段功能是否过于明显（如开头→问题→原因→方法→总结的公式化结构）
- 每段长度是否高度一致
- 每个观点是否都立即被解释
- 每个观点是否都立即被总结
- 每个转折是否都高度规律
- 结论是否出现过早
- 情绪曲线是否过于平滑
- 观点推进是否像公式
- 内容是否像"开头→问题→原因→方法→总结"

重要：structuralNaturalness 要区分"清晰结构"和"过度结构化"。
不要因为结构清晰就直接扣分。只有在结构过于工整、可预测、公式化时才扣分。

issue 类型（type）：
- formulaic: 模板化表达（首先/其次/最后、值得注意的是、归根结底等）
- generic: 抽象空泛表达（很多人、我们每个人、在这个时代等）
- abstract: 过度抽象，缺乏具体观察
- uniform_rhythm: 句长和句法过于均匀
- over_structured: 段落结构过于整齐，每段都有小结
- over_explained: 每个观点都被解释到没有余地
- emotion_flat: 情绪曲线过于平滑或煽情
- voice_drift: 前后表达人格不一致
- thoughtless_transition: 观点间缺乏真实思维过渡
- fake_specificity: 为了具体而凭空制造个人经历
- repetitive_pattern: 重复的模式
- predictable_structure: 内容推进过于可预测，像公式（开头→问题→原因→方法→总结）

重要判断原则：
- 词语本身不能直接判定为"AI"。例如"其实""但是""真正"都可以是自然的人类词汇。
- 判断应同时考虑：频率、位置、连续出现、上下文、结构、Persona、平台。
- 不要要求所有文章都必须高变化，适度的结构化是正常的。
- 模板化表达不是绝对禁用，只有在频繁、机械或与上下文不匹配时才报告。

${AUDIENCE_PERSPECTIVE_RULE}
${NAME_DESENSITIZATION_RULE}`

export const EXPRESSION_AUDIT_PROMPT = (
  input: ExpressionAuditInput,
): string => {
  const draftPreview =
    input.draft.length > 6000 ? input.draft.substring(0, 6000) + '...' : input.draft

  const planStr = input.expressionPlan
    ? formatExpressionPlan(input.expressionPlan as ExpressionPlan)
    : '未提供 ExpressionPlan'

  const strategyStr = input.strategy
    ? `
内容策略：
- 标题：${input.strategy.title}
${input.strategy.keyArguments ? `- 核心论点：${input.strategy.keyArguments.join('、')}` : ''}
${input.strategy.callToAction ? `- 行动号召：${input.strategy.callToAction}` : ''}`
    : ''

  const personaStr = input.persona
    ? `
创作人设：
- 名称：${input.persona.name}
${input.persona.description ? `- 描述：${input.persona.description}` : ''}`
    : ''

  const audienceStr = input.audience
    ? `
受众洞察：${input.audience}`
    : ''

  return `请审计以下内容：

${input.title ? `标题：${input.title}` : ''}
${input.platform ? `目标平台：${input.platform}` : ''}
${strategyStr}
${personaStr}${audienceStr}

表达蓝图：
${planStr}

内容初稿：
${draftPreview}

请按维度评分（0-100），并检测具体的 issues。每个 issue 必须包含：
- id: 唯一标识（如 "issue-1"）
- type: issue 类型
- severity: low / medium / high
- location: { paragraphIndex?, sentenceIndex?, quote? }
- diagnosis: 问题描述
- rewriteInstruction: 修改指令（告诉 rewrite skill 应该怎么改）

pass 判断标准：
- overallScore >= 70 且无 high severity issues → pass = true
- 否则 → pass = false`
}

function formatExpressionPlan(plan: ExpressionPlan): string {
  const thoughtPathStr = plan.thoughtPath
    .map((t) => `  ${t.step}. ${t.mode}: ${t.purpose}`)
    .join('\n')

  const emotionStr = plan.emotionCurve
    .map((e) => `  ${e.stage}: ${e.emotion} (${e.intensity})`)
    .join('\n')

  return `Speaker: ${plan.speaker.role || 'N/A'} / ${plan.speaker.relationshipToAudience || 'N/A'}
Thought Path:
${thoughtPathStr}
Emotion Curve:
${emotionStr}
Rhythm: sentenceVariance=${plan.rhythm.sentenceVariance}, paragraphVariance=${plan.rhythm.paragraphVariance}
Expression: oralness=${plan.expression.oralness}, specificity=${plan.expression.specificity}
Opening: ${plan.opening.mode} — ${plan.opening.instruction}
Conclusion: ${plan.conclusion.mode} — ${plan.conclusion.instruction}
Constraints:
  mustPreserve: ${plan.constraints.mustPreserve.join('、')}
  avoidPatterns: ${plan.constraints.avoidPatterns.join('、')}
  truthConstraints: ${plan.constraints.truthConstraints.join('、')}`
}
