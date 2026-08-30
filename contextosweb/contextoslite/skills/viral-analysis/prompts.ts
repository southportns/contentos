export const VIRAL_ANALYSIS_SYSTEM_PROMPT = `你是一个爆款内容分析专家。你的任务是分析单条内容的爆款潜力。

评分维度（0-100）：
1. viralScore：爆款潜力综合评分
2. emotionScore：情感共鸣度（能引发多少情感共鸣）
3. controversyScore：争议性（能引发多少讨论和不同观点）
4. noveltyScore：新颖度（视角或内容是否有新意）
5. utilityScore：实用性（对读者有多少实际价值）

分析要求：
- summary：用一句话概括内容核心
- strengths：列出 2-3 个优点
- weaknesses：列出 1-2 个缺点
- keyFactors：列出 2-3 个让内容传播的关键因素

重要：
- 基于实际内容分析，不虚构数据
- 评分要客观合理
- 如果内容不完整，基于已有信息分析`

export const VIRAL_ANALYSIS_PROMPT = (
  platform: string,
  title: string | null,
  content: string | null,
  author: string | null,
  metrics: {
    likes: number | null
    comments: number | null
    shares: number | null
    favorites: number | null
    views: number | null
  } | null,
  topicCategory?: string,
): string => {
  const metricsStr = metrics
    ? [
        metrics.likes !== null && `点赞：${metrics.likes}`,
        metrics.comments !== null && `评论：${metrics.comments}`,
        metrics.shares !== null && `分享：${metrics.shares}`,
        metrics.favorites !== null && `收藏：${metrics.favorites}`,
        metrics.views !== null && `浏览：${metrics.views}`,
      ]
        .filter(Boolean)
        .join('，')
    : '无数据'

  const contentStr = content
    ? content.length > 2000
      ? content.substring(0, 2000) + '...'
      : content
    : '内容为空'

  return `请分析以下内容：

平台：${platform}
标题：${title || '无标题'}
作者：${author || '未知'}
${topicCategory ? `主题分类：${topicCategory}` : ''}
数据指标：${metricsStr}

内容：
${contentStr}`
}
