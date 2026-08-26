import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  strategyEvaluationInputSchema,
  strategyEvaluationOutputSchema,
  type Platform,
} from './schema'
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildJsonInstructionStr,
  resolvePlatform,
} from './prompts'
import type { StrategyEvaluationInput, StrategyEvaluationOutput } from './schema'

export async function runStrategyEvaluation(
  input: StrategyEvaluationInput,
): Promise<StrategyEvaluationOutput> {
  const validated = strategyEvaluationInputSchema.parse(input)

  // Resolve platform string to enum
  const platform: Platform = validated.platform

  // Build prompts
  const systemPrompt = buildSystemPrompt(platform)
  const jsonInstruction = buildJsonInstruction(buildJsonInstructionStr(platform))
  const userPrompt = buildUserPrompt(validated, platform)

  const model = getModel()

  const { text } = await generateText({
    model,
    system: systemPrompt + jsonInstruction,
    prompt: userPrompt,
  })

  const json = extractJsonFromText(text)
  const result = strategyEvaluationOutputSchema.parse(json)

  // Ensure platform matches
  return {
    ...result,
    platform,
  }
}

// ─── Convenience: resolve platform from string ──────────

export { resolvePlatform }
export type { StrategyEvaluationInput, StrategyEvaluationOutput }
