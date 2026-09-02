/**
 * 转写纠错 Prompt（v3 — 精简版）
 *
 * 优化：压缩 system prompt 从 ~1500 字符降至 ~500 字符，减少 token 处理时间。
 * 核心规则保留，示例精简，约束合并。
 */

export const TRANSCRIPT_CORRECTION_SYSTEM_PROMPT = `修正 ASR 转写中的识别错误。只修错别字和断句，不改写原文。

修正范围：同音近音词（阿→啊、恩→嗯）、专有名词（逗音→抖音、ChatGPT 误识）、繁简转换、断句/标点。
禁止：改写、润色、增删内容、总结。不确定时保留原文。输出简体中文。

直接输出纠错后的纯文本，保持原段落结构。不要 JSON、解释或代码块。`

export const TRANSCRIPT_CORRECTION_PROMPT = (
  rawText: string,
  videoDesc?: string,
  videoAuthor?: string,
): string => {
  // 限制文本长度，避免超出模型上下文
  const textStr =
    rawText.length > 6000 ? rawText.substring(0, 6000) + '...' : rawText

  const contextParts: string[] = []
  if (videoDesc) contextParts.push(`标题：${videoDesc}`)
  if (videoAuthor) contextParts.push(`作者：${videoAuthor}`)

  return `${contextParts.length > 0 ? `${contextParts.join('，')}\n` : ''}纠错以下转写文本，直接输出全文：

${textStr}`
}
