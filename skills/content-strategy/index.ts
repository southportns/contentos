import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import {
  contentStrategyInputSchema,
  contentStrategyOutputSchema,
} from './schema'
import {
  CONTENT_STRATEGY_SYSTEM_PROMPT,
  CONTENT_STRATEGY_PROMPT,
} from './prompts'
import type { ContentStrategyInput, ContentStrategyOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "title": "标题",
  "hook": "开篇钩子",
  "structure": [
    {
      "section": "段落名",
      "purpose": "段落目的",
      "keyArguments": ["论点1", "论点2"],
      "estimatedWords": 数字
    }
  ],
  "keyArguments": ["核心论点1", "核心论点2"],
  "emotionalArc": {
    "start": "开头情绪",
    "middle": "中间情绪",
    "end": "结尾情绪"
  },
  "callToAction": "行动号召",
  "suggestedReferences": ["引用建议1"],
  "tone": "建议语调",
  "estimatedWordCount": 数字
}
要求：structure 至少 3 个段落。`)

export async function runContentStrategy(
  input: ContentStrategyInput,
): Promise<ContentStrategyOutput> {
  const validated = contentStrategyInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: CONTENT_STRATEGY_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: CONTENT_STRATEGY_PROMPT(
      validated.topic,
      validated.selectedAngle,
      validated.topicProfile,
      validated.audienceInsights,
      validated.platform,
      validated.contentType,
      validated.tone,
      validated.wordCount,
    ),
  })

  const json = extractJsonFromText(text)
  return contentStrategyOutputSchema.parse(json)
}
