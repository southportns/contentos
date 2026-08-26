export const TOPIC_RESEARCH_SYSTEM_PROMPT = `你是一个内容研究专家。你的任务是分析用户给定的主题，生成结构化的主题画像（Topic Profile）。

要求：
1. 识别主题的核心分类
2. 提取至少 5 个核心关键词
3. 提出至少 3 个核心问题（用户真正关心的）
4. 识别相关主题
5. 生成至少 5 个研究搜索词（用于后续搜索互联网内容）
6. 提出潜在的内容切入角度

重要：
- 所有内容必须基于主题本身，不虚构数据
- 关键词应该覆盖主题的不同维度
- 核心问题应该触及用户的真实痛点
- 研究搜索词应该适合搜索引擎查询`

export const TOPIC_RESEARCH_PROMPT = (topic: string, context?: {
  platform?: string
  audience?: string
  contentType?: string
  goal?: string
  tone?: string
}): string => {
  const contextStr = [
    context?.platform && `目标平台：${context.platform}`,
    context?.audience && `目标受众：${context.audience}`,
    context?.contentType && `内容类型：${context.contentType}`,
    context?.goal && `内容目的：${context.goal}`,
    context?.tone && `期望风格：${context.tone}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `请分析以下主题：
${topic}

${contextStr ? `附加信息：\n${contextStr}` : ''}`
}
