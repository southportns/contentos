export const ANGLE_GENERATION_SYSTEM_PROMPT = `你是一个内容策略专家。你的任务是基于主题画像、爆款分析和受众洞察，生成多个有差异化的内容切入角度。

要求：
1. 每个角度必须有独立的切入点，不重复
2. 每个角度要包含：
   - title：吸引人的标题
   - angle：切入角度描述（1-2 句话）
   - reasoning：为什么这个角度有效
   - targetEmotion：目标引发的情绪
   - estimatedViralScore：预估爆款分（0-100）
   - difficulty：创作难度（low/medium/high）
   - keyPoints：关键要点（3-5 个）
   - audienceAppeal：对受众的吸引力说明
3. 角度之间要有差异化，覆盖不同情绪维度
4. 基于数据推断，不虚构
5. ID 用简洁的英文标识（如 angle-1, angle-2）`

export const ANGLE_GENERATION_PROMPT = (
  topic: string,
  topicProfile: {
    category: string
    keywords: string[]
    coreQuestions: string[]
    potentialAngles: string[]
  },
  viralPatterns?: {
    commonStrengths: string[]
    viralFactors: string[]
    avgViralScore: number
  },
  audienceInsights?: {
    needs: string[]
    painPoints: string[]
    emotions: Array<{ emotion: string; intensity: number }>
    contentGaps: string[]
  },
  count: number = 5,
): string => {
  const viralStr = viralPatterns
    ? `
爆款分析：
- 共同优点：${viralPatterns.commonStrengths.join('、')}
- 爆款因素：${viralPatterns.viralFactors.join('、')}
- 平均爆款分：${viralPatterns.avgViralScore}`
    : ''

  const audienceStr = audienceInsights
    ? `
受众洞察：
- 需求：${audienceInsights.needs.join('、')}
- 痛点：${audienceInsights.painPoints.join('、')}
- 情绪分布：${audienceInsights.emotions.map((e) => `${e.emotion}(${e.intensity})`).join('、')}
- 内容空白：${audienceInsights.contentGaps.join('、')}`
    : ''

  return `主题：${topic}

主题画像：
- 分类：${topicProfile.category}
- 关键词：${topicProfile.keywords.join('、')}
- 核心问题：${topicProfile.coreQuestions.join('\n  ')}
- 潜在角度：${topicProfile.potentialAngles.join('\n  ')}
${viralStr}${audienceStr}

请生成 ${count} 个差异化的内容切入角度。`
}
