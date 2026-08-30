import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { riskAnalysisInputSchema, riskAnalysisOutputSchema } from './schema'
import { RISK_ANALYSIS_SYSTEM_PROMPT, RISK_ANALYSIS_PROMPT } from './prompts'
import type { RiskAnalysisInput, RiskAnalysisOutput } from './schema'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式：
{
  "risks": [
    {
      "category": "political_sensitive" | "social_sensitive" | "personal_privacy" | "misinformation" | "hate_speech" | "commercial_compliance" | "platform_violation" | "legal_risk",
      "severity": "high" | "medium" | "low",
      "description": "风险描述，说明为什么这条内容存在风险",
      "suggestion": "具体的修改建议",
      "quote": "原文中涉及风险的片段（可选，如不便引用可省略）"
    }
  ],
  "overallRiskLevel": "safe" | "low" | "medium" | "high",
  "summary": "总体风险评估总结（1-2句话，说明文章整体风险情况和发布建议）"
}`)

export async function runRiskAnalysis(
  input: RiskAnalysisInput,
): Promise<RiskAnalysisOutput> {
  const validated = riskAnalysisInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: RISK_ANALYSIS_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: RISK_ANALYSIS_PROMPT(
      validated.title,
      validated.content,
      validated.platform,
    ),
  })

  const json = extractJsonFromText(text)
  return riskAnalysisOutputSchema.parse(json)
}
