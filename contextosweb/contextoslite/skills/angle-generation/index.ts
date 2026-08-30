import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  angleGenerationInputSchema,
  angleGenerationOutputSchema,
} from './schema'
import {
  ANGLE_GENERATION_SYSTEM_PROMPT,
  ANGLE_GENERATION_PROMPT,
} from './prompts'
import type { AngleGenerationInput, AngleGenerationOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "angles": [
    {
      "id": "angle-1",
      "title": "标题",
      "angle": "切入角度描述",
      "reasoning": "为什么有效",
      "targetEmotion": "目标情绪",
      "estimatedViralScore": 0-100的数字,
      "difficulty": "low" | "medium" | "high",
      "keyPoints": ["要点1", "要点2"],
      "audienceAppeal": "受众吸引力说明"
    }
  ]
}
要求：至少 3 个角度，每个角度必须有独立的切入点。`)

export async function runAngleGeneration(
  input: AngleGenerationInput,
): Promise<AngleGenerationOutput> {
  const validated = angleGenerationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: ANGLE_GENERATION_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: ANGLE_GENERATION_PROMPT(
      validated.topic,
      validated.topicProfile,
      validated.viralPatterns,
      validated.audienceInsights,
      validated.count,
    ),
  })

  const json = extractJsonFromText(text)
  return angleGenerationOutputSchema.parse(json)
}
