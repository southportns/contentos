/**
 * P0.6.2 — Context Retriever (Contract + Knowledge Implementation)
 *
 * Retrieves ContextObjects from various data sources.
 *
 * Architecture Position:
 *   Retriever is responsible for "where to find context".
 *   It is SEPARATE from the Assembler which decides "which contexts to include".
 *
 * Design Principles:
 *   1. Separation of Concerns — Retrieval ≠ Assembly
 *   2. Graceful Degradation — retriever failure = empty result, never throw
 *   3. Adapter-based — MUST return ContextObjects, not raw entities
 *   4. Contract-first — interface is stable, implementations can evolve
 *
 * Non-goals:
 *   - Not implementing all retrievers (only Knowledge in P0.6.2)
 *   - Not caching across calls (that is future optimization)
 *   - Not implementing Topic/Project direct repository calls (if existing
 *     repositories already work, the calling layer converts to Context)
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type { RetrievalRequest, ContextRetriever } from './types';
import { createKnowledgeContext } from '../context-factory';
import type { KnowledgeContextObject } from '../context-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Knowledge Retriever
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for the Knowledge Retriever.
 */
export interface KnowledgeRetrieverOptions {
  /**
   * Custom knowledge retriever function.
   * If not provided, uses the default knowledge context builder.
   *
   * This allows injection of mock retrievers for testing.
   */
  retriever?: (query: string) => Promise<ContextObject[]>;

  /**
   * Fallback contexts when retrieval fails.
   */
  fallback?: ContextObject[];
}

/**
 * Knowledge Retriever — retrieves knowledge contexts from the knowledge layer.
 *
 * Wraps the existing knowledge retrieval infrastructure and converts
 * results to ContextObjects.
 *
 * Graceful degradation: on any failure, returns empty array (never throws).
 */
export class KnowledgeRetriever implements ContextRetriever {
  readonly kind: ContextKind = 'knowledge';

  private retriever?: (query: string) => Promise<ContextObject[]>;
  private fallback: ContextObject[];

  constructor(options?: KnowledgeRetrieverOptions) {
    this.retriever = options?.retriever;
    this.fallback = options?.fallback ?? [];
  }

  /**
   * Retrieve knowledge contexts.
   *
   * If a custom retriever is provided, uses that.
   * Otherwise returns fallback (empty by default in P0.6.2 since
   * the actual semantic retrieval requires API keys).
   *
   * @param request - Retrieval request (query + scope)
   * @return ContextObjects of kind 'knowledge'
   */
  async retrieve(request: RetrievalRequest): Promise<ContextObject[]> {
    try {
      if (this.retriever) {
        const query = request.query ?? '';
        return await this.retriever(query);
      }
      // P0.6.2: Without a custom retriever, return fallback
      // (semantic retrieval requires API keys, deferred to integration)
      return this.fallback;
    } catch {
      // Graceful degradation — knowledge retrieval never blocks assembly
      return this.fallback;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory: Create Knowledge Context from KnowledgeContext
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a KnowledgeContext (from the knowledge layer) into a ContextObject.
 *
 * This is the bridge between the existing KnowledgeContext type
 * and the ContextOS ContextObject format.
 *
 * @param kc - KnowledgeContext from retrieval
 * @param sourceId - Source identifier
 * @return ContextObject<KnowledgeContext>
 */
export function knowledgeContextToObject(
  kc: Parameters<typeof createKnowledgeContext>[0],
  sourceId?: string
): KnowledgeContextObject {
  return createKnowledgeContext(kc, {
    provenance: {
      source: sourceId ?? 'knowledge_retrieval',
      sourceType: 'knowledge',
    },
  });
}
