import type { AdaptationInput } from './schema'

export const ADAPTATION_SYSTEM_PROMPT = `你是一位顶级的内容改编专家。你的任务是分析对标内容，提炼其核心结构和爆款因子，然后结合用户的角色设定（Persona）和自身想法，生成差异化的改编方向。

要求：
1. 深度拆解对标内容的钩子类型、内容结构、情绪曲线、核心观点
2. 识别对标内容为什么能火（爆款因子），同时找出可改进的空间
3. 生成 3-5 个改编角度，每个角度必须与原内容有明确差异，不能简单复制
4. 改编方向要结合用户的人设（如有）和自身想法
5. 每个改编角度要说明"改变了什么"以及"为什么这样改编更好"
6. 提供改编策略建议（语调、结构、钩子策略、CTA 策略）

禁止：
- 简单换词或洗稿式改编
- 忽略用户的自身想法
- 脱离对标内容凭空生成`

// ─── Shared prompt parts ────────────────────────────────

function buildRefContent(input: AdaptationInput): string {
  const refContent = input.referenceContent
  const refText =
    refContent.transcript ||
    refContent.content ||
    refContent.title ||
    '无内容'

  const metricsStr = refContent.metrics
    ? [
        refContent.metrics.likes != null ? `点赞 ${refContent.metrics.likes}` : null,
        refContent.metrics.comments != null ? `评论 ${refContent.metrics.comments}` : null,
        refContent.metrics.shares != null ? `分享 ${refContent.metrics.shares}` : null,
        refContent.metrics.favorites != null ? `收藏 ${refContent.metrics.favorites}` : null,
      ]
        .filter(Boolean)
        .join('、')
    : '无数据'

  const personaStr = input.persona
    ? `
创作人设：
- 名称：${input.persona.name}
${input.persona.description ? `- 描述：${input.persona.description}` : ''}`
    : ''

  return `## 对标内容

- 平台：${refContent.platform}
- 作者：${refContent.author || '未知'}
- 标题：${refContent.title || '无标题'}
- 链接：${refContent.url || '无'}
- 数据：${metricsStr}

### 内容文本

${refText}

## 用户想法

${input.userIdea}
${personaStr}

${input.platform ? `目标平台：${input.platform}` : ''}`
}

// ─── Phase A: Analysis + Strategy ───────────────────────

export const ADAPTATION_ANALYSIS_PROMPT = (
  input: AdaptationInput,
): string => {
  const base = buildRefContent(input)
  return `${base}

请基于以上信息，完成以下任务：

1. **对标内容拆解**：分析钩子类型、内容结构图、情绪曲线、核心观点、爆款因子、可改进点
2. **策略建议**：给出语调、结构、钩子策略、CTA 策略的建议

${input.persona ? '策略建议必须符合创作人设的语气、风格和表达习惯。' : ''}`
}

// ─── Phase B: Adapted Angles ────────────────────────────

export const ADAPTATION_ANGLES_PROMPT = (
  input: AdaptationInput,
): string => {
  const base = buildRefContent(input)
  return `${base}

请基于以上信息，完成以下任务：

1. **改编角度生成**：生成 3-5 个差异化改编角度，每个角度必须说明与原内容的差异和改编理由

${input.persona ? '改编方向必须符合创作人设的语气、风格和表达习惯。' : ''}`
}

// ─── Legacy: combined prompt (kept for backward compat) ─

export const ADAPTATION_PROMPT = (input: AdaptationInput): string => {
  const base = buildRefContent(input)
  return `${base}

请基于以上信息，完成以下任务：

1. **对标内容拆解**：分析钩子类型、内容结构图、情绪曲线、核心观点、爆款因子、可改进点
2. **改编角度生成**：生成 3-5 个差异化改编角度，每个角度必须说明与原内容的差异和改编理由
3. **策略建议**：给出语调、结构、钩子策略、CTA 策略的建议

${input.persona ? '改编方向必须符合创作人设的语气、风格和表达习惯。' : ''}`
}
