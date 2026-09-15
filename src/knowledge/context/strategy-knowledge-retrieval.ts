/**
 * P0.3.8.2 — Strategy Knowledge Retrieval
 *
 * Orchestration helper that retrieves Knowledge Context from the
 * Semantic Knowledge Base and converts it into a StrategyKnowledgeContext.
 *
 * Architecture Position:
 *   Strategy Query (formulated by caller)
 *     ↓
 *   retrieveStrategyKnowledgeContext (this module)
 *     1. Semantic Retrieval (existing singleton service)
 *     2. KnowledgeContextBuilder (P0.3.7.3)
 *     3. toStrategyKnowledgeContext() (P0.3.8.1)
 *     ↓
 *   StrategyKnowledgeContext
 *     ↓
 *   Strategy Skill → Prompt Assembly (future: P0.3.8.3) → LLM
 *
 * Responsibilities:
 *   1. Execute semantic retrieval via the existing singleton service
 *   2. Build KnowledgeContext via the existing builder (P0.3.7.3)
 *   3. Convert to StrategyKnowledgeContext via P0.3.8.1 adapter
 *   4. Graceful degradation: ANY retrieval failure → return null
 *      (Strategy continues as pure LLM, never blocked)
 *
 * Non-responsibilities:
 *   - No query formulation (caller composes the query)
 *   - No serialization (that is the Skill's job via P0.3.7.4 serializer)
 *   - No retrieval algorithm / threshold / topK logic (delegated to retrieval service defaults)
 *   - No ranking / filtering / selection (delegated to P0.3.7.3 builder)
 *   - No prompt assembly (that is P0.3.8.3)
 *   - No candidate policy enforcement (Contract layer only expresses, doesn't filter)
 *
 * Design Constraints:
 *   - Never throws: retrieval failure must not block strategy generation
 *   - Read-only: does not modify retrieval, builder, or strategy contract behavior
 *   - Empty result → empty StrategyKnowledgeContext (not null)
 *   - Failure → null
 *   - Candidate policy: include_candidates = true (Option B, P0.3.8.0 decision)
 *   - Reuses DEFAULT_TOP_K (5), does not hardcode magic numbers
 */

import { buildKnowledgeContext } from './knowledge-context-builder';
import { getSemanticSearchInstance } from '../semantic/semantic-search-instance';
import { DEFAULT_TOP_K } from '../semantic/types';
import { toStrategyKnowledgeContext } from './strategy-knowledge-context';
import type { StrategyKnowledgeContext } from './strategy-knowledge-context';

/**
 * Retrieve and build a StrategyKnowledgeContext from the Semantic Knowledge Base.
 *
 * Data Pipeline:
 *   Query string
 *     → SemanticSearch.search()           (P0.3.2-3 existing singleton)
 *     → SemanticRetrievalResponse
 *     → buildKnowledgeContext()            (P0.3.7.3 builder)
 *     → KnowledgeContext
 *     → toStrategyKnowledgeContext()       (P0.3.8.1 adapter)
 *     → StrategyKnowledgeContext
 *
 * Candidate Policy (P0.3.8.0 Option B):
 *   - Candidates are INCLUDED in retrieval (include_candidates = true)
 *   - Both validated and candidate knowledge reach StrategyKnowledgeContext
 *   - Status is preserved as-is (never converted)
 *   - Future Prompt Assembly (P0.3.8.3) will clearly distinguish them
 *
 * Graceful Degradation:
 *   - Embedding provider unavailable (no API key)
 *   - Index not initialized / persistence missing
 *   - Network / timeout / provider failure
 *   → all result in `null`, and strategy proceeds without knowledge.
 *
 * Empty vs Failure Semantics:
 *   - Retrieval success + 0 results → StrategyKnowledgeContext { primaryKnowledge: [], supportingKnowledge: [] }
 *   - Retrieval failure → null
 *
 * @param query - Retrieval query (formulated by caller, e.g., topic + selectedAngle)
 * @returns StrategyKnowledgeContext on success, null on any failure
 */
export async function retrieveStrategyKnowledgeContext(
  query: string
): Promise<StrategyKnowledgeContext | null> {
  try {
    const semanticSearch = await getSemanticSearchInstance();

    const response = await semanticSearch.search({
      query,
      limit: DEFAULT_TOP_K,
      include_candidates: true,
    });

    const knowledgeContext = buildKnowledgeContext(response);

    return toStrategyKnowledgeContext(knowledgeContext);
  } catch (error) {
    // Graceful degradation — strategy must never be blocked by retrieval.
    console.warn(
      '[strategy-knowledge-retrieval] Retrieval failed, continuing without knowledge context:',
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
