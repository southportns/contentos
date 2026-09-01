import { generateText } from 'ai'
import { getModel } from '@/lib/ai/models'
import { extractJsonFromText, buildJsonInstruction } from '@/lib/ai/json-helper'
import { expressionRewriteInputSchema, expressionRewriteOutputSchema } from './schema'
import {
  EXPRESSION_REWRITE_SYSTEM_PROMPT,
  EXPRESSION_REWRITE_PROMPT,
} from './prompts'
import type { ExpressionRewriteInput } from './schema'
import type { ExpressionRewriteResult } from '@/lib/expression/types'

const JSON_INSTRUCTION = buildJsonInstruction(`
JSON 对象格式（ExpressionRewriteResult）：
{
  "version": "1.0",
  "revisedContent": "修改后的完整内容",
  "revisedTitle": "修改后的标题（如有修改）",
  "changedSections": [
    {
      "location": "第2段",
      "issueId": "issue-1",
      "original": "原文片段",
      "revised": "修改后的片段",
      "reason": "修改原因"
    }
  ],
  "summary": "修正总结"
}
要求：revisedContent 必须是完整的修改后内容，不是片段。changedSections 至少 1 条。`)

/**
 * Run the Expression Rewrite skill.
 *
 * Input: draft, audit, expressionPlan, strategy, platform
 * Output: ExpressionRewriteResult (revised content + changed sections)
 *
 * Failure mode: throws on LLM/parse failure.
 * Caller should catch and keep the original draft.
 */
export async function runExpressionRewrite(
  input: ExpressionRewriteInput,
): Promise<ExpressionRewriteResult> {
  const validated = expressionRewriteInputSchema.parse(input)
  const model = getModel()

  const { text } = await generateText({
    model,
    system: EXPRESSION_REWRITE_SYSTEM_PROMPT + JSON_INSTRUCTION,
    prompt: EXPRESSION_REWRITE_PROMPT(validated),
  })

  const json = extractJsonFromText(text)
  const parsed = expressionRewriteOutputSchema.parse(json)

  return parsed as ExpressionRewriteResult
}
