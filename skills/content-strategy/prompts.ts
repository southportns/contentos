export const CONTENT_STRATEGY_SYSTEM_PROMPT = `你是一个内容策略师。你的任务是基于选定的内容角度，生成完整的内容策略。

要求：
1. title：生成吸引人的标题
2. hook：开篇钩子（1-2 句话抓住注意力）
3. structure：内容结构大纲，每个段落包含：
   - section：段落名称
   - purpose：该段落的目的
   - keyArguments：关键论点（2-3 个）
   - estimatedWords：预计字数
4. keyArguments：整篇内容的核心论点（3-5 个）
5. emotionalArc：情感弧线（开头/中间/结尾分别引发什么情绪）
6. callToAction：行动号召
7. suggestedReferences：引用素材建议（基于已有内容，不虚构）
8. tone：建议语调
9. estimatedWordCount：预计总字数

重要：
- 策略必须基于选定的角度
- 不虚构引用和数据
- 结构要符合逻辑
- 适合目标平台
- 如果提供了创作人设，策略中的语调、钩子风格、结构选择必须符合人设设定
- 如果提供了原始素材（sourceContent），策略必须基于其中的事实，不得编造素材中不存在的信息`

export const CONTENT_STRATEGY_PROMPT = (
  topic: string,
  selectedAngle: {
    id: string
    title: string
    angle: string
    targetEmotion: string
    keyPoints: string[]
  },
  topicProfile?: { keywords: string[]; coreQuestions: string[] },
  audienceInsights?: { needs: string[]; painPoints: string[] },
  platform?: string,
  contentType?: string,
  tone?: string,
  wordCount?: number,
  persona?: {
    name: string
    description: string | null
  },
  sourceContent?: {
    content?: string
    keyInsights?: string[]
    memorableQuotes?: string[]
  },
): string => {
  const profileStr = topicProfile
    ? `
关键词：${topicProfile.keywords.join('、')}
核心问题：${topicProfile.coreQuestions.join('\n')}`
    : ''

  const audienceStr = audienceInsights
    ? `
受众需求：${audienceInsights.needs.join('、')}
受众痛点：${audienceInsights.painPoints.join('、')}`
    : ''

  const personaStr = persona
    ? `
创作人设：
- 名称：${persona.name}
${persona.description ? `- 描述：${persona.description}` : ''}`
    : ''

  // 原始素材信息 — 这是事实依据，策略必须基于这些内容
  let sourceStr = ''
  if (sourceContent) {
    const sourceParts: string[] = []

    if (sourceContent.keyInsights && sourceContent.keyInsights.length > 0) {
      sourceParts.push(`### 关键洞察（必须基于这些事实）
${sourceContent.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n')}`)
    }

    if (sourceContent.memorableQuotes && sourceContent.memorableQuotes.length > 0) {
      sourceParts.push(`### 原文金句（可直接引用）
${sourceContent.memorableQuotes.map((q) => `> ${q}`).join('\n')}`)
    }

    if (sourceContent.content && sourceContent.content.length > 0) {
      // 截断过长的内容
      const truncated = sourceContent.content.length > 3000
        ? sourceContent.content.slice(0, 3000) + '\n\n[内容已截断]'
        : sourceContent.content
      sourceParts.push(`### 原文内容
${truncated}`)
    }

    if (sourceParts.length > 0) {
      sourceStr = `
## 原始素材（策略必须基于以下事实，不得虚构数据）

${sourceParts.join('\n\n')}
`
    }
  }

  return `主题：${topic}

选定角度：
- 标题：${selectedAngle.title}
- 切入角度：${selectedAngle.angle}
- 目标情绪：${selectedAngle.targetEmotion}
- 关键要点：${selectedAngle.keyPoints.join('\n')}
${profileStr}${audienceStr}${personaStr}
${sourceStr}
${platform ? `目标平台：${platform}` : ''}
${contentType ? `内容类型：${contentType}` : ''}
${tone ? `期望语调：${tone}` : ''}
${wordCount ? `目标字数：${wordCount}` : ''}
${sourceStr ? '\n⚠️ 重要：内容策略必须严格基于原始素材中的事实（数字、事件、人物关系等），不得编造原文不存在的信息。' : ''}

${persona ? '请严格按照创作人设的设定生成内容策略，确保语调、风格、结构都符合人设要求。' : ''}请生成完整的内容策略。`
}
