import type { WritingInput } from './schema'

export const WRITING_SYSTEM_PROMPT = `你是一个优秀的内容写手。你的任务是基于内容策略，写出完整的内容初稿。

要求：
1. 严格遵循策略中的结构大纲
2. 保持策略中设定的语调
3. 实现情感弧线（开头/中间/结尾）
4. 每段内容要展开 keyArguments
5. 自然而有效地融入 callToAction
6. 不虚构数据和引用
7. 适合目标平台的内容风格
8. 标题要吸引人但不要标题党
9. 如果提供了创作人设，写作语气、用词风格、表达习惯必须符合人设的设定
10. 观众视角表达：口播稿面向的是短视频观众，当使用第二人称对话式表达时，应使用"大家"而非"你"来拉近距离感（如"你有没有发现"改为"大家有没有发现"，"你怎么看待"改为"大家怎么看待"）。但此约束仅在适合对话感、互动感的内容上使用，不适用于叙事性、知识科普等不需要第二人称的内容，避免生搬硬套。

输出格式：
- 完整的正文内容（markdown 格式）
- 每个段落用 ## 标记 section 名称`

export const WRITING_PROMPT = (
  topic: string,
  strategy: WritingInput['strategy'],
  selectedAngle: WritingInput['selectedAngle'],
  platform?: string,
  tone?: string,
  wordCount?: number,
  persona?: {
    name: string
    description: string | null
  },
): string => {
  const structureStr = strategy.structure
    .map(
      (s) =>
        `### ${s.section}
目的：${s.purpose}
关键论点：${s.keyArguments.join('、')}
预计字数：${s.estimatedWords}`,
    )
    .join('\n\n')

  const personaStr = persona
    ? `
创作人设：
- 名称：${persona.name}
${persona.description ? `- 描述：${persona.description}` : ''}`
    : ''

  return `主题：${topic}

选定角度：${selectedAngle.title} — ${selectedAngle.angle}
目标情绪：${selectedAngle.targetEmotion}
关键要点：${selectedAngle.keyPoints.join('、')}

内容策略：
- 标题：${strategy.title}
- 钩子：${strategy.hook}
- 语调：${tone || strategy.tone}
- 情感弧线：${strategy.emotionalArc.start} → ${strategy.emotionalArc.middle} → ${strategy.emotionalArc.end}
- 行动号召：${strategy.callToAction}
- 核心论点：${strategy.keyArguments.join('、')}

结构大纲：
${structureStr}
${personaStr}

${platform ? `目标平台：${platform}` : ''}
${wordCount ? `目标字数：${wordCount}` : `预计总字数：${strategy.estimatedWordCount}`}

${persona ? '请严格按照创作人设的设定来写作，确保语气、用词风格、表达习惯都符合人设要求。' : ''}请基于以上策略，写出完整的内容初稿。`
}
