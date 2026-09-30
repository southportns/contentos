/**
 * P0.6.3.1 — Memory Scope
 *
 * Defines the boundary within which a memory can be used.
 *
 * Architecture Position:
 *   MemoryScope is INDEPENDENT from ContextScope.
 *   - ContextScope: Used by Context Assembly Engine for retrieval
 *   - MemoryScope: Used by Memory Layer for ownership/boundary
 *
 *   Later, MemoryRecord scope is mapped to ContextObject provenance.scope
 *   during the Memory → Context bridge (memoryRecordToContext).
 *
 * Design Principles:
 *   1. explicit scope always wins
 *   2. Derive from available IDs: topicId → projectId → global
 *   3. Scope answers "CAN it be used?" not "SHOULD it be used?"
 */

/**
 * Memory scope classification.
 *
 * - global:   Cross-project reusable (user-level preferences)
 * - project:  Scoped to a specific project
 * - topic:    Scoped to a specific topic
 * - session:  Only the current working session
 */
export type MemoryScope = 'global' | 'project' | 'topic' | 'session';

/**
 * Persistent memory scopes — scopes that participate in database retrieval.
 *
 * `session` is INTENTIONALLY EXCLUDED because session-scoped memories are
 * ephemeral and must never be returned from persistent storage queries.
 *
 * Derived from {@link MemoryScope} to avoid redefining string literals.
 */
export type PersistentMemoryScope = Exclude<MemoryScope, 'session'>;

/**
 * All valid MemoryScope values.
 */
export const MEMORY_SCOPES: readonly MemoryScope[] = [
  'global',
  'project',
  'topic',
  'session',
] as const;

/**
 * Input for scope resolution.
 */
export interface MemoryScopeInput {
  /** Explicitly provided scope (highest priority) */
  scope?: MemoryScope;
  /** Topic ID hint */
  topicId?: string | null;
  /** Project ID hint */
  projectId?: string | null;
}

/**
 * Resolve the effective MemoryScope from available signals.
 *
 * Resolution rules:
 * 1. If scope is explicitly provided → use it
 * 2. If topicId exists → 'topic'
 * 3. If projectId exists → 'project'
 * 4. Otherwise → 'global' (default)
 *
 * @param input - Scope resolution input
 * @return Resolved MemoryScope
 */
export function resolveMemoryScope(input: MemoryScopeInput): MemoryScope {
  // 1. Explicit scope takes priority
  if (input.scope) {
    return input.scope;
  }

  // 2. Topic affinity
  if (input.topicId) {
    return 'topic';
  }

  // 3. Project affinity
  if (input.projectId) {
    return 'project';
  }

  // 4. Default: global
  return 'global';
}
