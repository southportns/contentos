/**
 * P0.3.7.3 — Knowledge Context Builder
 *
 * Transforms SemanticRetrievalResponse into KnowledgeContext.
 *
 * Architecture Position:
 *   SemanticRetrievalResponse
 *     ↓
 *   KnowledgeContextBuilder (this module)
 *     ↓
 *   KnowledgeContext
 *
 * Responsibilities:
 *   1. Receive Retrieval Response
 *   2. Filter results based on candidate policy
 *   3. Sort by deterministic rules (status → similarity → confidence → evidence)
 *   4. Apply maxItems limit
 *   5. Classify into primaryKnowledge / supportingKnowledge
 *   6. Build evidence traceability references
 *   7. Construct constraints and metadata
 *   8. Return KnowledgeContext
 *
 * Design Constraints:
 *   - Deterministic: same input + same config → same output
 *   - Pure: no side effects, no database calls, no LLM calls
 *   - Traceable: preserve knowledge_id for full traceability
 *   - No new knowledge creation
 *   - candidate never converted to validated
 */

import type { SemanticRetrievalResponse } from '../semantic/types';
import { DEFAULT_SIMILARITY_THRESHOLD, DEFAULT_TOP_K } from '../semantic/types';
import { CONFIDENCE_SCORES } from '../types';
import type {
  KnowledgeContext,
  KnowledgeContextItem,
  KnowledgeContextEvidence,
  KnowledgeContextConstraints,
  KnowledgeContextMetadata,
  KnowledgeContextRetrievalMetadata,
} from './knowledge-context-types';

// ─── Builder Options ────────────────────────────────────────────────────────

/**
 * Options for KnowledgeContextBuilder.
 */
export interface KnowledgeContextBuilderOptions {
  /**
   * Maximum number of Knowledge Items to include in context.
   * Default: DEFAULT_TOP_K (5)
   */
  maxItems?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CONTRACT_VERSION = '1.0.0';
const CONTRACT_SOURCE = 'p0.3.7';

/**
 * Primary knowledge ratio: 60% of items (capped at 4).
 * For 3 or fewer items, all go to primary.
 */
const PRIMARY_RATIO = 0.6;
const PRIMARY_CAP = 4;

// ─── Text Reconstruction ────────────────────────────────────────────────────

/**
 * Reconstruct the knowledge text from a Knowledge Unit.
 *
 * This mirrors the embedding text construction in semantic-index.ts
 * but operates purely on data fields.
 *
 * The text represents the knowledge content relevant to generation.
 */
function reconstructKnowledgeText(knowledge: {
  name: string;
  description: string;
  abstract_pattern?: string;
  function?: string;
  principle?: string;
  surface_forms?: string[];
}): string {
  const parts: string[] = [
    knowledge.name,
    knowledge.description,
    knowledge.abstract_pattern ?? '',
    knowledge.function ?? '',
    knowledge.principle ?? '',
    ...(knowledge.surface_forms ?? []),
  ];

  return parts.filter((p) => p.length > 0).join(' ');
}

// ─── Deterministic Sorting ──────────────────────────────────────────────────

/**
 * Sort Knowledge Items by deterministic priority:
 *   1. Status: validated before candidate
 *   2. Similarity: higher first
 *   3. Confidence: higher first (uses existing CONFIDENCE_SCORES)
 *   4. Evidence count: more first
 *   5. Tie-breaker: knowledgeId (alphabetical, for determinism)
 */
function sortKnowledgeItems(
  items: KnowledgeContextItem[]
): KnowledgeContextItem[] {
  return [...items].sort((a, b) => {
    // 1. Status priority: validated (0) < candidate (1)
    const statusA = a.status === 'validated' ? 0 : 1;
    const statusB = b.status === 'validated' ? 0 : 1;
    if (statusA !== statusB) return statusA - statusB;

    // 2. Similarity: higher first
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;

    // 3. Confidence: higher first
    const confidenceA = CONFIDENCE_SCORES[a.confidence];
    const confidenceB = CONFIDENCE_SCORES[b.confidence];
    if (confidenceB !== confidenceA) return confidenceB - confidenceA;

    // 4. Evidence count: more first
    if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;

    // 5. Tie-breaker: knowledgeId alphabetical
    return a.knowledgeId.localeCompare(b.knowledgeId);
  });
}

// ─── Primary / Supporting Classification ────────────────────────────────────

/**
 * Determine how many items should be classified as primary knowledge.
 *
 * Rules:
 *   - If total items <= 3, all are primary
 *   - Otherwise: floor(total * PRIMARY_RATIO), capped at PRIMARY_CAP, minimum 1
 */
function calculatePrimaryCount(totalItems: number): number {
  if (totalItems <= 3) return totalItems;
  const calculated = Math.floor(totalItems * PRIMARY_RATIO);
  return Math.max(1, Math.min(calculated, PRIMARY_CAP));
}

/**
 * Classify sorted items into primary and supporting knowledge.
 *
 * Primary: top N items (most relevant)
 * Supporting: remaining items
 */
function classifyKnowledge(
  sortedItems: KnowledgeContextItem[]
): {
  primaryKnowledge: KnowledgeContextItem[];
  supportingKnowledge: KnowledgeContextItem[];
} {
  const primaryCount = calculatePrimaryCount(sortedItems.length);
  return {
    primaryKnowledge: sortedItems.slice(0, primaryCount),
    supportingKnowledge: sortedItems.slice(primaryCount),
  };
}

// ─── Retrieval Result → KnowledgeContextItem ────────────────────────────────

/**
 * Convert a SemanticRetrievalResult to a KnowledgeContextItem.
 *
 * Pure mapping — no computation, no modification of source data.
 */
function toKnowledgeContextItem(
  result: SemanticRetrievalResponse['results'][number]
): KnowledgeContextItem {
  const ku = result.knowledge;
  return {
    knowledgeId: ku.knowledge_id,
    name: ku.name,
    text: reconstructKnowledgeText(ku),
    category: ku.category,
    knowledgeLevel: ku.knowledge_level,
    confidence: ku.confidence,
    status: ku.status,
    similarity: result.similarity,
    retrievalReason: result.retrieval_reason,
    evidenceCount: ku.evidence.items.length,
  };
}

// ─── Evidence Traceability ──────────────────────────────────────────────────

/**
 * Build evidence traceability references from selected Knowledge Items.
 *
 * Produces KnowledgeContextEvidence items for traceability.
 * Deduplicates by evidenceId.
 * Preserves original quote text without modification.
 */
function buildEvidenceReferences(
  selectedItems: KnowledgeContextItem[],
  results: SemanticRetrievalResponse['results']
): KnowledgeContextEvidence[] {
  const evidenceMap = new Map<string, KnowledgeContextEvidence>();

  const knowledgeMap = new Map(
    results.map((r) => [r.knowledge_id, r.knowledge])
  );

  for (const item of selectedItems) {
    const ku = knowledgeMap.get(item.knowledgeId);
    if (!ku) continue;

    for (const ev of ku.evidence.items) {
      if (evidenceMap.has(ev.evidence_id)) continue;
      evidenceMap.set(ev.evidence_id, {
        knowledgeId: ku.knowledge_id,
        quote: ev.quote,
        evidenceId: ev.evidence_id,
        contentId: ev.content_id,
        validation: ev.validation,
        quality: ev.evidence_quality,
        trust: ev.evidence_trust,
      });
    }
  }

  return Array.from(evidenceMap.values());
}

// ─── includeCandidates Detection ────────────────────────────────────────────

/**
 * Detect whether candidate KUs exist in retrieval results.
 *
 * Since SemanticRetrievalResponse doesn't carry include_candidates flag,
 * we detect presence of candidate items as signal.
 * This is consistent with the default behavior: when include_candidates=false,
 * retrieval layer filters out candidates before returning.
 */
function detectIncludeCandidates(
  results: SemanticRetrievalResponse['results']
): boolean {
  return results.some((r) => r.knowledge.status === 'candidate');
}

// ─── Main Builder Function ──────────────────────────────────────────────────

/**
 * Build a KnowledgeContext from a SemanticRetrievalResponse.
 *
 * Pipeline:
 *   1. Map results → KnowledgeContextItems
 *   2. Filter by candidate policy (exclude candidates unless included in response)
 *   3. Sort deterministically
 *   4. Apply maxItems limit
 *   5. Classify primary / supporting (post-truncation)
 *   6. Build evidence traceability
 *   7. Construct constraints and metadata
 *   8. Return KnowledgeContext
 *
 * @param response - Semantic Retrieval response
 * @param options - Builder options (maxItems)
 * @returns KnowledgeContext
 */
export function buildKnowledgeContext(
  response: SemanticRetrievalResponse,
  options?: KnowledgeContextBuilderOptions
): KnowledgeContext {
  const maxItems = options?.maxItems ?? DEFAULT_TOP_K;

  // Detect whether candidates are present in the response
  const includeCandidates = detectIncludeCandidates(response.results);

  // Step 1: Map results to KnowledgeContextItems
  const allItems = response.results.map(toKnowledgeContextItem);

  // Step 2: Filter by candidate policy
  // If no candidates exist in response, no filtering needed.
  // If candidates exist, the response was produced with include_candidates=true,
  // so we keep them. If caller wants to exclude, they should have used
  // include_candidates=false at retrieval time.
  const filteredItems = includeCandidates
    ? allItems
    : allItems.filter((item) => item.status === 'validated');

  // Step 3: Sort deterministically
  const sortedItems = sortKnowledgeItems(filteredItems);

  // Step 4: Apply maxItems
  const truncatedItems = sortedItems.slice(0, maxItems);
  const selectedCount = truncatedItems.length;

  // Step 5: Classify primary / supporting (after truncation)
  const { primaryKnowledge, supportingKnowledge } =
    classifyKnowledge(truncatedItems);

  // Step 6: Build evidence traceability for selected items only
  const evidence = buildEvidenceReferences(truncatedItems, response.results);

  // Step 7: Construct constraints
  const hasCandidates = truncatedItems.some((item) => item.status === 'candidate');
  const wasTruncated = response.results.length > selectedCount;

  const constraints: KnowledgeContextConstraints = {
    hasCandidates,
    maxItems,
    wasTruncated,
  };

  // Step 8: Construct metadata
  const metadata: KnowledgeContextMetadata = {
    version: CONTRACT_VERSION,
    createdAt: new Date().toISOString(),
    source: CONTRACT_SOURCE,
  };

  // Construct retrieval metadata
  const retrieval: KnowledgeContextRetrievalMetadata = {
    method: 'semantic',
    threshold: DEFAULT_SIMILARITY_THRESHOLD,
    topK: DEFAULT_TOP_K,
    includeCandidates,
    retrievedCount: response.results.length,
  };

  // Return KnowledgeContext
  return {
    query: response.query,
    retrieval,
    selectedCount,
    primaryKnowledge,
    supportingKnowledge,
    evidence,
    constraints,
    metadata,
  };
}
