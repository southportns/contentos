/**
 * P0.2.3 — Knowledge Store
 *
 * Central interface for accessing ContextOS knowledge.
 * All upper layers should use this store, not directly parse JSON.
 *
 * Provides:
 * - search(): Full retrieval pipeline (filter → rank → top K)
 * - getById(): Get single KU by ID
 * - getValidated(): Get all validated KUs
 * - getCandidates(): Get all candidate KUs
 * - getByCategory(): Get KUs by category
 * - getByLevel(): Get KUs by knowledge level
 */

import {
  CanonicalKnowledgeUnit,
  KnowledgeRetrievalResponse,
  KnowledgeQuery,
  KnowledgeCategory,
  KnowledgeLevel,
  DEFAULT_QUERY,
} from './types';
import { KNOWLEDGE_UNITS } from './knowledge-data';
import { buildIndex, buildIndexEntry } from './knowledge-index';
import { applyFilterPipeline } from './knowledge-filters';
import { retrieve } from './knowledge-retriever';

// ─── KnowledgeStore Class ────────────────────────────────────────────────────

export class KnowledgeStore {
  private units: CanonicalKnowledgeUnit[];
  private index: ReturnType<typeof buildIndex>;

  constructor(units: CanonicalKnowledgeUnit[] = KNOWLEDGE_UNITS) {
    this.units = units;
    this.index = buildIndex(units);
  }

  /**
   * Full search pipeline: Filter → Rank → Top K.
   */
  search(query: KnowledgeQuery): KnowledgeRetrievalResponse {
    // 1. Determine filter options
    const includeCandidates =
      query.include_candidates ?? DEFAULT_QUERY.include_candidates;

    // 2. Apply metadata + safety filters on the source units
    const filteredUnits = applyFilterPipeline(this.units, {
      includeCandidates,
      levels: query.knowledge_level,
      categories: query.category,
      minConfidence: query.confidence,
    });

    // 3. Build a temporary index from filtered units
    const filteredIndex = filteredUnits.map(buildIndexEntry);

    // 4. Retrieve and rank
    return retrieve(filteredIndex, {
      ...query,
      include_candidates: includeCandidates,
    });
  }

  /**
   * Get a single KU by its ID.
   */
  getById(id: string): CanonicalKnowledgeUnit | undefined {
    return this.units.find((u) => u.knowledge_id === id);
  }

  /**
   * Get all validated KUs.
   */
  getValidated(): CanonicalKnowledgeUnit[] {
    return this.units.filter((u) => u.status === 'validated');
  }

  /**
   * Get all candidate KUs.
   */
  getCandidates(): CanonicalKnowledgeUnit[] {
    return this.units.filter((u) => u.status === 'candidate');
  }

  /**
   * Get KUs by category.
   */
  getByCategory(category: KnowledgeCategory): CanonicalKnowledgeUnit[] {
    return this.units.filter((u) => u.category === category);
  }

  /**
   * Get KUs by knowledge level.
   */
  getByLevel(level: KnowledgeLevel): CanonicalKnowledgeUnit[] {
    return this.units.filter((u) => u.knowledge_level === level);
  }

  /**
   * Get total count of KUs.
   */
  get size(): number {
    return this.units.length;
  }

  /**
   * Get all KUs (for advanced use).
   */
  getAll(): CanonicalKnowledgeUnit[] {
    return [...this.units];
  }

  /**
   * Get the store's index (for diagnostics).
   */
  getIndex(): ReturnType<typeof buildIndex> {
    return [...this.index];
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

/**
 * Default singleton Knowledge Store instance.
 * Import this for direct use in API routes and services.
 */
export const knowledgeStore = new KnowledgeStore();
