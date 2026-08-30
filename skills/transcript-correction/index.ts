import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import {
  transcriptCorrectionInputSchema,
  transcriptCorrectionOutputSchema,
} from './schema'
import {
  TRANSCRIPT_CORRECTION_SYSTEM_PROMPT,
  TRANSCRIPT_CORRECTION_PROMPT,
} from './prompts'
import { computeCorrections } from './diff'
import type {
  TranscriptCorrectionInput,
  TranscriptCorrectionOutput,
} from './schema'

/**
 * 转写纠错 Skill（v2 — 纯文本输出）
 *
 * 优化：不再要求 LLM 返回 JSON 结构化输出，改为直接输出纠错后的纯文本。
 * 这将 LLM 生成时间从 ~14s 降至 ~0.2s（根据性能分析）。
 *
 * 纠错详情通过 diff 算法在本地计算，对比原始文本和纠错后文本。
 */
export async function runTranscriptCorrection(
  input: TranscriptCorrectionInput,
): Promise<TranscriptCorrectionOutput> {
  const validated = transcriptCorrectionInputSchema.parse(input)
  const model = getModel()

  const { text: correctedText } = await generateText({
    model,
    system: TRANSCRIPT_CORRECTION_SYSTEM_PROMPT,
    prompt: TRANSCRIPT_CORRECTION_PROMPT(
      validated.rawText,
      validated.videoDesc,
      validated.videoAuthor,
    ),
  })

  // 去除 LLM 可能添加的多余空白/代码块标记
  const cleanedText = stripMarkdownWrapper(correctedText)

  // 通过 diff 计算纠错详情
  const corrections = computeCorrections(validated.rawText, cleanedText)

  return transcriptCorrectionOutputSchema.parse({
    correctedText: cleanedText,
    corrections,
    correctionCount: corrections.length,
  })
}

/**
 * 去除 LLM 可能添加的 markdown 代码块包装。
 * 例如 ```text\n...\n``` → ...
 */
function stripMarkdownWrapper(text: string): string {
  let result = text.trim()

  // 去除 ```text / ``` / ```plaintext 等代码块包装
  const codeBlockMatch = result.match(/^```(?:text|plaintext)?\s*\n([\s\S]*?)\n```\s*$/)
  if (codeBlockMatch) {
    result = codeBlockMatch[1].trim()
  }

  return result
}
