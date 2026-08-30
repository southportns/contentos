import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { evaluationInputSchema, evaluationOutputSchema } from './schema'
import { EVALUATION_SYSTEM_PROMPT, EVALUATION_PROMPT } from './prompts'
import type { EvaluationInput, EvaluationOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "overallScore": 0-100的数字,
  "scores": {
    "emotionalImpact": 0-100,
    "logicalClarity": 0-100,
    "novelty": 0-100,
    "readability": 0-100,
    "utility": 0-100,
    "platformFit": 0-100
  },
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["缺点1", "缺点2"],
  "suggestions": [
    {
      "section": "段落名",
      "issue": "问题描述",
      "suggestion": "改进建议",
      "priority": "high" | "medium" | "low"
    }
  ],
  "emotionalArcAnalysis": {
    "achieved": true或false,
    "analysis": "分析说明"
  },
  "conclusion": "总体评价"
}`)

export async function runEvaluation(
  input: EvaluationInput,
): Promise<EvaluationOutput> {
  const validated = evaluationInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: EVALUATION_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: EVALUATION_PROMPT(
      validated.title,
      validated.content,
      validated.strategy,
      validated.selectedAngle,
      validated.platform,
    ),
  })

  const json = extractJsonFromText(text)
  return evaluationOutputSchema.parse(json)
}
