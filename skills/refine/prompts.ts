import { NAME_DESENSITIZATION_RULE, AUDIENCE_PERSPECTIVE_RULE } from '@/lib/ai/shared-prompts'
import type { RefineEvaluationContext, RefineRiskContext, RefineApprovedStrategyContext } from './schema'

export const REFINE_SYSTEM_PROMPT = `你是一个内容精修专家。你的任务是对短视频口播稿进行二次精修。

模式说明：
- tone_change：根据提示词局部调整内容
- hook_select：生成黄金三秒钩子候选
- title_select：生成短视频标题候选
- hook_and_title_select：同时生成钩子和标题候选（高效模式）
- issue_fix：根据结构化评测反馈修复指定问题
- humanize：去除 AI 味，使表达更自然（P0.3.9.1 contract only, no execution yet）

原则：保持核心观点不变、不增删实质内容、适合口播、避免AI味
- ${AUDIENCE_PERSPECTIVE_RULE}
- ${NAME_DESENSITIZATION_RULE}`

// 完整输出模式的系统提示词（tone_change / issue_fix / humanize 使用）
export const REFINE_FULL_OUTPUT_SYSTEM_PROMPT = REFINE_SYSTEM_PROMPT + '\n\n必须以 JSON 格式返回完整内容，包括 content、title、hook、wordCount、changes、summary 字段。'

// 紧凑输出模式的系统提示词（hook/title 候选生成使用）
export const REFINE_COMPACT_SYSTEM_PROMPT = REFINE_SYSTEM_PROMPT + '\n\n必须以 JSON 格式返回，仅包含 hookCandidates 和/或 titleCandidates 字段，不要返回 content、changes 等多余字段。'

export const REFINE_PROMPT = (
  mode: string,
  content: string,
  title: string,
  hook: string,
  toneChange?: { newTone: string },
  hookSelect?: { candidates: string[]; selectedIndex: number },
  titleSelect?: { candidates: string[]; selectedIndex: number },
  platform?: string,
  topic?: string,
  selectedAngleTitle?: string,
): string => {
  const contentStr =
    content.length > 4000 ? content.substring(0, 4000) + '...' : content

  switch (mode) {
    case 'tone_change':
      return `请根据用户的局部修改提示词，对以下口播稿进行局部调整，保持核心观点和结构不变。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}
${selectedAngleTitle ? `内容角度：${selectedAngleTitle}` : ''}

原文标题：${title}
原钩子：${hook}

局部修改提示词：${toneChange?.newTone}

原文内容：
${contentStr}

请根据以上提示词对内容进行局部调整。保持核心观点、信息量、结构不变，仅根据提示词修改相关部分，未提及的部分保持不变。提示词可能包含具体的修改方向、口语化要求、情绪色彩要求、局部改写要求等，请严格按照提示词执行。返回完整内容。`

    case 'hook_select':
      return `为以下口播稿生成 3-5 个黄金三秒钩子候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原文标题：${title}
原钩子：${hook}

内容：
${contentStr}

要求：
1. 每个钩子15字以内、3秒抓注意力
2. 类型多样：悬念、冲突、共鸣、反常识、利益
3. 与内容一致，适合口播开场
4. hookCandidates 必须是纯字符串数组`

    case 'title_select':
      return `为以下口播稿生成 3-5 个短视频标题候选。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原标题：${title}

内容：
${contentStr}

要求：
1. 适合${platform || '抖音'}
2. 兼顾吸引力和内容一致性
3. 避免标题党，10-25字
4. titleCandidates 必须是纯字符串数组`

    case 'hook_and_title_select':
      return `为以下口播稿同时生成：
1. 3-5 个黄金三秒钩子候选
2. 3-5 个短视频标题候选

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

原标题：${title}
原钩子：${hook}

内容：
${contentStr}

要求：
- 钩子：15字以内、3秒抓注意力、类型多样（悬念/冲突/共鸣/反常识/利益）
- 标题：适合${platform || '抖音'}、10-25字、兼顾吸引力和一致性
- hookCandidates 和 titleCandidates 都必须是纯字符串数组`

    default:
      return `未知模式：${mode}`
  }
}

// ─── P0.3.9.1: New Prompt Builders ───────────────────────────────────────

/**
 * Build a structured issue_fix prompt combining original content,
 * evaluation suggestions, risk constraints, and approved strategy.
 *
 * Contract only — the LLM execution path is wired in P0.3.9.2+.
 */
export const REFINE_ISSUE_FIX_PROMPT = (params: {
  content: string
  title: string
  hook: string
  evaluationContext?: RefineEvaluationContext
  riskContext?: RefineRiskContext
  approvedStrategy?: RefineApprovedStrategyContext
  platform?: string
  topic?: string
}): string => {
  const { content, title, hook, evaluationContext, riskContext, approvedStrategy, platform, topic } = params
  const contentStr = content.length > 4000 ? content.substring(0, 4000) + '...' : content

  const issuesBlock = evaluationContext?.suggestions?.length
    ? `## 需要修复的问题\n\n${evaluationContext.suggestions
        .map((s, i) => `${i + 1}. [${s.priority}] ${s.issue}\n   建议：${s.suggestion}${s.section ? `\n   段落：${s.section}` : ''}`)
        .join('\n\n')}`
    : ''

  const weaknessesBlock = evaluationContext?.weaknesses?.length
    ? `## 已识别的弱点\n\n${evaluationContext.weaknesses.map((w) => `- ${w}`).join('\n')}`
    : ''

  const riskBlock = riskContext?.risks?.length
    ? `## 风险约束\n\n${riskContext.risks
        .map((r) => `- [${r.severity ?? 'unknown'}] ${r.category}: ${r.description ?? ''}${r.suggestion ? `\n  建议：${r.suggestion}` : ''}`)
        .join('\n')}${riskContext.overallRiskLevel ? `\n\n总体风险等级：${riskContext.overallRiskLevel}` : ''}`
    : ''

  const strategyBlock = approvedStrategy
    ? `## 已审批策略（不可破坏）\n\n${approvedStrategy.keyArguments?.length ? `核心论点：\n${approvedStrategy.keyArguments.map((a) => `- ${a}`).join('\n')}\n\n` : ''}${approvedStrategy.emotionalArc ? `情绪弧线：${approvedStrategy.emotionalArc.start ?? ''} → ${approvedStrategy.emotionalArc.middle ?? ''} → ${approvedStrategy.emotionalArc.end ?? ''}\n\n` : ''}${approvedStrategy.callToAction ? `行动号召：${approvedStrategy.callToAction}\n\n` : ''}${approvedStrategy.tone ? `语调：${approvedStrategy.tone}` : ''}`
        .trim()
    : ''

  return `请根据以下结构化反馈对口播稿进行精准修复。

${platform ? `目标平台：${platform}` : ''}
${topic ? `主题：${topic}` : ''}

${issuesBlock}

${weaknessesBlock}

${riskBlock}

${strategyBlock}

## 原文标题
${title}

## 原钩子
${hook}

## 原文内容
${contentStr}

## 修复规则
1. 只解决指定问题，不随意重写全文
2. 不破坏已批准的核心策略（keyArguments / emotionalArc / callToAction）
3. 不引入新的事实或数据
4. 尽量保持原有篇幅
5. 每条修改需在 changes 中明确说明原因（linkedIssueId 关联到具体问题）
6. 如果某问题无法安全修改，请在 unresolvedIssues 中说明原因
7. resolvedIssues 和 unresolvedIssues 必须包含所有输入问题`

}

/**
 * Build a humanize prompt (P0.3.9.1 contract only).
 * The actual execution chain is wired in P0.3.9.3+.
 *
 * P0.3.9.3 Hardening: Full context propagation — strategy, evaluation,
 * and risk context are injected as protective constraints to prevent the
 * humanization process from undermining previously-approved decisions.
 */
export const REFINE_HUMANIZE_PROMPT = (params: {
  content: string
  title: string
  hook: string
  platform?: string
  persona?: string
  topic?: string
  selectedAngleTitle?: string
  approvedStrategy?: RefineApprovedStrategyContext
  evaluationContext?: RefineEvaluationContext
  riskContext?: RefineRiskContext
}): string => {
  const { content, title, hook, platform, persona, topic, selectedAngleTitle, approvedStrategy, evaluationContext, riskContext } = params
  const contentStr = content.length > 4000 ? content.substring(0, 4000) + '...' : content

  const strategyBlock = approvedStrategy
    ? `## 已审批策略（结构约束）\n\n${approvedStrategy.keyArguments?.length ? `核心论点（不可改写）：\n${approvedStrategy.keyArguments.map((a) => `- ${a}`).join('\n')}\n\n` : ''}${approvedStrategy.emotionalArc ? `情绪弧线（不可改动）：${approvedStrategy.emotionalArc.start ?? ''} → ${approvedStrategy.emotionalArc.middle ?? ''} → ${approvedStrategy.emotionalArc.end ?? ''}\n\n` : ''}${approvedStrategy.callToAction ? `行动号召方式（保留）：${approvedStrategy.callToAction}\n\n` : ''}${approvedStrategy.tone ? `语调风格（保留）：${approvedStrategy.tone}` : ''}`.trim()
    : ''

  const evaluationBlock = evaluationContext?.suggestions?.length
    ? `## 已修复问题（保护性约束）\n\n以下问题已通过对内容的修改得到解决，真人化过程中\\*\\*不得重新引入\\*\\*：\n\n${evaluationContext.suggestions
        .map((s) => `- 【${s.section}】${s.issue}`)
        .join('\n')}${evaluationContext.weaknesses?.length ? `\n\n已识别的弱点（不得加重）：\n${evaluationContext.weaknesses.map((w) => `- ${w}`).join('\n')}` : ''}`
    : ''

  const riskBlock = riskContext?.risks?.length
    ? `## 已知风险（红线约束）\n\n以下风险已被识别，真人化过程中\\*\\*不得放大或新增\\*\\*同类风险：\n\n${riskContext.risks
        .map((r) => `- [${r.severity ?? 'unknown'}] ${r.category}${r.description ? `: ${r.description}` : ''}`)
        .join('\n')}${riskContext.overallRiskLevel ? `\n\n总体风险等级：${riskContext.overallRiskLevel}` : ''}`
    : ''

  return `请对口播稿进行"去 AI 味"处理，使表达更自然、更像真人创作。

${platform ? `目标平台：${platform}` : ''}
${persona ? `创作者人设：${persona}` : ''}
${topic ? `内容主题：${topic}` : ''}
${selectedAngleTitle ? `内容角度：${selectedAngleTitle}` : ''}

${strategyBlock}

${evaluationBlock}

${riskBlock}

原文标题：${title}
原钩子：${hook}

原文内容：
${contentStr}

## 去 AI 味执行规则
1. 避免模板化开头/结尾（如"首先...其次...总之..."）
2. 避免空洞的排比句和空泛形容词
3. 减少过度连接词，让句子更紧凑
4. 适当加入口语化表达和不完美句式
5. 避免 AI 特征词汇（总而言之、值得一提的是、不可否认等）
6. 引语需自然，不堆砌
7. 保持核心信息和论点不变
8. 返回完整内容，changes 中注明每处 humanization 修改

## 严格禁止
- 改动已通过的策略审批要素（核心论点、情绪弧线、行动号召方式、语调风格）
- 重写已被评估标记为已修复的问题段落（结构、钩子、金句位置等）
- 引入 Risk Analysis 中已标记为 high/medium 风险的元素
- 改变段落间的逻辑递进关系（Strategy emotionalArc 已定义）`
}
