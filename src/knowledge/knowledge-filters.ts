/**
 * P0.2.3 — Knowledge Filters
 *
 * Implements the retrieval safety and metadata filtering pipeline.
 *
 * Pipeline:
 *   Query
 *    ↓
 *   Metadata Filter (status, level, category, confidence)
 *    ↓
 *   Human Expression Safety Filter
 *    ↓
 *   Keyword Match
 *    ↓
 *   Ranking
 *    ↓
 *   Top K
 */

import {
  CanonicalKnowledgeUnit,
  KnowledgeLevel,
  ConfidenceLevel,
  KnowledgeCategory,
} from './types';

// ─── Filter Functions ────────────────────────────────────────────────────────

/**
 * Filter KUs by status.
 * Default: only 'validated'. Candidates excluded unless include_candidates=true.
 */
export function filterByStatus(
  units: CanonicalKnowledgeUnit[],
  includeCandidates: boolean
): CanonicalKnowledgeUnit[] {
  if (includeCandidates) {
    return units;
  }
  return units.filter((u) => u.status === 'validated');
}

/**
 * Filter KUs by knowledge level.
 * If levels array is empty or undefined, no filtering is applied.
 */
export function filterByLevel(
  units: CanonicalKnowledgeUnit[],
  levels: KnowledgeLevel[] | undefined
): CanonicalKnowledgeUnit[] {
  if (!levels || levels.length === 0) {
    return units;
  }
  return units.filter((u) => levels.includes(u.knowledge_level));
}

/**
 * Filter KUs by category.
 * If categories array is empty or undefined, no filtering is applied.
 */
export function filterByCategory(
  units: CanonicalKnowledgeUnit[],
  categories: KnowledgeCategory[] | undefined
): CanonicalKnowledgeUnit[] {
  if (!categories || categories.length === 0) {
    return units;
  }
  return units.filter((u) => categories.includes(u.category));
}

/**
 * Filter KUs by confidence level.
 * Returns KUs with confidence >= the specified minimum.
 */
export function filterByConfidence(
  units: CanonicalKnowledgeUnit[],
  minConfidence: ConfidenceLevel
): CanonicalKnowledgeUnit[] {
  const order: Record<ConfidenceLevel, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const minVal = order[minConfidence];
  return units.filter((u) => order[u.confidence] >= minVal);
}

/**
 * Human Expression Safety Filter.
 *
 * Rules:
 * - category = human_expression AND verdict = suspect → EXCLUDED from default retrieval
 * - category = human_expression AND verdict = unconfirmed → treated as candidate
 * - category = human_expression AND verdict = confirmed → ALLOWED
 * - All other categories → ALLOWED
 *
 * When includeCandidates=false, unconfirmed human_expression KUs are excluded.
 */
export function filterHumanExpression(
  units: CanonicalKnowledgeUnit[],
  includeCandidates: boolean
): CanonicalKnowledgeUnit[] {
  return units.filter((u) => {
    if (u.category !== 'human_expression') {
      return true;
    }

    const verdict = u.human_expression_verdict;

    // suspect: never included by default
    if (verdict === 'suspect') {
      return false;
    }

    // unconfirmed: only included when candidates are included
    if (verdict === 'unconfirmed') {
      return includeCandidates;
    }

    // confirmed: always included
    return true;
  });
}

/**
 * Compute retrieval eligibility for evidence.
 *
 * Rules:
 * - evidence_trust = trusted → eligible = true
 * - evidence_trust = caution → eligible = false
 * - evidence_trust = excluded → eligible = false
 */
export function computeEvidenceRetrievalEligible(
  evidence_trust: string
): boolean {
  return evidence_trust === 'trusted';
}

/**
 * Count trusted evidence items for a KU.
 */
export function countTrustedEvidence(unit: CanonicalKnowledgeUnit): number {
  return unit.evidence.items.filter(
    (e) => computeEvidenceRetrievalEligible(e.evidence_trust)
  ).length;
}

/**
 * Combined filter pipeline.
 * Applies all metadata and safety filters in sequence.
 */
export function applyFilterPipeline(
  units: CanonicalKnowledgeUnit[],
  options: {
    includeCandidates: boolean;
    levels?: KnowledgeLevel[];
    categories?: KnowledgeCategory[];
    minConfidence?: ConfidenceLevel;
  }
): CanonicalKnowledgeUnit[] {
  let result = units;

  // 1. Status filter
  result = filterByStatus(result, options.includeCandidates);

  // 2. Human Expression safety filter
  result = filterHumanExpression(result, options.includeCandidates);

  // 3. Level filter
  result = filterByLevel(result, options.levels);

  // 4. Category filter
  result = filterByCategory(result, options.categories);

  // 5. Confidence filter
  if (options.minConfidence) {
    result = filterByConfidence(result, options.minConfidence);
  }

  return result;
}
