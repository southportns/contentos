import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { distillationInputSchema, distillationOutputSchema } from './schema'
import { DISTILLATION_SYSTEM_PROMPT, DISTILLATION_PROMPT } from './prompts'
import type { DistillationInput, DistillationOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "sourceAnalysis": {
    "coreTheme": "核心主题描述",
    "keyInsights": ["关键洞察1", "关键洞察2", ...],
    "contentStructure": ["结构点1", "结构点2", ...],
    "emotionalArc": {
      "start": "开头情绪",
      "middle": "中间情绪",
      "end": "结尾情绪"
    },
    "memorableQuotes": ["金句1", "金句2", ...],
    "applicableAngles": ["可应用的角度1", "角度2", ...],
    "weaknesses": ["口播化弱点1", "弱点2", ...]
  },
  "distilledAngles": [
    {
      "id": "distill-1",
      "title": "口播稿标题",
      "angle": "创作角度描述",
      "reasoning": "为什么这样切入有效",
      "targetEmotion": "目标情绪",
      "keyPoints": ["要点1", "要点2"],
      "whatExtracted": "从原文中提炼了什么",
      "estimatedViralScore": 0-100的数字
    }
  ],
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
}
要求：distilledAngles 至少 3 个角度，每个角度必须有明确的差异化创作方向。memorableQuotes 不超过 5 条，必须来自原文。`)

export async function runDistillation(
  input: DistillationInput,
): Promise<DistillationOutput> {
  const validated = distillationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: DISTILLATION_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: DISTILLATION_PROMPT(validated),
  })

  const json = extractJsonFromText(text)
  return distillationOutputSchema.parse(json)
}
