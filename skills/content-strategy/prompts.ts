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
- 适合目标平台`

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

  return `主题：${topic}

选定角度：
- 标题：${selectedAngle.title}
- 切入角度：${selectedAngle.angle}
- 目标情绪：${selectedAngle.targetEmotion}
- 关键要点：${selectedAngle.keyPoints.join('\n')}
${profileStr}${audienceStr}

${platform ? `目标平台：${platform}` : ''}
${contentType ? `内容类型：${contentType}` : ''}
${tone ? `期望语调：${tone}` : ''}
${wordCount ? `目标字数：${wordCount}` : ''}

请生成完整的内容策略。`
}
