import { AUDIENCE_PERSPECTIVE_RULE, NAME_DESENSITIZATION_RULE } from '@/lib/ai/shared-prompts'
import type { ExpressionRewriteInput } from './schema'
import type { ExpressionAudit, ExpressionPlan } from '@/lib/expression/types'

export const EXPRESSION_REWRITE_SYSTEM_PROMPT = `你是一个表达修正专家。你的任务是根据 Expression Audit 的问题诊断，只修改指定范围的表达，不做全文重写。

核心规则：
1. 保留核心观点。
2. 保留事实。
3. 保留用户提供的真实经历。
4. 只修改被 Audit 指出的区域。
5. 不要无理由重写整篇文章。
6. 不要增加未经证实的信息。
7. 不要添加虚假的第一人称经历。
8. 不要为了自然而故意写错字。
9. 不要为了自然而堆叠"其实、然后、就是、说实话"等口头禅。
10. 不要把一篇成熟自然的文本重新改坏。

Rewrite 策略（根据 issue type 选择）：
- formulaic → 替换或删除模板化连接，不改变语义
- generic → 将抽象表达改为具体观察，但不虚构事实
- abstract → 优先具体化概念、动作、场景、结果（使用"可泛化但具体"的场景）
- uniform_rhythm → 调整句子和段落长度分布
- over_structured → 删除不必要的小结和显式连接
- over_explained → 删除重复解释，保留核心意思
- emotion_flat → 根据已有内容调整情绪表达，不凭空制造经历
- voice_drift → 回到 ExpressionPlan / Persona
- thoughtless_transition → 增加自然思维推进或改用隐性衔接
- fake_specificity → 删除伪具体细节，恢复可信的泛化表达
- repetitive_pattern → 替换重复的模式为多样化表达
- predictable_structure → 打破公式化推进，重新组织段落顺序或结构
- conclusion_cliche → 将高频结尾模板替换为 scene_return（回到具体场景）/ self_aware（自嘲式）/ quiet_statement（轻描淡写）
- emotion_shift_excessive → 减少情绪突转频次至 30%-40%，将部分突转为渐变过渡

【P0.1.5】经历真实性约束（最高优先级）：
- 禁止添加时间、地点、人名、具体数字等可验证细节
- 可以使用的模糊化表达："有段时间"、"记得那次"、"那天下午"
- 感官细节允许（如"盯着屏幕发呆"、"手在抖"），但必须是可泛化的场景
- 如果原文没有明显虚构，不要过度修改，破坏已有的自然度

${AUDIENCE_PERSPECTIVE_RULE}
${NAME_DESENSITIZATION_RULE}`

export const EXPRESSION_REWRITE_PROMPT = (
  input: ExpressionRewriteInput,
): string => {
  const audit = input.audit as ExpressionAudit
  const draftPreview =
    input.draft.length > 6000 ? input.draft.substring(0, 6000) + '...' : input.draft

  const issuesStr = audit.issues
    .map(
      (issue) =>
        `  - ID: ${issue.id}
    类型: ${issue.type}
    严重度: ${issue.severity}
    位置: ${issue.location?.paragraphIndex ?? 'N/A'}段 / ${issue.location?.sentenceIndex ?? 'N/A'}句
    引用: ${issue.location?.quote || 'N/A'}
    诊断: ${issue.diagnosis}
    修改指令: ${issue.rewriteInstruction}`,
    )
    .join('\n\n')

  const planStr = input.expressionPlan
    ? formatExpressionPlanBrief(input.expressionPlan as ExpressionPlan)
    : '未提供 ExpressionPlan'

  const strategyStr = input.strategy
    ? `
内容策略：
- 标题：${input.strategy.title}
${input.strategy.keyArguments ? `- 核心论点：${input.strategy.keyArguments.join('、')}` : ''}`
    : ''

  return `请根据以下 Audit 诊断，对初稿进行定向修正：

${input.title ? `标题：${input.title}` : ''}
${input.platform ? `目标平台：${input.platform}` : ''}
${strategyStr}

表达蓝图：
${planStr}

Audit 结果：
- overallScore: ${audit.overallScore}
- pass: ${audit.pass}
- 维度评分: naturalness=${audit.dimensions.naturalness}, voiceConsistency=${audit.dimensions.voiceConsistency}, specificity=${audit.dimensions.specificity}, rhythm=${audit.dimensions.rhythm}, thoughtAuthenticity=${audit.dimensions.thoughtAuthenticity}, emotionalAuthenticity=${audit.dimensions.emotionalAuthenticity}

Issues:
${issuesStr}

内容初稿：
${draftPreview}

请只修改被 Audit 指出的区域，不要重写全文。返回修改后的完整内容，以及每个修改的详细记录（changedSections）。
changedSections 中的每个条目需要：
- location: 修改位置描述（如"第2段"）
- issueId: 对应的 Audit issue ID
- original: 原文片段
- revised: 修改后的片段
- reason: 修改原因`
}

function formatExpressionPlanBrief(plan: ExpressionPlan): string {
  const thoughtPathStr = plan.thoughtPath
    .map((t) => `  ${t.step}. ${t.mode}: ${t.purpose}`)
    .join('\n')

  return `Speaker: ${plan.speaker.role || 'N/A'}
Thought Path:
${thoughtPathStr}
Opening: ${plan.opening.mode} — ${plan.opening.instruction}
Conclusion: ${plan.conclusion.mode} — ${plan.conclusion.instruction}
Constraints:
  mustPreserve: ${plan.constraints.mustPreserve.join('、')}
  truthConstraints: ${plan.constraints.truthConstraints.join('、')}`
}
