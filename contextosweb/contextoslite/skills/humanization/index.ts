import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { humanizationInputSchema, humanizationOutputSchema } from './schema'
import {
  HUMANIZATION_SYSTEM_PROMPT,
  HUMANIZATION_PROMPT,
} from './prompts'
import type { HumanizationInput, HumanizationOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "content": "改写后的完整内容",
  "title": "改写后的标题（如有）",
  "changes": [
    {
      "original": "原文片段",
      "revised": "改写后的片段",
      "reason": "改写原因",
      "type": "template" | "empty" | "parallel" | "summary" | "aivocab" | "connector" | "emostack" | "quotebomb"
    }
  ],
  "issues": [
    {
      "type": "问题类型",
      "description": "问题描述",
      "severity": "high" | "medium" | "low"
    }
  ],
  "aiStyleScore": 0-100的数字（越低越好）,
  "humanizedScore": 0-100的数字（越高越好）
}
要求：changes 至少 1 条（如果内容无明显 AI 味则返回空数组，aiStyleScore 设为 20 以下）。`)

export async function runHumanization(
  input: HumanizationInput,
): Promise<HumanizationOutput> {
  const validated = humanizationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: HUMANIZATION_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: HUMANIZATION_PROMPT(
      validated.content,
      validated.title,
      validated.platform,
      validated.tone,
    ),
  })

  const json = extractJsonFromText(text)
  return humanizationOutputSchema.parse(json)
}
