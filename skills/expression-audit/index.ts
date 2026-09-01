import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { expressionAuditInputSchema, expressionAuditOutputSchema } from './schema'
import {
  EXPRESSION_AUDIT_SYSTEM_PROMPT,
  EXPRESSION_AUDIT_PROMPT,
} from './prompts'
import type { ExpressionAuditInput } from './schema'
import type { ExpressionAudit } from '@/lib/expression/types'
import {
  DEFAULT_EXPRESSION_WEIGHTS,
  EXPRESSION_AUDIT_PASS_THRESHOLD,
} from '@/lib/expression/types'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式（ExpressionAudit）：
{
  "version": "1.0",
  "overallScore": 0-100的数字,
  "dimensions": {
    "naturalness": 0-100,
    "voiceConsistency": 0-100,
    "specificity": 0-100,
    "rhythm": 0-100,
    "thoughtAuthenticity": 0-100,
    "emotionalAuthenticity": 0-100
  },
  "issues": [
    {
      "id": "issue-1",
      "type": "formulaic" | "generic" | "abstract" | "uniform_rhythm" | "over_structured" | "over_explained" | "emotion_flat" | "voice_drift" | "thoughtless_transition" | "fake_specificity" | "repetitive_pattern",
      "severity": "low" | "medium" | "high",
      "location": {
        "paragraphIndex": 0,
        "sentenceIndex": 0,
        "quote": "原文引用"
      },
      "diagnosis": "问题描述",
      "rewriteInstruction": "修改指令"
    }
  ],
  "pass": true或false
}`)

function calculateOverallScore(
  dimensions: ExpressionAudit['dimensions'],
): number {
  return Math.round(
    dimensions.naturalness * DEFAULT_EXPRESSION_WEIGHTS.naturalness +
      dimensions.voiceConsistency * DEFAULT_EXPRESSION_WEIGHTS.voiceConsistency +
      dimensions.specificity * DEFAULT_EXPRESSION_WEIGHTS.specificity +
      dimensions.rhythm * DEFAULT_EXPRESSION_WEIGHTS.rhythm +
      dimensions.thoughtAuthenticity * DEFAULT_EXPRESSION_WEIGHTS.thoughtAuthenticity +
      dimensions.emotionalAuthenticity *
        DEFAULT_EXPRESSION_WEIGHTS.emotionalAuthenticity,
  )
}

function hasHighSeverityIssues(
  issues: ExpressionAudit['issues'],
): boolean {
  return issues.some((i) => i.severity === 'high')
}

function determinePass(
  overallScore: number,
  issues: ExpressionAudit['issues'],
): boolean {
  if (hasHighSeverityIssues(issues)) return false
  return overallScore >= EXPRESSION_AUDIT_PASS_THRESHOLD
}

/**
 * Run the Expression Audit skill.
 *
 * Input: draft, expressionPlan, strategy, platform, persona
 * Output: ExpressionAudit (structured diagnosis)
 *
 * Failure mode: throws on LLM/parse failure.
 * Caller should catch and degrade gracefully (skip rewrite, proceed to evaluation).
 */
export async function runExpressionAudit(
  input: ExpressionAuditInput,
): Promise<ExpressionAudit> {
  const validated = expressionAuditInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: EXPRESSION_AUDIT_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: EXPRESSION_AUDIT_PROMPT(validated),
  })

  const json = extractJsonFromText(text)
  const parsed = expressionAuditOutputSchema.parse(json)

  // Recalculate overallScore using our weights for consistency
  const recalculatedScore = calculateOverallScore(parsed.dimensions)
  const pass = determinePass(recalculatedScore, parsed.issues)

  const audit: ExpressionAudit = {
    version: '1.0',
    overallScore: recalculatedScore,
    dimensions: parsed.dimensions,
    issues: parsed.issues,
    pass,
  }

  return audit
}
