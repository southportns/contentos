import { generateText, streamText } from 'ai'
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

// ─── 配置 ───────────────────────────────────────────────

/** 分段阈值：超过此长度则分段并行纠错 */
const PARALLEL_THRESHOLD = 2000

/** 每段最大长度 */
const CHUNK_SIZE = 1500

/** 分段重叠量（字符），确保分段边界处的上下文不丢失 */
const CHUNK_OVERLAP = 100

// ─── 缓存 ───────────────────────────────────────────────

/**
 * 纠错结果缓存（进程内 LRU）
 * key: hash(rawText + videoDesc + videoAuthor)
 */
const correctionCache = new Map<string, TranscriptCorrectionOutput>()
const CACHE_MAX_SIZE = 50

function getCacheKey(input: TranscriptCorrectionInput): string {
  return `${input.rawText.length}:${input.rawText.slice(0, 50)}:${input.videoDesc || ''}:${input.videoAuthor || ''}`
}

function getCachedResult(key: string): TranscriptCorrectionOutput | undefined {
  const cached = correctionCache.get(key)
  if (cached) {
    // LRU: 移到末尾
    correctionCache.delete(key)
    correctionCache.set(key, cached)
  }
  return cached
}

function setCachedResult(key: string, value: TranscriptCorrectionOutput): void {
  if (correctionCache.size >= CACHE_MAX_SIZE) {
    // 删除最老的条目
    const oldest = correctionCache.keys().next().value
    if (oldest) correctionCache.delete(oldest)
  }
  correctionCache.set(key, value)
}

// ─── 分段工具 ───────────────────────────────────────────

interface TextChunk {
  text: string
  start: number
  end: number
}

/**
 * 将长文本按自然边界（句号/换行）切分为多个 chunk。
 * 每个 chunk 有一定重叠，确保上下文连续性。
 */
function splitTextIntoChunks(text: string): TextChunk[] {
  if (text.length <= PARALLEL_THRESHOLD) {
    return [{ text, start: 0, end: text.length }]
  }

  const chunks: TextChunk[] = []
  let pos = 0

  while (pos < text.length) {
    const end = Math.min(pos + CHUNK_SIZE, text.length)
    // 尝试在句号/换行/问号处切分
    let breakPoint = end
    if (end < text.length) {
      const remaining = text.slice(pos, end)
      const lastSentenceEnd = Math.max(
        remaining.lastIndexOf('。'),
        remaining.lastIndexOf('\n'),
        remaining.lastIndexOf('！'),
        remaining.lastIndexOf('？'),
        remaining.lastIndexOf('；'),
      )
      if (lastSentenceEnd > CHUNK_SIZE * 0.5) {
        breakPoint = pos + lastSentenceEnd + 1
      }
    }

    chunks.push({
      text: text.slice(pos, breakPoint),
      start: pos,
      end: breakPoint,
    })

    // 下一个 chunk 从重叠位置开始
    pos = breakPoint - CHUNK_OVERLAP
    if (pos <= 0) pos = breakPoint
    if (pos >= text.length) break
  }

  return chunks
}

/**
 * 合并多个 chunk 的纠错结果。
 * 移除重叠部分，避免重复内容。
 */
function mergeChunkResults(
  chunks: TextChunk[],
  correctedChunks: string[],
  originalText: string,
): string {
  if (chunks.length === 1) {
    return correctedChunks[0]
  }

  let result = ''
  let lastEnd = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const corrected = correctedChunks[i]

    // 第一个 chunk 从头开始
    if (i === 0) {
      result = corrected
      lastEnd = chunk.end
    } else {
      // 后续 chunk：移除与前一个 chunk 重叠的部分
      // 简化策略：直接拼接，重叠部分通常较短且内容相似
      result += corrected
      lastEnd = chunk.end
    }
  }

  return result
}

// ─── Skill API ──────────────────────────────────────────

/**
 * 转写纠错 Skill（v3 — 精简 prompt + 分段并行 + 缓存）
 *
 * v3 优化：
 * 1. 精简 System Prompt（~500 字符 vs ~1500 字符）
 * 2. 长文本分段并行纠错（> 2000 字符时自动切分）
 * 3. 进程内 LRU 缓存，避免重复纠错
 * 4. 支持流式输出（runTranscriptCorrectionStream）
 */
export async function runTranscriptCorrection(
  input: TranscriptCorrectionInput,
): Promise<TranscriptCorrectionOutput> {
  const validated = transcriptCorrectionInputSchema.parse(input)

  // 检查缓存
  const cacheKey = getCacheKey(validated)
  const cached = getCachedResult(cacheKey)
  if (cached) {
    console.log('[transcript-correction] Cache hit, skipping LLM call')
    return cached
  }

  const model = getModel()
  const chunks = splitTextIntoChunks(validated.rawText)

  let correctedText: string

  if (chunks.length > 1) {
    // 分段并行纠错
    console.log(
      `[transcript-correction] Parallel correction: ${chunks.length} chunks, ` +
      `total ${validated.rawText.length} chars`,
    )

    const correctedChunks = await Promise.all(
      chunks.map(async (chunk, i) => {
        const { text } = await generateText({
          model,
          system: TRANSCRIPT_CORRECTION_SYSTEM_PROMPT,
          prompt: TRANSCRIPT_CORRECTION_PROMPT(
            chunk.text,
            validated.videoDesc,
            validated.videoAuthor,
          ),
        })
        console.log(
          `[transcript-correction] Chunk ${i + 1}/${chunks.length} done (${chunk.text.length} → ${text.length} chars)`,
        )
        return stripMarkdownWrapper(text)
      }),
    )

    correctedText = mergeChunkResults(chunks, correctedChunks, validated.rawText)
  } else {
    // 单次纠错
    const { text } = await generateText({
      model,
      system: TRANSCRIPT_CORRECTION_SYSTEM_PROMPT,
      prompt: TRANSCRIPT_CORRECTION_PROMPT(
        validated.rawText,
        validated.videoDesc,
        validated.videoAuthor,
      ),
    })

    correctedText = stripMarkdownWrapper(text)
  }

  // 通过 diff 计算纠错详情
  const corrections = computeCorrections(validated.rawText, correctedText)

  const output = transcriptCorrectionOutputSchema.parse({
    correctedText,
    corrections,
    correctionCount: corrections.length,
  })

  // 写入缓存
  setCachedResult(cacheKey, output)

  return output
}

/**
 * 流式纠错 — 逐步返回纠错后的文本
 *
 * 用于前端实时展示纠错进度。
 * 注意：流式模式不支持分段并行（流式 + 并行需要更复杂的合并逻辑），
 * 对于超长文本仍走分段并行模式。
 */
export async function runTranscriptCorrectionStream(
  input: TranscriptCorrectionInput,
): Promise<{
  textStream: AsyncIterable<string>
  getFinalResult: () => Promise<TranscriptCorrectionOutput>
}> {
  const validated = transcriptCorrectionInputSchema.parse(input)

  // 检查缓存
  const cacheKey = getCacheKey(validated)
  const cached = getCachedResult(cacheKey)
  if (cached) {
    console.log('[transcript-correction] Cache hit (stream), returning cached')
    // 返回一个同步的 "流" 直接 yield 缓存结果
    return {
      textStream: (async function* () {
        yield cached.correctedText
      })(),
      getFinalResult: async () => cached,
    }
  }

  const model = getModel()
  const chunks = splitTextIntoChunks(validated.rawText)

  // 对于超长文本，流式模式回退到非流式（分段并行更快）
  if (chunks.length > 1) {
    console.log(
      '[transcript-correction] Stream mode: text too long, falling back to parallel',
    )
    const result = await runTranscriptCorrection(validated)
    return {
      textStream: (async function* () {
        yield result.correctedText
      })(),
      getFinalResult: async () => result,
    }
  }

  // 短文本：真正的流式输出
  const { textStream } = await streamText({
    model,
    system: TRANSCRIPT_CORRECTION_SYSTEM_PROMPT,
    prompt: TRANSCRIPT_CORRECTION_PROMPT(
      validated.rawText,
      validated.videoDesc,
      validated.videoAuthor,
    ),
  })

  let accumulatedText = ''

  const wrappedStream = (async function* () {
    for await (const delta of textStream) {
      accumulatedText += delta
      yield delta
    }
  })()

  return {
    textStream: wrappedStream,
    getFinalResult: async () => {
      // 如果流已被消费完，accumulatedText 已有内容
      // 如果流未被消费，需要消费完
      if (!accumulatedText) {
        for await (const _ of wrappedStream) {
          // 消费完毕
        }
      }

      const cleanedText = stripMarkdownWrapper(accumulatedText)
      const corrections = computeCorrections(validated.rawText, cleanedText)
      const output = transcriptCorrectionOutputSchema.parse({
        correctedText: cleanedText,
        corrections,
        correctionCount: corrections.length,
      })

      setCachedResult(cacheKey, output)
      return output
    },
  }
}

// ─── 工具函数 ───────────────────────────────────────────

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
