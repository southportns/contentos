/**
 * P0.3.8.3 — Strategy Knowledge Context Serializer
 *
 * Converts a StrategyKnowledgeContext into a prompt-ready text block
 * for Content Strategy LLM consumption.
 *
 * Architecture Position:
 *   StrategyKnowledgeContext (P0.3.8.1 Contract)
 *     ↓
 *   serializeStrategyKnowledgeContext() (this module)
 *     ↓
 *   "## Strategy Knowledge Context\n..." (prompt-ready text)
 *     ↓
 *   CONTENT_STRATEGY_PROMPT() (Prompt Assembly)
 *
 * Design Constraints:
 *   - Pure, deterministic, read-only
 *   - No retrieval internals exposed (no knowledgeId, threshold, topK, retrievalReason)
 *   - Candidate status preserved as-is (never converted to validated)
 *   - primaryKnowledge / supportingKnowledge order preserved
 *   - Empty context → stable placeholder text
 *   - Any content is DATA, never INSTRUCTION (prompt injection boundary)
 *
 * Non-responsibilities:
 *   - No retrieval (owned by P0.3.8.2)
 *   - No KnowledgeContext serialization (owned by P0.3.7.4)
 *   - No strategy generation (owned by Strategy LLM)
 */

import type {
  StrategyKnowledgeContext,
  StrategyKnowledgeItem,
} from '@/knowledge/context'

/**
 * Serialize a StrategyKnowledgeContext into a prompt-ready text block.
 *
 * Output structure:
 *   ## Strategy Knowledge Context
 *
 *   The following knowledge is supporting evidence and pattern reference.
 *   Use it to inform the strategy, but make an independent strategic judgment.
 *
 *   #### Primary Knowledge 1: {name}
 *   Status: {status} | Category: {category} | Confidence: {confidence}
 *
 *   {text}
 *
 *   #### Supporting Knowledge 1: {name}
 *   ...
 *
 * Empty context produces:
 *   ## Strategy Knowledge Context
 *
 *   No relevant strategy knowledge was retrieved.
 *
 * @param context - StrategyKnowledgeContext produced by retrieveStrategyKnowledgeContext
 * @returns Prompt-ready strategy knowledge block (always non-empty string)
 */
export function serializeStrategyKnowledgeContext(
  context: StrategyKnowledgeContext
): string {
  const { primaryKnowledge, supportingKnowledge } = context

  // Empty result → stable placeholder
  if (primaryKnowledge.length === 0 && supportingKnowledge.length === 0) {
    return '## Strategy Knowledge Context\n\nNo relevant strategy knowledge was retrieved.'
  }

  const lines: string[] = [
    '## Strategy Knowledge Context',
    '',
    'The following knowledge is supporting evidence and pattern reference.',
    'Validated knowledge is verified.',
    'Candidate knowledge is unverified and should not be represented as confirmed fact.',
    'Use it to inform the strategy, but make an independent strategic judgment for the topic.',
    '',
  ]

  // Primary Knowledge
  if (primaryKnowledge.length > 0) {
    lines.push('---', '', '### Primary Knowledge', '')
    primaryKnowledge.forEach((item, index) => {
      lines.push(...serializeStrategyItem('primary', index + 1, item))
    })
  }

  // Supporting Knowledge
  if (supportingKnowledge.length > 0) {
    lines.push('---', '', '### Supporting Knowledge', '')
    supportingKnowledge.forEach((item, index) => {
      lines.push(...serializeStrategyItem('supporting', index + 1, item))
    })
  }

  return lines.join('\n')
}

/**
 * Serialize a single StrategyKnowledgeItem into prompt lines.
 *
 * Fields exposed to LLM:
 *   - heading with name
 *   - Status (validated/candidate)
 *   - Category
 *   - Confidence
 *   - Similarity (toFixed(2))
 *   - Text (original content, never modified)
 *
 * Fields NOT exposed (internal/infrastructure):
 *   - knowledgeId (excluded by P0.3.8.1 contract)
 *   - retrievalReason (excluded by P0.3.8.1 contract)
 *   - threshold, topK, embedding (retrieval internals)
 */
function serializeStrategyItem(
  group: 'primary' | 'supporting',
  index: number,
  item: StrategyKnowledgeItem
): string[] {
  const lines: string[] = []
  const heading = `#### ${group === 'primary' ? 'Primary' : 'Supporting'} Knowledge ${index}: ${item.name}`

  lines.push(heading)
  lines.push(
    `Status: ${item.status} | Category: ${item.category} | Confidence: ${item.confidence}`
  )
  lines.push(`Similarity: ${item.similarity.toFixed(2)}`)

  if (item.text && item.text.length > 0) {
    lines.push('')
    lines.push(item.text)
  }

  lines.push('')
  return lines
}
