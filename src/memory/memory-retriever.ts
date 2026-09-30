/**
 * P0.6.3.1 — Memory Retriever
 *
 * Provides retrieval interface for the Memory Layer.
 *
 * Architecture Position:
 *
 *   MemoryRetrievalRequest
 *         ↓
 *   MemoryRetriever.retrieve()
 *         ↓
 *   MemoryRecord[]
 *         ↓
 *   Memory → Context (memoryRecordToContext)
 *
 * This phase only implements InMemoryRetriever (no DB).
 *
 * Design Principles:
 *   1. Retrieval supports scope/kind/status/confidence/importance filtering
 *   2. Cross-project isolation: global memories always include; project/topic isolated
 *   3. Cross-topic isolation: topic memories only match same topic
 */

import type { MemoryRecord } from './memory-record';
import type { MemoryPolicy } from './memory-policy';
import type { MemoryScope } from './memory-scope';
import { resolveMemoryPolicy } from './memory-policy';

/**
 * Request parameters for memory retrieval.
 */
export interface MemoryRetrievalRequest {
  /** Filter by owner (user) ID */
  ownerId?: string;
  /** Filter by project ID */
  projectId?: string;
  /** Filter by topic ID */
  topicId?: string;
  /** Explicit scope override (takes precedence over inference) */
  scope?: MemoryScope;
  /** Future: query string for semantic search (P0.6.3.x) */
  query?: string;
  /** Policy for filtering and limiting results */
  policy?: MemoryPolicy;
}

/**
 * Retriever interface.
 *
 * Implementations:
 * - InMemoryRetriever: in-memory array filtering (this phase)
 * - (future) DatabaseRetriever: queries DB with SQL
 */
export interface MemoryRetriever {
  /**
   * Retrieve memory records matching the request.
   *
   * @param request - Retrieval parameters
   * @return Filtered and ranked memory records
   */
  retrieve(request: MemoryRetrievalRequest): Promise<MemoryRecord[]>;
}

/**
 * In-memory retriever implementation.
 *
 * Filters by:
 * - scope (global always included, project/topic must match)
 * - kind (allowed/excluded kinds)
 * - status (active by default, optional include expired/superseded)
 * - confidence (minimum threshold)
 * - importance (minimum threshold)
 * - age (max days)
 *
 * Sorts by: importance desc, then confidence desc, then recency desc.
 */
export class InMemoryRetriever implements MemoryRetriever {
  private _records: MemoryRecord[];

  constructor(records: MemoryRecord[] = []) {
    this._records = [...records];
  }

  /**
   * Add records to the in-memory store.
   */
  addRecords(records: MemoryRecord[]): void {
    this._records.push(...records);
  }

  /**
   * Get all records (unfiltered).
   */
  getAll(): MemoryRecord[] {
    return [...this._records];
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this._records = [];
  }

  async retrieve(request: MemoryRetrievalRequest): Promise<MemoryRecord[]> {
    const policy = resolveMemoryPolicy(request.policy);
    const { ownerId, projectId, topicId } = request;

    let results = this._records;

    // 1. Scope filtering (cross-project / cross-topic isolation)
    results = results.filter((record) => {
      return this.isScopeMatch(record, projectId, topicId);
    });

    // 2. Owner filtering
    if (ownerId) {
      results = results.filter((record) => record.ownerId === ownerId);
    }

    // 3. Status filtering
    results = results.filter((record) => {
      if (record.status === 'active') return true;
      if (record.status === 'expired' && policy.includeExpired) return true;
      if (record.status === 'superseded' && policy.includeSuperseded) return true;
      if (record.status === 'archived') return false; // never include archived
      return false;
    });

    // 4. Confidence filtering
    if (policy.minConfidence != null) {
      results = results.filter((record) => record.confidence >= policy.minConfidence!);
    }

    // 5. Importance filtering
    if (policy.minImportance != null) {
      results = results.filter((record) => record.importance >= policy.minImportance!);
    }

    // 6. Kind filtering
    if (policy.allowedKinds && policy.allowedKinds.length > 0) {
      results = results.filter((record) => policy.allowedKinds!.includes(record.kind));
    }
    if (policy.excludedKinds && policy.excludedKinds.length > 0) {
      results = results.filter((record) => !policy.excludedKinds!.includes(record.kind));
    }

    // 7. Allowed scopes
    if (policy.allowedScopes && policy.allowedScopes.length > 0) {
      // global is always allowed if any scope is allowed
      results = results.filter((record) => {
        if (record.scope === 'global') return true;
        return policy.allowedScopes!.includes(record.scope);
      });
    }

    // 8. Age filtering
    if (policy.maxAgeDays != null) {
      const cutoff = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
      results = results.filter(
        (record) => new Date(record.createdAt).getTime() >= cutoff
      );
    }

    // 9. Sort: importance desc → confidence desc → recency desc
    results = [...results].sort((a, b) => {
      // Primary: importance
      if (a.importance !== b.importance) return b.importance - a.importance;
      // Secondary: confidence
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      // Tertiary: recency
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // 10. Limit
    if (policy.maxResults != null) {
      results = results.slice(0, policy.maxResults);
    }

    return results;
  }

  /**
   * Check if a memory record's scope matches the request.
   *
   * Rules:
   * - global memory: always compatible (cross-project OK)
   * - project memory: must match projectId
   * - topic memory: must match projectId AND topicId
   * - session memory: excluded in cross-session retrieval
   */
  private isScopeMatch(
    record: MemoryRecord,
    requestProjectId?: string,
    requestTopicId?: string
  ): boolean {
    const recordScope = record.scope;

    switch (recordScope) {
      case 'global':
        // Global memories are always available
        return true;

      case 'project':
        // Project memories match only if projectId matches
        if (!requestProjectId) return false;
        return record.projectId === requestProjectId;

      case 'topic':
        // Topic memories match only if projectId AND topicId match
        if (!requestProjectId || !requestTopicId) return false;
        return record.projectId === requestProjectId && record.topicId === requestTopicId;

      case 'session':
        // Session memories are ephemeral — not retrievable cross-session
        return false;

      default:
        return false;
    }
  }
}
