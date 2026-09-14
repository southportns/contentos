/**
 * P0.3.7 — Knowledge Context Module
 *
 * Bridge between Semantic Retrieval and Generation.
 */

// ─── Types (P0.3.7.2) ──────────────────────────────────────────────────────

export type {
  KnowledgeContext,
  KnowledgeContextItem,
  KnowledgeContextEvidence,
  KnowledgeContextRetrievalMetadata,
  KnowledgeContextConstraints,
  KnowledgeContextMetadata,
} from './knowledge-context-types';

// ─── Builder (P0.3.7.3) ────────────────────────────────────────────────────

export type { KnowledgeContextBuilderOptions } from './knowledge-context-builder';
export { buildKnowledgeContext } from './knowledge-context-builder';

// ─── Serializer (P0.3.7.4) ─────────────────────────────────────────────────

export { serializeKnowledgeContext } from './knowledge-context-serializer';
