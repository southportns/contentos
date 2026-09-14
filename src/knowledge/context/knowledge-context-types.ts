/**
 * P0.3.7.2 — Knowledge Context Contract
 *
 * Defines the data contract between Semantic Retrieval and Generation.
 *
 * Architecture Position:
 *   SemanticRetrievalResponse
 *     ↓
 *   KnowledgeContextBuilder (P0.3.7.3)
 *     ↓
 *   KnowledgeContext
 *     ↓
 *   Knowledge Context Serializer (P0.3.7.4)
 *     ↓
 *   Skill → Prompt Assembly → LLM
 *
 * Design Principles:
 *   1. Reuse existing types (CanonicalKnowledgeUnit, Evidence, EvidenceGroup, etc.)
 *   2. No new knowledge creation — only reference existing Knowledge
 *   3. Full traceability: KnowledgeContextItem → knowledge_id → Evidence → Original Content
 *   4. Empty Context is valid
 *   5. Status (validated / candidate) preserved without conversion
 */

import type {
  KnowledgeCategory,
  KnowledgeLevel,
  KUStatus,
  ConfidenceLevel,
} from '../types';

// ─── Retrieval Metadata ─────────────────────────────────────────────────────

/**
 * Metadata about the retrieval operation that produced this context.
 *
 * Records the parameters used for retrieval. Production configuration
 * (threshold, topK, include_candidates) is managed by the Retrieval layer.
 * This interface only records what was actually used.
 */
export interface KnowledgeContextRetrievalMetadata {
  /** Retrieval method used (currently only 'semantic' is supported for KnowledgeContext) */
  method: 'semantic';

  /** Similarity threshold applied during retrieval */
  threshold: number;

  /** TopK parameter applied during retrieval */
  topK: number;

  /** Whether candidate Knowledge Units were included in retrieval */
  includeCandidates: boolean;

  /** Number of results returned by the retrieval service */
  retrievedCount: number;
}

// ─── Knowledge Context Item ─────────────────────────────────────────────────

/**
 * A single Knowledge Unit selected for inclusion in the generation context.
 *
 * This is a purposefully minimal view of a Knowledge Unit.
 * Full canonical data can be retrieved via knowledge_id if needed.
 */
export interface KnowledgeContextItem {
  /**
   * Knowledge Unit identifier.
   * Core traceability link: this ID connects generated content
   * back to the Knowledge Unit and its Evidence.
   */
  knowledgeId: string;

  /** Knowledge Unit display name */
  name: string;

  /**
   * Original knowledge text.
   * Never modified, never summarized, never rewritten.
   */
  text: string;

  /** Knowledge category (reuses existing KnowledgeCategory enum) */
  category: KnowledgeCategory;

  /** Knowledge level (reuses existing KnowledgeLevel enum) */
  knowledgeLevel: KnowledgeLevel;

  /** Confidence level from the source Knowledge Unit (not recalculated) */
  confidence: ConfidenceLevel;

  /**
   * Knowledge Unit status.
   * Must be preserved as-is. Never convert candidate → validated.
   */
  status: KUStatus;

  /**
   * Semantic similarity score from retrieval.
   * Preserved from SemanticRetrievalResult. Never recalculated.
   */
  similarity: number;

  /**
   * Human-readable explanation of why this item was retrieved.
   * Preserved from SemanticRetrievalResult.retrieval_reason.
   */
  retrievalReason: string;

  /**
   * Number of evidence items associated with this Knowledge Unit.
   * For traceability reference. Does not duplicate the Evidence objects.
   */
  evidenceCount: number;
}

// ─── Evidence Traceability ──────────────────────────────────────────────────

/**
 * Lightweight evidence traceability reference.
 *
 * Does not duplicate Evidence data model. Provides traceability linkage
 * without data duplication.
 */
export interface KnowledgeContextEvidence {
  /** Knowledge Unit identifier this evidence belongs to */
  knowledgeId: string;

  /** Evidence display quote (original, not modified) */
  quote: string;

  /** Evidence identifier for full retrieval */
  evidenceId: string;

  /** Source content identifier */
  contentId: string;

  /** Validation status from evidence (reuses existing Validation type) */
  validation: 'valid' | 'weak' | 'invalid';

  /** Evidence quality rating */
  quality: 'high' | 'medium' | 'low';

  /** Evidence trust level */
  trust: 'trusted' | 'caution' | 'excluded';
}

// ─── Constraints ────────────────────────────────────────────────────────────

/**
 * Constraints applied to this Knowledge Context.
 *
 * Minimal interface — only fields with current architectural meaning.
 */
export interface KnowledgeContextConstraints {
  /**
   * Whether candidate status Knowledge Units are present in this context.
   * Derived from retrieval parameters and item statuses.
   */
  hasCandidates: boolean;

  /**
   * Maximum number of Knowledge Items the builder was configured to select.
   * The actual count (selectedCount) may be lower if fewer items were retrieved.
   */
  maxItems: number;

  /**
   * Whether the context was truncated due to selection limits.
   * True if retrievedCount > selectedCount.
   */
  wasTruncated: boolean;
}

// ─── Metadata ───────────────────────────────────────────────────────────────

/**
 * Context metadata.
 *
 * KnowledgeContext is a Knowledge Reference Context, not a Generation Result.
 * Never stores: LLM output, generated content, model response, full prompts.
 */
export interface KnowledgeContextMetadata {
  /** Contract version for forward compatibility */
  version: string;

  /** ISO 8601 timestamp of context creation */
  createdAt: string;

  /** Source phase identifier */
  source: string;
}

// ─── KnowledgeContext (Main Contract) ───────────────────────────────────────

/**
 * KnowledgeContext — the bridge between Retrieval and Generation.
 *
 * This is the primary data contract for P0.3.7.
 * Skills consume this object (via Serializer) to inject knowledge into prompts.
 *
 * Empty Context is valid:
 *   - selectedCount = 0
 *   - primaryKnowledge = []
 *   - supportingKnowledge = []
 *   - evidence = []
 *
 * When empty, Generation continues normally without knowledge injection.
 */
export interface KnowledgeContext {
  /**
   * The query used for retrieval.
   * Preserved from SemanticRetrievalResponse.query.
   */
  query: string;

  /** Metadata about the retrieval operation */
  retrieval: KnowledgeContextRetrievalMetadata;

  /** Number of Knowledge Items actually selected for this context */
  selectedCount: number;

  /**
   * Primary Knowledge Items — most relevant to the generation query.
   * Classification determined by KnowledgeContextBuilder (P0.3.7.3).
   * May be empty.
   */
  primaryKnowledge: KnowledgeContextItem[];

  /**
   * Supporting Knowledge Items — secondary relevance.
   * Classification determined by KnowledgeContextBuilder (P0.3.7.3).
   * May be empty.
   */
  supportingKnowledge: KnowledgeContextItem[];

  /**
   * Evidence traceability references.
   * Provides traceability without duplicating Evidence data model.
   * May be empty.
   */
  evidence: KnowledgeContextEvidence[];

  /** Constraints applied during context construction */
  constraints: KnowledgeContextConstraints;

  /** Context metadata */
  metadata: KnowledgeContextMetadata;
}
