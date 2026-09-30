/**
 * P0.6.3.2.3 — Memory Context Retriever
 *
 * Adapts the Memory Layer's MemoryRetriever to the Context Assembly's
 * ContextRetriever interface, enabling persistent memories to participate
 * in the standard Context Assembly pipeline.
 *
 * Architecture Position:
 *
 *   RetrievalRequest (kind=memory)
 *         ↓
 *   MemoryContextRetriever (this file)
 *         ↓
 *   MemoryRetriever.retrieve()
 *         ↓
 *   MemoryRecord[]
 *         ↓
 *   memoryRecordsToContexts()
 *         ↓
 *   ContextObject<MemoryContextPayload>[]
 *
 * Design Principles:
 *   1. Implements ContextRetriever interface — no second abstraction
 *   2. Delegates to existing MemoryRetriever — no duplicate retrieval logic
 *   3. Uses existing memoryRecordsToContexts() — no second conversion path
 *   4. Graceful degradation — never throws, returns [] on failure
 *   5. Preserves full provenance through the Memory → Context bridge
 *
 * Scope Mapping:
 *   RetrievalRequest fields map to MemoryRetrievalRequest:
 *   - projectId → projectId (filter boundary)
 *   - topicId → topicId (filter boundary)
 *   - query → query (passed through, currently unused by DB retriever)
 *   - limit → policy.maxResults (mapped at assembly layer)
 *
 * Owner ID handling:
 *   The ownerId is NOT part of the RetrievalRequest contract — it is
 *   injected at the assembly layer (assembleContextsWithMemory) and passed
 *   as additional context to the retrieve() call via the request parameter.
 *   This maintains the separation: RetrievalRequest handles context filtering,
 *   while the assembly layer handles security boundaries.
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type { RetrievalRequest, ContextRetriever } from './types';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import type { MemoryRetrievalRequest } from '@/memory/memory-retriever';
import type { MemoryContextPayload } from '@/memory/memory-types';
import { memoryRecordsToContexts } from '@/memory/memory-utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Extended Retrieval Request (internal)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extended retrieval request that includes Memory-specific fields.
 *
 * The standard RetrievalRequest is the public contract for ContextRetriever.
 * This extension adds Memory-specific parameters needed for security filtering.
 *
 * This is NOT exported as a new public type — it's an internal mechanism
 * for passing Memory-specific parameters through the retrieval pipeline.
 */
export interface MemoryRetrievalParams {
  /** Owner ID boundary — mandatory for persistent Memory retrieval */
  ownerId: string;

  /** Scope override (explicit scope takes precedence over inference) */
  scope?: MemoryRetrievalRequest['scope'];

  /** Policy override for memory retrieval (confidence/importance/age limits) */
  policy?: MemoryRetrievalRequest['policy'];

  /** Maximum number of memory results to retrieve */
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Context Retriever
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * MemoryContextRetriever — bridges Memory Layer retrieval to Context Assembly.
 *
 * Implements the ContextRetriever interface so that Memory-backed context
 * retrieval is a drop-in replacement for other retrievers (e.g., KnowledgeRetriever).
 *
 * Usage:
 *   const memoryRetriever = new DatabaseMemoryRetriever(new PrismaMemoryStore());
 *   const retriever = new MemoryContextRetriever(memoryRetriever);
 *   const contexts = await retriever.retrieve(request, { ownerId: 'user_1' });
 */
export class MemoryContextRetriever implements ContextRetriever {
  readonly kind: ContextKind = 'memory';

  private _memoryRetriever: MemoryRetriever;

  /**
   * Create a new MemoryContextRetriever.
   *
   * @param memoryRetriever - The MemoryRetriever implementation (Database or InMemory)
   */
  constructor(memoryRetriever: MemoryRetriever) {
    this._memoryRetriever = memoryRetriever;
  }

  /**
   * Retrieve memory records and convert them to ContextObjects.
   *
   * Translates the RetrievalRequest into a MemoryRetrievalRequest,
   * executes the retrieval, and converts results to ContextObjects.
   *
   * Graceful degradation: on ANY failure, returns [].
   * This ensures memory retrieval NEVER breaks the Context Assembly pipeline.
   *
   * @param request - Standard retrieval request (kind should be 'memory')
   * @param params - Memory-specific parameters (ownerId mandatory)
   * @return ContextObjects of kind 'memory', or [] on failure
   */
  async retrieve(
    request: RetrievalRequest,
    params?: MemoryRetrievalParams
  ): Promise<ContextObject<MemoryContextPayload>[]> {
    try {
      // Build MemoryRetrievalRequest from standard params + memory-specific params
      const memoryRequest: MemoryRetrievalRequest = {
        ownerId: params?.ownerId,
        projectId: request.projectId,
        topicId: request.topicId,
        scope: params?.scope,
        policy: buildMemoryPolicy(params),
        query: request.query,
      };

      // Delegate to Memory Retriever
      const records = await this._memoryRetriever.retrieve(memoryRequest);

      // Convert to ContextObjects using existing bridge function
      return memoryRecordsToContexts(records);
    } catch {
      // Graceful degradation — memory retrieval NEVER blocks assembly
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build memory policy from retrieval parameters and limit.
 *
 * The limit parameter (from RetrievalRequest) maps to policy.maxResults
 * for the memory retriever.
 */
function buildMemoryPolicy(
  params?: MemoryRetrievalParams
): MemoryRetrievalRequest['policy'] {
  if (!params) return undefined;

  const policy: MemoryRetrievalRequest['policy'] = { ...params.policy };

  if (params.limit != null) {
    policy.maxResults = params.limit;
  }

  return Object.keys(policy).length > 0 ? policy : undefined;
}
