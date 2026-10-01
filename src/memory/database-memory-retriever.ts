/*
 * P0.6.3.2.2 — Database Memory Retriever
 *
 * Queries persistent memory records from the database with full
 * scope/security/policy filtering pushed to the SQL layer.
 *
 * Architecture Position:
 *
 *   MemoryRetrievalRequest
 *         ↓
 *   DatabaseMemoryRetriever
 *         ↓ (translates to MemoryQueryCriteria)
 *   MemoryStore.findMany()
 *         ↓
 *   PrismaMemoryStore
 *         ↓
 *   Prisma / SQLite
 *
 * Design Principles:
 *   1. ownerId is mandatory — enforced at retriever level before DB query
 *   2. All filtering pushed to database WHERE clause
 *   3. Explicit scope > inferred scope
 *   4. Sorting: importance DESC → confidence DESC → updatedAt DESC → id ASC
 *   5. maxResults applied as LIMIT (take) at database level
 *
 * Security Model:
 *   - ownerId is required and enforced before any database access
 *   - Cross-user isolation is guaranteed by ownerId in WHERE clause
 *   - Cross-project isolation by projectId filtering
 *   - Cross-topic isolation by topicId filtering
 *
 * Scope Behavior:
 *   - global: always available within owner boundary
 *   - project: only matching projectId
 *   - topic: only matching projectId + topicId
 *   - session: excluded (ephemeral, not persistent)
 *
 * Non-goals:
 *   - No semantic/embedding search
 *   - No LLM memory extraction
 *   - No context assembly integration
 *   - No writing prompt integration
 */

import type { MemoryRetrievalRequest, MemoryRetriever } from './memory-retriever';
import type { MemoryStore } from './persistence/memory-store';
import type { MemoryQueryCriteria } from './persistence/memory-query';
import type { MemoryRecord } from './memory-record';
import type { MemoryStatus } from './memory-record';
import type { PersistentMemoryScope } from './memory-scope';
import { resolveMemoryPolicy } from './memory-policy';
import { DEFAULT_MEMORY_POLICY } from './memory-policy';

/**
 * Error thrown when a retrieval request is missing required ownerId.
 */
export class MemoryRetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryRetrievalError';
  }
}

/**
 * Database-backed memory retriever.
 *
 * Implements the MemoryRetriever interface using persistent storage.
 * Translates MemoryRetrievalRequest into MemoryQueryCriteria and
 * delegates to MemoryStore.findMany() for database-level filtering.
 *
 * Usage:
 *   const store = new PrismaMemoryStore();
 *   const retriever = new DatabaseMemoryRetriever(store);
 *   const records = await retriever.retrieve({
 *     ownerId: 'user_A',
 *     projectId: 'proj_123',
 *     policy: { maxResults: 10 },
 *   });
 */
export class DatabaseMemoryRetriever implements MemoryRetriever {
  private _store: MemoryStore;

  /**
   * Create a new DatabaseMemoryRetriever.
   *
   * @param store - The MemoryStore implementation to query
   */
  constructor(store: MemoryStore) {
    this._store = store;
  }

  /**
   * Retrieve memory records matching the request.
   *
   * Translates the retrieval request into database query criteria
   * and executes the query through the MemoryStore.
   *
   * @param request - Retrieval parameters (ownerId MUST be provided)
   * @return Filtered, sorted, and limited memory records
   * @throws MemoryRetrievalError if ownerId is missing
   */
  async retrieve(request: MemoryRetrievalRequest): Promise<MemoryRecord[]> {
    // Enforce ownerId requirement
    if (!request.ownerId || typeof request.ownerId !== 'string') {
      throw new MemoryRetrievalError(
        'MemoryRetrievalRequest.ownerId is required for database retrieval'
      );
    }

    // ─── Session scope boundary ──────────────────────────────────────────
    // session-scoped memories are ephemeral and MUST NOT be retrieved from
    // persistent storage. Return empty immediately — never reach the DB layer.
    if (request.scope === 'session') {
      return [];
    }

    const policy = resolveMemoryPolicy(request.policy);
    const criteria = this.buildCriteria(request, policy);

    // ─── Empty scope intersection ────────────────────────────────────────
    // If policy.allowedScopes eliminated all inferred scopes, the intersection
    // is empty → zero results. Do NOT fall back to a broader query that would
    // loosen scope isolation by only filtering on ownerId.
    if (criteria.allowedScopes && criteria.allowedScopes.length === 0) {
      return [];
    }

    return this._store.findMany(criteria);
  }

  /**
   * Build database query criteria from retrieval request and policy.
   *
   * This method translates the high-level MemoryRetrievalRequest
   * (with scope inference rules) and MemoryPolicy (with filtering rules)
   * into a flat MemoryQueryCriteria that can be executed as a
   * database query.
   *
   * Scope resolution logic:
   * 1. If request.scope is explicit → match that scope only
   * 2. If projectId + topicId → allow global + project(current) + topic(current)
   * 3. If projectId only → allow global + project(current)
   * 4. If neither → allow global only
   *
   * Then allowedScopes (from policy) further constrains the result.
   *
   * @param request - The retrieval request
   * @param policy - Resolved memory policy
   * @return MemoryQueryCriteria for database execution
   */
  private buildCriteria(
    request: MemoryRetrievalRequest,
    policy: ReturnType<typeof resolveMemoryPolicy>,
  ): MemoryQueryCriteria {
    const { ownerId, projectId, topicId } = request;

    // ─── Determine effective scopes ───────────────────────────────────────
    // effectiveScopes only holds persistent scopes (never 'session' — that
    // case is handled by early return in retrieve()).

    let effectiveScopes: PersistentMemoryScope[];

    if (request.scope && request.scope !== 'session') {
      // Explicit non-session scope: use only that scope
      effectiveScopes = [request.scope];
    } else if (projectId && topicId) {
      // Project + Topic context: include global, project, and topic
      effectiveScopes = ['global', 'project', 'topic'];
    } else if (projectId) {
      // Project context only: include global and project
      effectiveScopes = ['global', 'project'];
    } else {
      // No context: only global
      effectiveScopes = ['global'];
    }

    // Apply allowedScopes from policy as further constraint.
    // This is a SET INTERSECTION: effectiveScopes ∩ policy.allowedScopes.
    //
    // CRITICAL: If the intersection is empty, leave effectiveScopes empty.
    // Do NOT fall back to policy.allowedScopes, because that would broaden
    // the query and potentially leak records across project/topic boundaries.
    // The caller (retrieve()) checks for empty allowedScopes and returns [].
    if (policy.allowedScopes && policy.allowedScopes.length > 0) {
      effectiveScopes = effectiveScopes.filter((s) =>
        policy.allowedScopes!.includes(s)
      );
      // If intersection is empty → leave as [] (no fallback)
    }

    // ─── Determine status filter ──────────────────────────────────────────

    const statusFilter: MemoryStatus[] = ['active'];
    if (policy.includeExpired) {
      statusFilter.push('expired');
    }
    if (policy.includeSuperseded) {
      statusFilter.push('superseded');
    }
    if (policy.includeArchived) {
      statusFilter.push('archived');
    }

    // ─── Determine updatedAfter (age filtering) ───────────────────────────

    let updatedAfter: Date | undefined;
    if (policy.maxAgeDays != null && policy.maxAgeDays > 0) {
      const now = Date.now();
      updatedAfter = new Date(
        now - policy.maxAgeDays * 24 * 60 * 60 * 1000
      );
    }

    // ─── Build criteria ───────────────────────────────────────────────────

    const criteria: MemoryQueryCriteria = {
      ownerId: ownerId!,
      allowedScopes: effectiveScopes,
      status: statusFilter,
      take: policy.maxResults ?? DEFAULT_MEMORY_POLICY.maxResults,
    };

    // Optional filters
    if (projectId) {
      criteria.projectId = projectId;
    }
    if (topicId) {
      criteria.topicId = topicId;
    }
    if (policy.minConfidence != null) {
      criteria.minConfidence = policy.minConfidence;
    }
    if (policy.minImportance != null) {
      criteria.minImportance = policy.minImportance;
    }
    if (policy.allowedKinds && policy.allowedKinds.length > 0) {
      criteria.kinds = policy.allowedKinds;
    }
    if (policy.excludedKinds && policy.excludedKinds.length > 0) {
      criteria.excludedKinds = policy.excludedKinds;
    }
    if (policy.types && policy.types.length > 0) {
      criteria.types = policy.types;
    }
    if (updatedAfter) {
      criteria.updatedAfter = updatedAfter;
    }

    // ─── Composite cursor for keyset pagination (R2) ──────────────────────
    if (policy.cursor) {
      criteria.cursor = policy.cursor;
    }

    return criteria;
  }
}
