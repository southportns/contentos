/**
 * P0.2.3 — Knowledge Index
 *
 * Builds a searchable index from Knowledge Units.
 * Supports filtering by multiple metadata dimensions and text-based retrieval.
 */

import {
  CanonicalKnowledgeUnit,
  KnowledgeIndexEntry,
  KnowledgeCategory,
  KnowledgeLevel,
  KUStatus,
  ConfidenceLevel,
} from './types';

// ─── Text Normalization ──────────────────────────────────────────────────────

/**
 * Normalize text for indexing: lowercase, trim whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}
import { countTrustedEvidence } from './knowledge-filters';

// ─── Index Builder ───────────────────────────────────────────────────────────

/**
 * Compute evidence strength score for a single KU.
 *
 * Formula:
 *   evidence_strength = min(unique_content_count / 5, 1) * 0.7
 *                     + trusted_evidence_bonus
 *
 * Where trusted_evidence_bonus = min(trusted_count / 3, 1) * 0.3
 *
 * Returns a value between 0 and 1.
 */
export function computeEvidenceStrength(unit: CanonicalKnowledgeUnit): number {
  const uniqueContentCount = unit.evidence.unique_content_count;
  const trustedCount = countTrustedEvidence(unit);

  const uniqueScore = Math.min(uniqueContentCount / 5, 1) * 0.7;
  const trustedScore = Math.min(trustedCount / 3, 1) * 0.3;

  return Math.round((uniqueScore + trustedScore) * 100) / 100;
}

/**
 * Build search_text for a KU by concatenating searchable fields.
 * Does NOT include evidence quotes (evidence is for audit, not search).
 */
function buildSearchText(unit: CanonicalKnowledgeUnit): string {
  const parts: string[] = [
    unit.name,
    unit.description,
    unit.abstract_pattern ?? '',
    unit.function ?? '',
    unit.principle ?? '',
    ...(unit.surface_forms ?? []),
  ];

  return parts.filter((p) => p.length > 0).join(' ').toLowerCase();
}

/**
 * Build an index entry from a single Knowledge Unit.
 */
export function buildIndexEntry(unit: CanonicalKnowledgeUnit): KnowledgeIndexEntry {
  return {
    knowledge_id: unit.knowledge_id,
    name: unit.name,
    category: unit.category,
    knowledge_level: unit.knowledge_level,
    status: unit.status,
    confidence: unit.confidence,
    human_expression_verdict: unit.human_expression_verdict,
    search_text: buildSearchText(unit),
    search_name: normalizeText(unit.name),
    search_description: normalizeText(unit.description),
    search_pattern: normalizeText(unit.abstract_pattern ?? ''),
    trusted_evidence_count: countTrustedEvidence(unit),
    unique_content_count: unit.evidence.unique_content_count,
    evidence_strength: computeEvidenceStrength(unit),
  };
}

/**
 * Build the complete index from a list of Knowledge Units.
 */
export function buildIndex(units: CanonicalKnowledgeUnit[]): KnowledgeIndexEntry[] {
  return units.map(buildIndexEntry);
}

// ─── Keyword Extraction ─────────────────────────────────────────────────────

/**
 * Extract keywords from a topic string.
 * Supports both space-delimited English/Chinese and continuous Chinese text (via bigram segmentation).
 *
 * Note: Category/level synonym expansion is intentionally NOT performed here.
 * Category and level intent matching is handled by the dedicated scoring functions
 * (scoreCategoryMatch, scoreLevelMatch) in the ranker, which use proper boundary-aware matching.
 * Expanding all synonyms at keyword extraction level causes false positives for unrelated queries.
 */
export function extractKeywords(topic: string): string[] {
  const lower = topic.toLowerCase();
  const keywords: string[] = [];

  // Direct topic tokens (split on common delimiters)
  const tokens = lower
    .split(/[\s,，、；;。．\.\/\(\)（）]+/)
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (/^[a-z]+$/.test(token)) {
      // Pure English token — add as-is
      keywords.push(token);
    } else if (/^[一-龥]+$/.test(token)) {
      // Pure Chinese token — add whole token
      keywords.push(token);
      // Generate bigrams for better Chinese matching
      if (token.length >= 2) {
        for (let i = 0; i < token.length - 1; i++) {
          keywords.push(token.slice(i, i + 2));
        }
      }
    } else {
      // Mixed token — add as-is
      keywords.push(token);
    }
  }

  // Deduplicate and filter: only keep keywords with length >= 2
  // Single-char keywords cause excessive false positives
  const unique = [...new Set(keywords)];
  return unique.filter((kw) => kw.length >= 2);
}

// ─── Filter Helpers ──────────────────────────────────────────────────────────

/**
 * Check if an index entry matches category filter.
 */
export function matchesCategory(
  entry: KnowledgeIndexEntry,
  categories: KnowledgeCategory[]
): boolean {
  return categories.includes(entry.category);
}

/**
 * Check if an index entry matches knowledge level filter.
 */
export function matchesLevel(
  entry: KnowledgeIndexEntry,
  levels: KnowledgeLevel[]
): boolean {
  return levels.includes(entry.knowledge_level);
}

/**
 * Check if an index entry matches status filter.
 */
export function matchesStatus(
  entry: KnowledgeIndexEntry,
  status: KUStatus | 'all'
): boolean {
  if (status === 'all') return true;
  return entry.status === status;
}

/**
 * Check if an index entry matches confidence filter.
 */
export function matchesConfidence(
  entry: KnowledgeIndexEntry,
  minConfidence: ConfidenceLevel
): boolean {
  const order: Record<ConfidenceLevel, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  return order[entry.confidence] >= order[minConfidence];
}

/**
 * Check if a human expression entry is safe for default retrieval.
 */
export function isHumanExpressionSafe(entry: KnowledgeIndexEntry): boolean {
  if (entry.category !== 'human_expression') return true;
  const verdict = entry.human_expression_verdict;
  if (verdict === 'suspect') return false;
  return true;
}
