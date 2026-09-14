/**
 * P0.3.7.5 — Generation Knowledge Context Orchestration
 *
 * Server-side orchestration helper for the Generation Layer.
 *
 * Architecture Position (per P0.3.7.1 Reconnaissance §8.1):
 *   API Route (Orchestration)
 *     ↓
 *   retrieveKnowledgeContextForGeneration (this module)
 *     1. Semantic Retrieval (existing singleton service)
 *     2. KnowledgeContextBuilder (P0.3.7.3)
 *     ↓
 *   KnowledgeContext
 *     ↓
 *   Skill → serializeKnowledgeContext (P0.3.7.4) → Prompt Assembly → LLM
 *
 * Responsibilities:
 *   1. Execute semantic retrieval via the existing singleton service
 *   2. Build KnowledgeContext via the existing builder
 *   3. Graceful degradation: ANY retrieval failure → return null
 *      (Generation continues as pure LLM, never blocked)
 *
 * Non-responsibilities:
 *   - No serialization (that is the Skill's job via P0.3.7.4 serializer)
 *   - No retrieval algorithm / threshold / topK logic (delegated to retrieval service defaults)
 *   - No ranking / filtering / selection (delegated to P0.3.7.3 builder)
 *   - No wasTruncated computation (owned by builder, consumed by serializer)
 *
 * Design Constraints:
 *   - Never throws: retrieval failure must not block generation
 *   - Read-only: does not modify retrieval, builder, or serializer behavior
 */

import type { KnowledgeContext } from './knowledge-context-types';
import { buildKnowledgeContext } from './knowledge-context-builder';
import { getSemanticSearchInstance } from '../semantic/semantic-search-instance';
import { DEFAULT_TOP_K } from '../semantic/types';

/**
 * Retrieve and build a KnowledgeContext for generation.
 *
 * Candidate policy: candidates are included in retrieval so that the
 * KnowledgeContext can carry both validated and candidate knowledge.
 * The P0.3.7.4 serializer distinguishes them explicitly via `Status:` lines;
 * no conversion happens anywhere in the pipeline.
 *
 * Graceful degradation (P0.3.7.1 §15 key constraint):
 *   - Embedding provider unavailable (no API key)
 *   - Index not initialized / persistence missing
 *   - Network / timeout / provider failure
 *   → all result in `null`, and generation proceeds without knowledge.
 *
 * @param query - Retrieval query (formulated by the orchestration layer)
 * @returns KnowledgeContext on success, null on any failure
 */
export async function retrieveKnowledgeContextForGeneration(
  query: string
): Promise<KnowledgeContext | null> {
  try {
    const semanticSearch = await getSemanticSearchInstance();

    const response = await semanticSearch.search({
      query,
      limit: DEFAULT_TOP_K,
      include_candidates: true,
    });

    return buildKnowledgeContext(response);
  } catch (error) {
    // Graceful degradation — generation must never be blocked by retrieval.
    console.warn(
      '[generation-knowledge-context] Retrieval failed, continuing without knowledge context:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
