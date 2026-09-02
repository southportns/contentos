/**
 * P0.2.3 — Knowledge Ranker
 *
 * Implements a deterministic, explainable ranking model.
 *
 * Score Formula:
 *   score = keyword_match * 0.35
 *         + name_match * 0.15
 *         + description_match * 0.15
 *         + category_match * 0.10
 *         + level_match * 0.10
 *         + confidence_score * 0.10
 *         + evidence_strength * 0.05
 *
 * All scores are deterministic for the same input.
 */

import {
  KnowledgeIndexEntry,
  KnowledgeRetrievalResult,
  RankingWeights,
  DEFAULT_RANKING_WEIGHTS,
  CONFIDENCE_SCORES,
  CATEGORY_SYNONYMS,
  KnowledgeCategory,
} from './types';

// ─── Match Scoring ───────────────────────────────────────────────────────────

/**
 * Compute keyword match score against search_text.
 * Returns { score: 0-1, matched_terms: string[] }.
 *
 * Score = (number of unique keywords matched) / (total unique keywords)
 */
function scoreKeywordMatch(
  searchText: string,
  keywords: string[]
): { score: number; matched_terms: string[] } {
  if (keywords.length === 0) {
    return { score: 0, matched_terms: [] };
  }

  const matched = keywords.filter((kw) => searchText.includes(kw.toLowerCase()));
  const uniqueMatched = [...new Set(matched)];
  const score = uniqueMatched.length / keywords.length;

  return { score: Math.min(score, 1), matched_terms: uniqueMatched };
}

/**
 * Compute name match score.
 * Checks if any keyword is a substring of the name.
 */
function scoreNameMatch(
  name: string,
  keywords: string[]
): number {
  if (keywords.length === 0) return 0;
  const lowerName = name.toLowerCase();
  const matched = keywords.filter((kw) => lowerName.includes(kw.toLowerCase()));
  return Math.min(matched.length / keywords.length, 1);
}

/**
 * Compute description match score.
 * Uses a longer field (search_text contains description).
 * We use the full search_text for this since description is a major component.
 */
function scoreDescriptionMatch(
  searchText: string,
  keywords: string[]
): number {
  // search_text includes description as primary content
  if (keywords.length === 0) return 0;
  const matched = keywords.filter((kw) => searchText.includes(kw.toLowerCase()));
  return Math.min(new Set(matched).size / keywords.length, 1);
}

/**
 * Compute category match score.
 */
function scoreCategoryMatch(
  category: KnowledgeCategory,
  keywords: string[]
): number {
  const synonyms = CATEGORY_SYNONYMS[category] ?? [];
  const allTerms = [category, ...synonyms];
  const matched = keywords.filter((kw) =>
    allTerms.some((term) => term.includes(kw.toLowerCase()) || kw.toLowerCase().includes(term))
  );
  return matched.length > 0 ? Math.min(matched.length / 2, 1) : 0;
}

/**
 * Compute level match score.
 * Simplified: returns 0.5 if any level-related term matches, driven mainly by confidence.
 */
function scoreLevelMatch(): number {
  // Level match is less about topic relevance and more about structural alignment
  // We use a neutral score here; level filtering is done at the filter stage, not ranking
  return 0.5;
}

// ─── Ranking Functions ────────────────────────────────────────────────────────

/**
 * Score a single index entry against query keywords.
 * Returns a partial result with score components for debugging.
 */
function scoreEntry(
  entry: KnowledgeIndexEntry,
  keywords: string[],
  weights: RankingWeights
): KnowledgeRetrievalResult & {
  debug: {
    keyword_match_score: number;
    name_match_score: number;
    description_match_score: number;
    category_match_score: number;
    level_match_score: number;
    confidence_score_value: number;
    evidence_strength_value: number;
  };
} {
  const kwResult = scoreKeywordMatch(entry.search_text, keywords);
  const nameScore = scoreNameMatch(entry.name, keywords);
  const descScore = scoreDescriptionMatch(entry.search_text, keywords);
  const catScore = scoreCategoryMatch(entry.category, keywords);
  const levelScore = scoreLevelMatch();
  const confScore = CONFIDENCE_SCORES[entry.confidence];
  const evStrength = entry.evidence_strength;

  const totalScore =
    kwResult.score * weights.keyword_match +
    nameScore * weights.name_match +
    descScore * weights.description_match +
    catScore * weights.category_match +
    levelScore * weights.level_match +
    confScore * weights.confidence_score +
    evStrength * weights.evidence_strength;

  const roundedScore = Math.round(totalScore * 100) / 100;

  return {
    knowledge_id: entry.knowledge_id,
    score: Math.min(roundedScore, 1),
    matched_terms: kwResult.matched_terms,
    knowledge_level: entry.knowledge_level,
    category: entry.category,
    confidence: entry.confidence,
    status: entry.status,
    retrieval_reason: buildRetrievalReason(entry, kwResult.matched_terms, roundedScore),
    debug: {
      keyword_match_score: kwResult.score,
      name_match_score: nameScore,
      description_match_score: descScore,
      category_match_score: catScore,
      level_match_score: levelScore,
      confidence_score_value: confScore,
      evidence_strength_value: evStrength,
    },
  };
}

/**
 * Build a human-readable retrieval reason.
 */
function buildRetrievalReason(
  entry: KnowledgeIndexEntry,
  matchedTerms: string[],
  score: number
): string {
  if (score === 0 || matchedTerms.length === 0) {
    return '低相关匹配';
  }

  const parts: string[] = [];

  if (matchedTerms.length > 0) {
    parts.push(`关键词匹配: ${matchedTerms.slice(0, 5).join('、')}`);
  }

  parts.push(`知识等级: ${translateLevel(entry.knowledge_level)}`);
  parts.push(`分类: ${translateCategory(entry.category)}`);

  if (entry.confidence === 'high') {
    parts.push('高可信度');
  }

  return parts.join(' | ');
}

function translateLevel(level: string): string {
  const map: Record<string, string> = {
    strategic_pattern: '战略模式',
    structural_pattern: '结构模式',
    expression_principle: '表达原则',
    surface_technique: '表面技巧',
  };
  return map[level] ?? level;
}

function translateCategory(cat: string): string {
  const map: Record<string, string> = {
    hook: '开头技巧',
    structure: '结构模式',
    emotion: '情绪模式',
    perspective: '视角模式',
    language: '语言技巧',
    cognition: '认知模式',
    human_expression: '真人表达',
    ending: '结尾技巧',
  };
  return map[cat] ?? cat;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Rank a list of index entries against query keywords.
 * Returns results sorted by score descending, tied scores broken by:
 * 1. confidence (high > medium > low)
 * 2. evidence_strength (higher first)
 * 3. knowledge_id (alphabetical)
 */
export function rankEntries(
  entries: KnowledgeIndexEntry[],
  keywords: string[],
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS
): KnowledgeRetrievalResult[] {
  const scored = entries.map((entry) => scoreEntry(entry, keywords, weights));

  // Filter: only include entries with at least one keyword match
  // This prevents irrelevant items from appearing due to level/evidence base scores
  const matched = scored.filter((entry) => entry.matched_terms.length > 0);

  const sorted = matched.sort((a, b) => {
    // 1. Score descending
    if (b.score !== a.score) return b.score - a.score;

    // 2. Confidence descending
    const confOrder = { high: 3, medium: 2, low: 1 };
    const confDiff = confOrder[b.confidence] - confOrder[a.confidence];
    if (confDiff !== 0) return confDiff;

    // 3. Evidence strength descending
    // (need to recompute since we lost this after scoreEntry)
    if (b.debug.evidence_strength_value !== a.debug.evidence_strength_value) {
      return b.debug.evidence_strength_value - a.debug.evidence_strength_value;
    }

    // 4. Knowledge ID ascending (deterministic tiebreaker)
    return a.knowledge_id.localeCompare(b.knowledge_id);
  });

  // Strip debug info from final results
  return sorted.map((item) => {
    const { debug: __unused_debug, ...result } = item;
    void __unused_debug;
    return result;
  });
}
