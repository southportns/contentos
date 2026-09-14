/**
 * P0.3.7.4 — Knowledge Context Serializer
 *
 * Transforms KnowledgeContext into LLM prompt-ready text.
 *
 * Architecture Position:
 *   SemanticRetrievalResponse
 *     ↓
 *   KnowledgeContextBuilder (P0.3.7.3)
 *     ↓
 *   KnowledgeContext
 *     ↓
 *   Knowledge Context Serializer (this module)
 *     ↓
 *   Skill → Prompt Assembly → LLM
 *
 * Responsibilities:
 *   1. Consume the existing KnowledgeContext contract (read-only)
 *   2. Produce deterministic, human-readable, low-noise prompt text
 *   3. Distinguish validated vs candidate status explicitly
 *   4. Pass through wasTruncated without recomputation
 *   5. Preserve Builder ordering (never re-sort)
 *   6. Never mutate the input
 *
 * Non-responsibilities:
 *   - No retrieval, ranking, filtering, or selection logic
 *   - No prompt strategy / instruction engineering
 *   - No LLM calls
 *   - No recomputation of similarity, confidence, or wasTruncated
 *
 * Design Constraints:
 *   - Deterministic: same input → identical output
 *     (no Date.now, no random, no unstable ordering)
 *   - Pure: no side effects, input is never mutated
 *   - Low-noise: retrieval internals (threshold, topK, method,
 *     retrievalReason, knowledgeId, timestamps, contract version)
 *     are NOT exposed to the LLM
 */

import type {
  KnowledgeContext,
  KnowledgeContextItem,
} from './knowledge-context-types';

// ─── Constants ──────────────────────────────────────────────────────────────

const HEADER = '## Knowledge Context';

const INTRO_LINES = [
  'The following knowledge was retrieved from the validated knowledge base.',
  'Use it as supporting knowledge when relevant.',
  'Do not invent facts that are not present here.',
] as const;

const EMPTY_CONTEXT_TEXT = `${HEADER}

No relevant knowledge was retrieved.
`;

const TRUNCATION_NOTE =
  'Note: Retrieval results were truncated according to maxItems.';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a possibly-nullish string field.
 * Returns trimmed string, or empty string for null/undefined/non-string.
 */
function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Format a similarity score deterministically.
 * Returns null when the value is not a finite number.
 *
 * Uses toFixed(2) — preserves the raw 0-1 scale.
 * Never converts to percentage, never recalculates.
 */
function formatSimilarity(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}

/**
 * Format an evidence count. Returns null when not a finite number.
 */
function formatCount(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return String(value);
}

// ─── Item Serialization ─────────────────────────────────────────────────────

/**
 * Serialize a single KnowledgeContextItem into a prompt block.
 *
 * Field policy:
 *   - name: used as heading suffix when present
 *   - status: always explicit (validated / candidate) — never converted
 *   - confidence / similarity / category / level / evidenceCount:
 *     emitted only when present and valid (no "undefined"/"null" leakage)
 *   - text: emitted verbatim when non-empty; Content section omitted when empty
 *
 * Retrieval internals (knowledgeId, retrievalReason) are intentionally omitted.
 */
function serializeItem(
  item: KnowledgeContextItem,
  role: 'Primary' | 'Supporting',
  index: number
): string {
  const name = clean(item.name);
  const heading = name
    ? `### ${role} Knowledge ${index}: ${name}`
    : `### ${role} Knowledge ${index}`;

  const lines: string[] = [heading, ''];

  const status = clean(item.status);
  if (status) lines.push(`Status: ${status}`);

  const confidence = clean(item.confidence);
  if (confidence) lines.push(`Confidence: ${confidence}`);

  const similarity = formatSimilarity(item.similarity);
  if (similarity !== null) lines.push(`Similarity: ${similarity}`);

  const category = clean(item.category);
  if (category) lines.push(`Category: ${category}`);

  const level = clean(item.knowledgeLevel);
  if (level) lines.push(`Level: ${level}`);

  const evidenceCount = formatCount(item.evidenceCount);
  if (evidenceCount !== null) lines.push(`Evidence Count: ${evidenceCount}`);

  const text = clean(item.text);
  if (text) {
    lines.push('', 'Content:', text);
  }

  return lines.join('\n');
}

// ─── Main Serializer ────────────────────────────────────────────────────────

/**
 * Serialize a KnowledgeContext into LLM prompt-ready text.
 *
 * Guarantees:
 *   - Deterministic: identical input produces identical output
 *   - Read-only: the input object is never mutated
 *   - Order-preserving: items appear exactly in Builder order
 *     (primaryKnowledge first, then supportingKnowledge)
 *   - Empty-safe: empty context returns a stable placeholder text
 *
 * @param context - KnowledgeContext produced by buildKnowledgeContext
 * @returns Prompt-ready text block
 */
export function serializeKnowledgeContext(context: KnowledgeContext): string {
  const primary = context.primaryKnowledge ?? [];
  const supporting = context.supportingKnowledge ?? [];

  // Empty context: stable placeholder, no exception, no undefined leakage
  if (primary.length === 0 && supporting.length === 0) {
    return EMPTY_CONTEXT_TEXT;
  }

  const sections: string[] = [HEADER, '', ...INTRO_LINES];

  primary.forEach((item, i) => {
    sections.push('', serializeItem(item, 'Primary', i + 1));
  });

  supporting.forEach((item, i) => {
    sections.push('', serializeItem(item, 'Supporting', i + 1));
  });

  // Retrieval metadata — only what the model needs to know.
  // wasTruncated is passed through from constraints; never recomputed.
  const constraints = context.constraints;
  const selectedCount =
    typeof context.selectedCount === 'number' &&
    Number.isFinite(context.selectedCount)
      ? context.selectedCount
      : primary.length + supporting.length;

  sections.push(
    '',
    '### Retrieval Metadata',
    '',
    `Items: ${selectedCount}`,
    `Max Items: ${constraints.maxItems}`,
    `Was Truncated: ${constraints.wasTruncated}`
  );

  if (constraints.wasTruncated) {
    sections.push(TRUNCATION_NOTE);
  }

  return sections.join('\n') + '\n';
}
