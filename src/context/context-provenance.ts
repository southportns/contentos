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

/**
 * Describes the origin and ownership of a Context Object.
 *
 * This is a contract, not a database schema.
 * Actual adapters populate fields based on available source data.
 */
export interface ContextProvenance {
  /**
   * Human-readable source description.
   * Examples: "topic:abc123", "strategy_skill_v2", "manual_entry"
   */
  source?: string | null;

  /**
   * Type classification of the source.
   * Examples: "database", "skill", "user_input", "adapter", "external_api"
   */
  sourceType?: string | null;

  /**
   * The user who owns or produced this context.
   * Maps to User.id in the Identity layer.
   */
  ownerId?: string | null;

  /**
   * The project this context belongs to.
   * Maps to Project.id. Enables project-scoped context queries.
   */
  projectId?: string | null;

  /**
   * The topic this context is associated with.
   * Maps to Topic.id. Most context is topic-scoped.
   */
  topicId?: string | null;

  /**
   * IDs of Context Objects this was derived from.
   * Enables lineage tracing: Context C derived from [A, B].
   */
  readonly derivedFrom?: readonly string[];

  /**
   * IDs of Context Objects that consumed this context.
   * Enables impact analysis: Context A was used by [C, D].
   */
  readonly usedBy?: readonly string[];

  /**
   * ID of another Context Object this supersedes.
   * When a context is updated/superseded, points to the previous version.
   */
  readonly supersedes?: string | null;

  /**
   * Source-level confidence (0.0 to 1.0).
   * Distinct from the ContextObject-level confidence which is payload-level.
   */
  confidence?: number | null;
}
