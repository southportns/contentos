import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { expressionPlanningInputSchema, expressionPlanningOutputSchema } from './schema'
import {
  EXPRESSION_PLANNING_SYSTEM_PROMPT,
  EXPRESSION_PLANNING_PROMPT,
} from './prompts'
import type { ExpressionPlanningInput } from './schema'
import type { ExpressionPlan } from '@/lib/expression/types'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式（ExpressionPlan）：
{
  "version": "1.0",
  "speaker": {
    "role": "作者身份角色",
    "relationshipToAudience": "和读者的关系",
    "authority": "low" | "medium" | "high",
    "emotionalDistance": "close" | "medium" | "distant"
  },
  "thoughtPath": [
    { "step": 1, "mode": "observation", "purpose": "建立共同经验" }
  ],
  "emotionCurve": [
    { "stage": "开头", "emotion": "calm", "intensity": 30 }
  ],
  "rhythm": {
    "sentenceVariance": "medium",
    "paragraphVariance": "medium",
    "shortSentencePreference": "medium",
    "pauseFrequency": "low"
  },
  "expression": {
    "oralness": "medium",
    "specificity": "medium",
    "reflection": "medium",
    "imperfectionTolerance": "low"
  },
  "opening": {
    "mode": "observation",
    "instruction": "从一个具体场景开始"
  },
  "conclusion": {
    "mode": "open_ended",
    "instruction": "留下余味，不强行总结"
  },
  "constraints": {
    "mustPreserve": ["核心观点1", "核心观点2"],
    "avoidPatterns": ["首先/其次/最后", "在这个...时代"],
    "truthConstraints": ["禁止伪造作者真实经历", "禁止虚构引用和数据"]
  }
}`)

/**
 * Run the Expression Planning skill.
 *
 * Input: content strategy, selected angle, persona, etc.
 * Output: ExpressionPlan (expression blueprint JSON)
 *
 * Failure mode: returns undefined on LLM/parse failure,
 * allowing the caller to gracefully degrade to writing without ExpressionPlan.
 */
export async function runExpressionPlanning(
  input: ExpressionPlanningInput,
): Promise<ExpressionPlan> {
  const validated = expressionPlanningInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: EXPRESSION_PLANNING_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: EXPRESSION_PLANNING_PROMPT(validated),
  })

  const json = extractJsonFromText(text)
  const parsed = expressionPlanningOutputSchema.parse(json)

  return parsed as ExpressionPlan
}
