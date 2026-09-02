/**
 * P0.3.1 — Semantic Index
 *
 * Builds a semantic index by embedding Knowledge Units.
 * Responsible only for: KU → Embedding → Vector Index.
 * Does NOT handle: filtering, ranking, business strategy, or LLM judgment.
 *
 * Safety rules are applied BEFORE indexing:
 * - Only 'validated' status KUs enter by default
 * - 'candidate' KUs only enter when include_candidates=true
 * - 'suspect' human_expression KUs NEVER enter
 */

import type {
  CanonicalKnowledgeUnit,
  KnowledgeCategory,
  KnowledgeLevel,
  ConfidenceLevel,
} from '../types';
import type {
  EmbeddingProvider,
  SemanticIndex,
  SemanticIndexEntry,
  SemanticIndexBuilderOptions,
} from './types';
import { filterByStatus, filterHumanExpression } from '../knowledge-filters';

// ─── Entry Builder ─────────────────────────────────────────────────────────

/**
 * Build the text representation of a KU for embedding.
 * This is the text that will be converted to a vector.
 *
 * Includes: name + description + abstract_pattern + function + principle + surface_forms
 * Excludes: evidence quotes (audit only, not for embedding)
 */
function buildEmbeddingText(unit: CanonicalKnowledgeUnit): string {
  const parts: string[] = [
    unit.name,
    unit.description,
    unit.abstract_pattern ?? '',
    unit.function ?? '',
    unit.principle ?? '',
    ...(unit.surface_forms ?? []),
  ];

  return parts.filter((p) => p.length > 0).join(' ');
}

/**
 * Build a single semantic index entry from a KU and its embedding vector.
 */
function buildSemanticEntry(
  unit: CanonicalKnowledgeUnit,
  vector: number[]
): SemanticIndexEntry {
  return {
    knowledge_id: unit.knowledge_id,
    vector,
    text: buildEmbeddingText(unit),
    name: unit.name,
    category: unit.category,
    knowledge_level: unit.knowledge_level,
    confidence: unit.confidence,
    status: unit.status,
    human_expression_verdict: unit.human_expression_verdict,
  };
}

// ─── Filter Pipeline (Reused from P0.2.3) ──────────────────────────────────

/**
 * Apply safety filters before indexing.
 * Reuses existing P0.2.3 filters to ensure consistency.
 */
function applySafetyFilters(
  units: CanonicalKnowledgeUnit[],
  includeCandidates: boolean
): CanonicalKnowledgeUnit[] {
  let result = units;

  // 1. Status filter (validated only by default)
  result = filterByStatus(result, includeCandidates);

  // 2. Human Expression safety filter
  //    - suspect → NEVER
  //    - unconfirmed → only with includeCandidates
  result = filterHumanExpression(result, includeCandidates);

  return result;
}

// ─── Semantic Index Builder ────────────────────────────────────────────────

/**
 * Build a complete semantic index from Knowledge Units.
 *
 * Pipeline:
 *   1. Apply safety filters (reuse P0.2.3)
 *   2. Generate embedding text for each KU
 *   3. Batch embed all texts
 *   4. Build index entries
 *
 * @param units - Knowledge Units to index
 * @param provider - Embedding provider (mock in P0.3.1, real in P0.3.2)
 * @param options - Builder options
 * @returns Complete semantic index
 */
export async function buildSemanticIndex(
  units: CanonicalKnowledgeUnit[],
  provider: EmbeddingProvider,
  options: SemanticIndexBuilderOptions = {}
): Promise<SemanticIndex> {
  const includeCandidates = options.include_candidates ?? false;

  // 1. Apply safety filters
  const filteredUnits = applySafetyFilters(units, includeCandidates);

  // 2. Generate embedding texts
  const embeddingTexts = filteredUnits.map(buildEmbeddingText);

  // 3. Batch embed
  const vectors = await provider.embedBatch(embeddingTexts);

  // 4. Build entries
  const entries: SemanticIndexEntry[] = filteredUnits.map((unit, i) =>
    buildSemanticEntry(unit, vectors[i])
  );

  return {
    entries,
    dimensions: provider.dimensions,
    provider_id: provider.id,
  };
}

/**
 * Check if a semantic index entry passes additional filter criteria.
 * Used by the retriever to apply runtime filters on pre-built index.
 */
export function entryMatchesFilters(
  entry: SemanticIndexEntry,
  options: {
    categories?: KnowledgeCategory[];
    levels?: KnowledgeLevel[];
    minConfidence?: ConfidenceLevel;
    minSimilarity?: number;
    similarity?: number;
  }
): boolean {
  // Category filter
  if (options.categories && options.categories.length > 0) {
    if (!options.categories.includes(entry.category)) {
      return false;
    }
  }

  // Level filter
  if (options.levels && options.levels.length > 0) {
    if (!options.levels.includes(entry.knowledge_level)) {
      return false;
    }
  }

  // Confidence filter
  if (options.minConfidence) {
    const order: Record<ConfidenceLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    if (order[entry.confidence] < order[options.minConfidence]) {
      return false;
    }
  }

  // Similarity threshold
  if (options.minSimilarity !== undefined && options.similarity !== undefined) {
    if (options.similarity < options.minSimilarity) {
      return false;
    }
  }

  return true;
}

// ─── Index Statistics ──────────────────────────────────────────────────────

/**
 * Compute statistics about a semantic index.
 */
export function computeIndexStats(index: SemanticIndex): {
  totalEntries: number;
  providerId: string;
  dimensions: number;
  categoryDistribution: Record<KnowledgeCategory, number>;
  levelDistribution: Record<KnowledgeLevel, number>;
} {
  const categoryDistribution: Partial<Record<KnowledgeCategory, number>> = {};
  const levelDistribution: Partial<Record<KnowledgeLevel, number>> = {};

  for (const entry of index.entries) {
    categoryDistribution[entry.category] = (categoryDistribution[entry.category] ?? 0) + 1;
    levelDistribution[entry.knowledge_level] = (levelDistribution[entry.knowledge_level] ?? 0) + 1;
  }

  return {
    totalEntries: index.entries.length,
    providerId: index.provider_id,
    dimensions: index.dimensions,
    categoryDistribution: categoryDistribution as Record<KnowledgeCategory, number>,
    levelDistribution: levelDistribution as Record<KnowledgeLevel, number>,
  };
}