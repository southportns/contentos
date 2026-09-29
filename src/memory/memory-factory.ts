/**
 * P0.6.3.1 — Memory Factory
 *
 * Creates MemoryRecord instances with sensible defaults and auto-derivation.
 *
 * Architecture Position:
 *   Factory is the primary way to construct MemoryRecord instances.
 *   Adapters use this factory to create records from source entities.
 *
 * Design Principles:
 *   1. Auto-generate ID if not provided
 *   2. Auto-derive scope from available IDs
 *   3. Sensible defaults for confidence/importance/timestamps
 */

import type { MemoryKind } from './memory-kind';
import type { MemoryScope } from './memory-scope';
import type { MemoryRecord, MemoryStatus } from './memory-record';
import { resolveMemoryScope } from './memory-scope';

/**
 * Options for creating a MemoryRecord.
 */
export interface CreateMemoryOptions<T> {
  /** Uniqueidentifier (auto-generated if not provided) */
  id?: string;

  /** Memory kind (static/dynamic/episodic/semantic) */
  kind: MemoryKind;

  /** Type discriminator within the kind */
  type: string;

  /** The memory payload */
  payload: T;

  /** Explicit scope (auto-derived if not provided) */
  scope?: MemoryScope;

  /** Owner (user) ID */
  ownerId?: string | null;

  /** Project ID (used for scope derivation if scope not explicit) */
  projectId?: string | null;

  /** Topic ID (used for scope derivation if scope not explicit) */
  topicId?: string | null;

  /** Source description */
  source?: string;

  /** Source type */
  sourceType?: string;

  /** IDs of memories this was derived from */
  derivedFrom?: readonly string[];

  /** Confidence (0.0 - 1.0). Default: 0.5 */
  confidence?: number;

  /** Importance (0.0 - 1.0). Default: 0.5 */
  importance?: number;

  /** Creation timestamp (default: now) */
  createdAt?: string;

  /** Update timestamp (default: createdAt) */
  updatedAt?: string;

  /** Expiration timestamp */
  expiresAt?: string | null;

  /** Version (default: 1) */
  version?: number;

  /** Status (default: 'active') */
  status?: MemoryStatus;
}

/**
 * Generates a unique memory ID.
 */
function generateMemoryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `mem_${crypto.randomUUID()}`;
  }
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Clamp a value between 0.0 and 1.0.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Create a MemoryRecord with all required fields and sensible defaults.
 *
 * Auto-derivation rules:
 * - scope: explicit → topicId → projectId → global
 * - id: crypto.randomUUID with mem_ prefix
 * - createdAt/updatedAt: now
 * - accessCount: 0
 * - version: 1
 * - status: 'active'
 * - confidence: 0.5 (clamped 0-1)
 * - importance: 0.5 (clamped 0-1)
 *
 * @param options - Creation options
 * @return A complete MemoryRecord
 */
export function createMemoryRecord<T>(options: CreateMemoryOptions<T>): MemoryRecord<T> {
  const now = new Date().toISOString();
  const createdAt = options.createdAt ?? now;
  const updatedAt = options.updatedAt ?? createdAt;

  // Auto-derive scope
  const scope = options.scope ?? resolveMemoryScope({
    topicId: options.topicId ?? null,
    projectId: options.projectId ?? null,
  });

  return {
    id: options.id ?? generateMemoryId(),
    kind: options.kind,
    type: options.type,
    payload: options.payload,
    scope,
    ownerId: options.ownerId ?? null,
    projectId: options.projectId ?? null,
    topicId: options.topicId ?? null,
    source: options.source ?? 'memory_factory',
    sourceType: options.sourceType ?? 'factory',
    derivedFrom: options.derivedFrom,
    confidence: clamp01(options.confidence ?? 0.5),
    importance: clamp01(options.importance ?? 0.5),
    createdAt,
    updatedAt,
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: options.expiresAt ?? null,
    version: options.version ?? 1,
    status: options.status ?? 'active',
  };
}

/**
 * Convenience factory for static memories.
 *
 * Static: long-term stable, rarely changes (user profiles, personas, brand rules)
 */
export function createStaticMemory<T>(
  options: Omit<CreateMemoryOptions<T>, 'kind'> & { scope?: MemoryScope }
): MemoryRecord<T> {
  return createMemoryRecord({
    ...options,
    kind: 'static',
  });
}

/**
 * Convenience factory for dynamic memories.
 *
 * Dynamic: recent, mutable working state (active draft, current topic status)
 */
export function createDynamicMemory<T>(
  options: Omit<CreateMemoryOptions<T>, 'kind'> & { scope?: MemoryScope }
): MemoryRecord<T> {
  return createMemoryRecord({
    ...options,
    kind: 'dynamic',
  });
}

/**
 * Convenience factory for episodic memories.
 *
 * Episodic: "what happened" event memory (draft edits, topic state changes, agent runs)
 */
export function createEpisodicMemory<T>(
  options: Omit<CreateMemoryOptions<T>, 'kind'> & { scope?: MemoryScope }
): MemoryRecord<T> {
  return createMemoryRecord({
    ...options,
    kind: 'episodic',
  });
}

/**
 * Convenience factory for semantic memories.
 *
 * Semantic: abstracted reusable facts/knowledge ("user prefers short sentences",
 * "this project works better with professional tone")
 */
export function createSemanticMemory<T>(
  options: Omit<CreateMemoryOptions<T>, 'kind'> & { scope?: MemoryScope }
): MemoryRecord<T> {
  return createMemoryRecord({
    ...options,
    kind: 'semantic',
  });
}
