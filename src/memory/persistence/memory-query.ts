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
   * Exact memory record ID for point lookup.
   *
   * When present, the database query adds `id = criteria.id` to the WHERE
   * clause, combined with ownerId for isolation. This enables O(1) exact
   * lookups without scanning top-N records.
   *
   * Must always be used together with ownerId — never as a standalone filter.
   */
  id?: string;

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

  /**
   * Cursor for composite-keyset pagination.
   *
   * Encodes the sort key of the last record from the previous batch:
   *   base64(JSON{imp: number, conf: number, upd: string, id: string})
   *
   * When set, the WHERE clause adds a composite OR condition that
   * selects only records AFTER the cursor position in the deterministic
   * sort order: importance DESC → confidence DESC → updatedAt DESC → id ASC.
   *
   * The composite boundary (after record with imp/conf/upd/id):
   *   importance < imp
   *   OR (importance = imp AND confidence < conf)
   *   OR (importance = imp AND confidence = conf AND updatedAt < upd)
   *   OR (importance = imp AND confidence = conf AND updatedAt = upd AND id > id)
   *
   * This is fully correct: no records are skipped or duplicated between
   * batches, regardless of how importance/confidence/updatedAt are distributed.
   *
   * Optional: when undefined, no cursor constraint is applied
   * (query starts from the beginning of the sorted set).
   */
  cursor?: string;
}
