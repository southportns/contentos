/**
 * P0.3.8.1 — Strategy Knowledge Contract
 *
 * Defines the data contract for Knowledge Context consumption
 * by the Content Strategy layer.
 *
 * Architecture Position:
 *   SemanticRetrievalResponse
 *     ↓
 *   KnowledgeContextBuilder (P0.3.7.3)
 *     ↓
 *   KnowledgeContext (P0.3.7.2)
 *     ↓
 *   StrategyKnowledgeContext (this module)  ← Strategy-specific View
 *     ↓
 *   Strategy Skill → Prompt Assembly → LLM
 *
 * Design Principles:
 *   1. Minimal: only expose fields relevant to strategy decisions
 *   2. Read-only: transformation never mutates source KnowledgeContext
 *   3. Status-preserving: validated/candidate never converted
 *   4. Retrieval-independent: no internal retrieval metadata exposed
 *   5. Prompt-independent: no serialization text embedded in contract
 *   6. Deterministic: same input → same output
 *   7. Pure function: no side effects, no I/O
 *
 * Non-responsibilities:
 *   - No retrieval orchestration (that is P0.3.8.2)
 *   - No prompt assembly (that is future integration)
 *   - No candidate filtering policy (that is retrieval layer)
 *   - No ranking or re-sorting
 *   - No new knowledge creation
 */

import type {
  KnowledgeCategory,
  KnowledgeLevel,
  KUStatus,
  ConfidenceLevel,
} from '../types';
import type { KnowledgeContext } from './knowledge-context-types';

// ─── Strategy Knowledge Item ───────────────────────────────────────────────

/**
 * A single Knowledge Unit as seen by the Strategy layer.
 *
 * This is a purposefully minimal view — only fields that support
 * strategy decisions are included. Internal IDs, retrieval metadata,
 * and infrastructure details are excluded.
 *
 * Field semantics:
 *   - name: display name for strategy reference
 *   - text: original knowledge content (never modified, never summarized)
 *   - category: knowledge type (hook/structure/emotion/perspective/language/cognition/human_expression/ending)
 *   - knowledgeLevel: abstraction level (strategic_pattern/structural_pattern/expression_principle/surface_technique)
 *   - status: 'validated' or 'candidate' — MUST be preserved as-is, never converted
 *   - confidence: knowledge reliability (high/medium/low) — NOT query relevance
 *   - similarity: 0-1 relevance score from retrieval (query relevance, NOT truth score)
 *   - evidenceCount: optional evidence scale reference (not an automatic trust calculator)
 */
export interface StrategyKnowledgeItem {
  /** Knowledge Unit display name */
  name: string;

  /** Original knowledge text — never modified, never summarized */
  text: string;

  /** Knowledge category — reuses existing KnowledgeCategory type */
  category: KnowledgeCategory;

  /** Knowledge level — reuses existing KnowledgeLevel type */
  knowledgeLevel: KnowledgeLevel;

  /**
   * Knowledge Unit status — MUST be preserved as-is.
   * Never convert candidate → validated or vice versa.
   */
  status: KUStatus;

  /**
   * Knowledge Unit confidence level.
   * Represents knowledge reliability, NOT query relevance.
   * Reuses existing ConfidenceLevel type.
   */
  confidence: ConfidenceLevel;

  /**
   * Semantic similarity score from retrieval.
   * Range: 0.0 ≤ similarity ≤ 1.0
   * Represents QUERY RELEVANCE, not truth score.
   * Strategy MUST NOT interpret this as truth score.
   */
  similarity: number;

  /**
   * Number of evidence items associated with this Knowledge Unit.
   * Optional — provides evidence scale reference only.
   * MUST NOT be used as automatic trust calculator.
   */
  evidenceCount?: number;
}

// ─── Strategy Knowledge Context ───────────────────────────────────────────

/**
 * Strategy-specific view of KnowledgeContext.
 *
 * Carries only the information the Strategy layer needs.
 * Primary/Supporting classification is preserved from the builder.
 * No retrieval metadata, no timestamps, no internal IDs.
 *
 * Empty Context is valid:
 *   - primaryKnowledge = []
 *   - supportingKnowledge = []
 * When empty, Strategy continues with pure LLM reasoning.
 */
export interface StrategyKnowledgeContext {
  /**
   * Primary Knowledge Items — most relevant to the strategy query.
   * Preserved in Builder order (P0.3.7.3 deterministic sort).
   * May be empty.
   */
  primaryKnowledge: StrategyKnowledgeItem[];

  /**
   * Supporting Knowledge Items — secondary relevance.
   * Preserved in Builder order (P0.3.7.3 deterministic sort).
   * May be empty.
   */
  supportingKnowledge: StrategyKnowledgeItem[];
}

// ─── Transformation (Pure, Deterministic) ─────────────────────────────────

/**
 * Convert a KnowledgeContext into a StrategyKnowledgeContext.
 *
 * Guarantees:
 *   - Pure: no side effects, input never mutated
 *   - Deterministic: same input → same output
 *   - Order-preserving: primaryKnowledge and supportingKnowledge maintain Builder order
 *   - Status-preserving: validated/candidate never converted
 *   - Field-exclusion: knowledgeId, retrievalReason, retrieval metadata, timestamps excluded
 *
 * @param context - KnowledgeContext produced by buildKnowledgeContext
 * @returns StrategyKnowledgeContext — Strategy-specific view
 */
export function toStrategyKnowledgeContext(
  context: KnowledgeContext
): StrategyKnowledgeContext {
  return {
    primaryKnowledge: context.primaryKnowledge.map(mapContextItemToStrategyItem),
    supportingKnowledge: context.supportingKnowledge.map(
      mapContextItemToStrategyItem
    ),
  };
}

/**
 * Map a KnowledgeContextItem to StrategyKnowledgeItem.
 *
 * Pure field projection — no computation, no modification.
 */
function mapContextItemToStrategyItem(
  item: KnowledgeContext['primaryKnowledge'][number]
): StrategyKnowledgeItem {
  return {
    name: item.name,
    text: item.text,
    category: item.category,
    knowledgeLevel: item.knowledgeLevel,
    status: item.status,
    confidence: item.confidence,
    similarity: item.similarity,
    evidenceCount: item.evidenceCount,
  };
}
