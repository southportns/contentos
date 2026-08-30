import { generateText } from 'ai'
import { z } from 'zod'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { adaptationInputSchema, adaptationOutputSchema } from './schema'
import {
  ADAPTATION_SYSTEM_PROMPT,
  ADAPTATION_ANALYSIS_PROMPT,
  ADAPTATION_ANGLES_PROMPT,
} from './prompts'
import type { AdaptationInput, AdaptationOutput } from './schema'

// ─── JSON format instructions (split) ───────────────────

const ANALYSIS_JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "referenceAnalysis": {
    "hookType": "钩子类型描述",
    "contentStructure": ["结构点1", "结构点2", ...],
    "emotionalArc": {
      "start": "开头情绪",
      "middle": "中间情绪",
      "end": "结尾情绪"
    },
    "keyPoints": ["核心观点1", "核心观点2", ...],
    "viralFactors": ["爆款因子1", "爆款因子2", ...],
    "weaknesses": ["可改进点1", "可改进点2", ...]
  },
  "strategySuggestion": {
    "tone": "建议语调",
    "structure": [
      {
        "section": "段落名",
        "purpose": "段落目的",
        "keyArguments": ["论点1"]
      }
    ],
    "hookStrategy": "钩子策略",
    "ctaStrategy": "CTA策略"
  }
}`)

const ANGLES_JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "adaptedAngles": [
    {
      "id": "adapt-1",
      "title": "改编标题",
      "angle": "改编角度描述",
      "reasoning": "为什么这样改编有效",
      "targetEmotion": "目标情绪",
      "keyPoints": ["要点1", "要点2"],
      "whatChanged": "与原内容的差异说明",
      "estimatedViralScore": 0-100的数字
    }
  ]
}
要求：adaptedAngles 至少 3 个角度，每个角度必须有明确的差异化改编方向。`)

// ─── Schemas for split calls ────────────────────────────

const analysisSchema = z.object({
  referenceAnalysis: adaptationOutputSchema.shape.referenceAnalysis,
  strategySuggestion: adaptationOutputSchema.shape.strategySuggestion,
})

const anglesSchema = z.object({
  adaptedAngles: adaptationOutputSchema.shape.adaptedAngles,
})

// ─── Helpers ────────────────────────────────────────────

function safeParseJson(text: string, label: string): unknown {
  try {
    return extractJsonFromText(text)
  } catch (err) {
    const preview = text.substring(0, 500)
    throw new Error(
      `[${label}] AI 返回的内容无法解析为 JSON。${err instanceof Error ? err.message : ''}\n` +
      `AI 原始返回（前 500 字符）：\n${preview}`,
    )
  }
}

function safeZodParse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  rawText: string,
  label: string,
): T {
  try {
    return schema.parse(data)
  } catch (err) {
    const preview = rawText.substring(0, 500)
    throw new Error(
      `[${label}] AI 返回的 JSON 格式不符合预期。${err instanceof z.ZodError ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') : err instanceof Error ? err.message : ''}\n` +
      `AI 原始返回（前 500 字符）：\n${preview}`,
    )
  }
}

// ─── Phase A: Reference analysis + strategy ─────────────

export async function runAnalysisPhase(
  input: AdaptationInput,
): Promise<{
  referenceAnalysis: AdaptationOutput['referenceAnalysis']
  strategySuggestion: AdaptationOutput['strategySuggestion']
  rawText: string
}> {
  const validated = adaptationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: ADAPTATION_SYSTEM_PROMPT + ANALYSIS_JSON_INSTRUCTION,
    prompt: ADAPTATION_ANALYSIS_PROMPT(validated),
  })

  const json = safeParseJson(text, 'Analysis')
  const parsed = safeZodParse(analysisSchema, json, text, 'Analysis')

  return {
    referenceAnalysis: parsed.referenceAnalysis,
    strategySuggestion: parsed.strategySuggestion,
    rawText: text,
  }
}

// ─── Phase B: Adapted angles ────────────────────────────

export async function runAnglesPhase(
  input: AdaptationInput,
): Promise<{
  adaptedAngles: AdaptationOutput['adaptedAngles']
  rawText: string
}> {
  const validated = adaptationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: ADAPTATION_SYSTEM_PROMPT + ANGLES_JSON_INSTRUCTION,
    prompt: ADAPTATION_ANGLES_PROMPT(validated),
  })

  const json = safeParseJson(text, 'Angles')
  const parsed = safeZodParse(anglesSchema, json, text, 'Angles')

  return {
    adaptedAngles: parsed.adaptedAngles,
    rawText: text,
  }
}

// ─── Combined: parallel execution ───────────────────────

export async function runAdaptation(
  input: AdaptationInput,
): Promise<AdaptationOutput> {
  const validated = adaptationInputSchema.parse(input)

  // 两个阶段并行执行
  const [analysisResult, anglesResult] = await Promise.all([
    runAnalysisPhase(validated),
    runAnglesPhase(validated),
  ])

  return {
    referenceAnalysis: analysisResult.referenceAnalysis,
    strategySuggestion: analysisResult.strategySuggestion,
    adaptedAngles: anglesResult.adaptedAngles,
  }
}

// ─── Streaming version (SSE events) ────────────────────

/**
 * Run adaptation with streaming events.
 * Emits 'analysis' event first (when Phase A completes),
 * then 'angles' event (when Phase B completes),
 * then 'done' event with the full result.
 */
export async function runAdaptationStream(
  input: AdaptationInput,
  callbacks: {
    onAnalysis: (data: {
      referenceAnalysis: AdaptationOutput['referenceAnalysis']
      strategySuggestion: AdaptationOutput['strategySuggestion']
    }) => void
    onAngles: (data: { adaptedAngles: AdaptationOutput['adaptedAngles'] }) => void
    onDone: (data: AdaptationOutput) => void
    onError: (error: Error) => void
  },
): Promise<void> {
  const validated = adaptationInputSchema.parse(input)

  // Use a mutable container object so TS doesn't narrow to `never`
  const state: {
    analysis: Awaited<ReturnType<typeof runAnalysisPhase>> | null
    angles: Awaited<ReturnType<typeof runAnglesPhase>> | null
    error: Error | null
  } = { analysis: null, angles: null, error: null }

  await Promise.all([
    runAnalysisPhase(validated)
      .then((result) => {
        state.analysis = result
        callbacks.onAnalysis({
          referenceAnalysis: result.referenceAnalysis,
          strategySuggestion: result.strategySuggestion,
        })
      })
      .catch((err) => {
        if (!state.error) state.error = err instanceof Error ? err : new Error(String(err))
      }),
    runAnglesPhase(validated)
      .then((result) => {
        state.angles = result
        callbacks.onAngles({ adaptedAngles: result.adaptedAngles })
      })
      .catch((err) => {
        if (!state.error) state.error = err instanceof Error ? err : new Error(String(err))
      }),
  ])

  if (state.error) {
    callbacks.onError(state.error)
    return
  }

  if (state.analysis && state.angles) {
    callbacks.onDone({
      referenceAnalysis: state.analysis.referenceAnalysis,
      strategySuggestion: state.analysis.strategySuggestion,
      adaptedAngles: state.angles.adaptedAngles,
    })
  }
}
