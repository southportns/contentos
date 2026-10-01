import type { PersistentMemoryScope } from '../memory-scope';

/**
 * P0.6.3.2.2 — Memory Query Criteria
 *
 * Database-level query DTO for memory retrieval.
 *
 * Architecture Position:
 *
 *   DatabaseMemoryRetriever
 *       ↓
 *   MemoryQueryCriteria (this file)
 *       ↓
 *   PrismaMemoryStore.findMany()
 *       ↓
 *   Prisma WHERE clause
 *
 * Design Principles:
 *   1. All fields are optional except ownerId (mandatory isolation)
 *   2. Scope-based filtering uses allowedScopes array
 *   3. Threshold-based filtering for confidence/importance
 *   4. Age filtering via updatedAfter (consistent with persistence layer)
 *   5. Result limit via take (database-level LIMIT)
 */

/**
 * Query criteria for database-level memory retrieval.
 *
 * Used by DatabaseMemoryRetriever to pass structured query parameters
 * to PrismaMemoryStore.findMany().
 */
export interface MemoryQueryCriteria {
  /**
   * Owner (user) ID — MANDATORY for all queries.
   * Ensures cross-user isolation at the database level.
   */
  ownerId: string;

  /**
   * Allowed scopes for retrieval. Only persistent scopes are accepted;
   * 'session' must never appear here (session is ephemeral, excluded
   * from persistent retrieval).
   *
   * - ['global'] — only global memories (default)
   * - ['global', 'project'] — global + project-scoped
   * - ['global', 'project', 'topic'] — all persistent scopes
   *
   * Scope/project/topic conditions are combined with OR.
   */
  allowedScopes?: PersistentMemoryScope[];

  /**
   * Project ID for scope filtering.
   * Required when 'project' or 'topic' is in allowedScopes.
   */
  projectId?: string;

  /**
   * Topic ID for scope filtering.
   * Required when 'topic' is in allowedScopes.
   */
  topicId?: string;

  /**
   * Filter by memory status.
   * Common values: 'active', 'expired', 'superseded'.
   */
  status?: string[];

  /**
   * Minimum confidence threshold (inclusive).
   * Only memories with confidence >= this value are returned.
   */
  minConfidence?: number;

  /**
   * Minimum importance threshold (inclusive).
   * Only memories with importance >= this value are returned.
   */
  minImportance?: number;

  /**
   * Filter by memory kinds (inclusion).
   * e.g., ['static', 'dynamic'] returns only those kinds.
   */
  kinds?: string[];

  /**
   * Exclude specific memory kinds.
   * e.g., ['episodic'] excludes episodic memories.
   */
  excludedKinds?: string[];

  /**
   * Only return memories of these types.
   * e.g., ['outcome'] returns only outcome memories.
   * Pushed to SQL WHERE clause for database-level filtering.
   */
  types?: string[];

  /**
   * Only return memories updated after this timestamp.
   * Used for incremental sync / freshness filtering.
   */
  updatedAfter?: Date;

  /**
   * Maximum number of records to return (database-level LIMIT).
   */
  take: number;
}
