/**
 * P0.6.1 — Context Provenance Contract
 *
 * Defines where a Context Object came from, who owns it,
 * and how it relates to other contexts.
 *
 * Architecture Position:
 *   Provenance is the "source of truth" for Context Object lineage.
 *   It answers: Where did this come from? Who produced it? What depends on it?
 *
 * Design Principles:
 *   1. Provenance is immutable once set (append-only for derivedFrom/usedBy)
 *   2. All fields optional — provenance availability varies by context source
 *   3. No database persistence required — provenance is part of the Context Object
 *
 * Non-goals:
 *   - Not a full audit trail (that is P0.6.6 Context Graph)
 *   - Not a replacement for database Entity relations
 */

export interface ContextProvenance {
  source?: string | null;
  sourceType?: string | null;
  ownerId?: string | null;
  projectId?: string | null;
  topicId?: string | null;
  derivedFrom?: string[];
  usedBy?: string[];
  supersedes?: string | null;
  confidence?: number | null;
}