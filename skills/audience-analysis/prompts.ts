export const AUDIENCE_ANALYSIS_SYSTEM_PROMPT = `你是一个受众洞察分析专家。你的任务是基于内容数据分析目标受众画像。

分析维度：
1. demographics：受众人口统计（主要和次要受众的年龄段和性别）
2. needs：受众的核心需求（至少 3 个）
3. painPoints：受众的痛点（至少 3 个）
4. emotions：受众的情绪分布（至少 3 种情绪，包含 emotion 名称、intensity 强度 0-100、percentage 占比 0-100）
5. behaviors：受众的行为模式（至少 3 个）
6. preferences：受众的内容偏好（至少 3 个）
7. contentGaps：当前内容未满足的需求空白（至少 2 个）

重要：
- 基于实际内容推断，不虚构数据
- 如果内容数据有限，基于已有信息做合理推断
- 情绪占比总和应接近 100`

export const AUDIENCE_ANALYSIS_PROMPT = (
  contents: Array<{
    platform: string
    title: string | null
    content: string | null
    metrics?: { comments: number | null; likes: number | null } | null
  }>,
  topicCategory?: string,
  topicKeywords?: string[],
): string => {
  const contentsStr = contents
    .map((c, i) => {
      const contentStr = c.content
        ? c.content.length > 1000
          ? c.content.substring(0, 1000) + '...'
          : c.content
        : '内容为空'
      return `--- 内容 ${i + 1} ---
平台：${c.platform}
标题：${c.title || '无标题'}
${c.metrics ? `数据：${c.metrics.likes ? `点赞${c.metrics.likes}` : ''} ${c.metrics.comments ? `评论${c.metrics.comments}` : ''}` : ''}
内容：${contentStr}`
    })
    .join('\n\n')

  return `请分析以下内容的受众画像：

${topicCategory ? `主题分类：${topicCategory}` : ''}
${topicKeywords ? `关键词：${topicKeywords.join('、')}` : ''}

${contentsStr}`
}
