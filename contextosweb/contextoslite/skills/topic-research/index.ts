import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { topicResearchInputSchema, topicResearchOutputSchema } from './schema'
import {
  TOPIC_RESEARCH_SYSTEM_PROMPT,
  TOPIC_RESEARCH_PROMPT,
} from './prompts'
import type { TopicResearchInput, TopicResearchOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "topic": "主题",
  "category": "分类",
  "keywords": ["关键词1", "关键词2", ...],
  "relatedTopics": ["相关主题1", ...],
  "coreQuestions": ["核心问题1", ...],
  "audience": "受众描述（可选）",
  "potentialAngles": ["角度1", ...],
  "researchQueries": ["搜索词1", ...]
}
要求：keywords 至少 5 个，coreQuestions 至少 3 个，researchQueries 至少 5 个。`)

export async function runTopicResearch(
  input: TopicResearchInput,
): Promise<TopicResearchOutput> {
  const validated = topicResearchInputSchema.parse(input)

  const model = getModel()

  const { text } = await generateText({
    model,
    system: TOPIC_RESEARCH_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: TOPIC_RESEARCH_PROMPT(validated.topic, {
      platform: validated.platform,
      audience: validated.audience,
      contentType: validated.contentType,
      goal: validated.goal,
      tone: validated.tone,
    }),
  })

  const json = extractJsonFromText(text)
  return topicResearchOutputSchema.parse(json)
}
