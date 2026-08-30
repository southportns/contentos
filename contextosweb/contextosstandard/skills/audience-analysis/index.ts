import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  audienceAnalysisInputSchema,
  audienceAnalysisOutputSchema,
} from './schema'
import {
  AUDIENCE_ANALYSIS_SYSTEM_PROMPT,
  AUDIENCE_ANALYSIS_PROMPT,
} from './prompts'
import type { AudienceAnalysisInput, AudienceAnalysisOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "demographics": {
    "primaryAgeRange": "主要年龄段",
    "primaryGender": "主要性别",
    "secondaryAgeRange": "次要年龄段",
    "secondaryGender": "次要性别"
  },
  "needs": ["需求1", "需求2", "需求3"],
  "painPoints": ["痛点1", "痛点2", "痛点3"],
  "emotions": [
    {"emotion": "情绪名", "intensity": 0-100, "percentage": 0-100}
  ],
  "behaviors": ["行为1", "行为2", "行为3"],
  "preferences": ["偏好1", "偏好2", "偏好3"],
  "contentGaps": ["空白1", "空白2"]
}`)

export async function runAudienceAnalysis(
  input: AudienceAnalysisInput,
): Promise<AudienceAnalysisOutput> {
  const validated = audienceAnalysisInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: AUDIENCE_ANALYSIS_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: AUDIENCE_ANALYSIS_PROMPT(
      validated.contents,
      validated.topicCategory,
      validated.topicKeywords,
    ),
  })

  const json = extractJsonFromText(text)
  return audienceAnalysisOutputSchema.parse(json)
}
