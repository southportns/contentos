/**
 * P0.6.3.2.3 — Context Assembly Memory Integration
 *
 * Entry point for integrating persistent Memory Retrieval with the
 * Context Assembly Engine. Provides the feature-gated orchestration
 * that retrieves Memory Contexts and merges them into the standard
 * assembly pipeline.
 *
 * Architecture Position:
 *
 *   Persistent Memory
 *         ↓
 *   DatabaseMemoryRetriever
 *         ↓
 *   MemoryRecord[]
 *         ↓
 *   memoryRecordsToContexts()
 *         ↓
 *   ContextObject[] (kind=memory)
 *         ↓
 *   merge with existing contexts
 *         ↓
 *   assembleContexts() [existing, unmodified]
 *         ↓
 *   ContextAssemblyResult (+ memory stats in metadata)
 *
 * Feature Flag:
 *   MEMORY_CONTEXT_ASSEMBLY_ENABLED (default: false)
 *   - false: No behavior change, no memory retrieval
 *   - true: Memory contexts retrieved and participate in assembly
 *
 * Shadow Mode:
 *   When MEMORY_CONTEXT_ASSEMBLY_SHADOW_ENABLED is true alongside
 *   MEMORY_CONTEXT_ASSEMBLY_ENABLED, memory stats are also included
 *   in the ShadowMetadata for observability without changing output.
 *
 * Design Principles:
 *   1. Feature flag OFF = zero behavior change
 *   2. Memory goes through Full Pipeline: Select → Rank → Dedup → Budget
 *   3. No Writing Prompt modification
 *   4. Memory Layer stays isolated — only called, never modified
 *   5. ownerId security boundary preserved at all times
 *
 * Non-goals:
 *   - Not modifying DatabaseMemoryRetriever logic
 *   - Not creating a second Context abstraction
 *   - Not bypassing any assembly stage
 *   - Not modifying writing prompt templates
 */

import type { ContextObject } from '../context-object';
import type {
  ContextAssemblyRequest,
  ContextAssemblyResult,
  RetrievalRequest,
} from './types';
import { assembleContexts } from './context-assembler';
import type { MemoryContextRetriever, MemoryRetrievalParams } from './memory-context-retriever';

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Flags
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if Memory Context Assembly integration is enabled.
 *
 * Reads MEMORY_CONTEXT_ASSEMBLY_ENABLED from environment.
 * Default: false (opt-in).
 */
export function isMemoryContextAssemblyEnabled(): boolean {
  const value = process.env.MEMORY_CONTEXT_ASSEMBLY_ENABLED;
  return value === 'true' || value === '1';
}

/**
 * Check if Memory Shadow observability is enabled.
 *
 * Reads MEMORY_CONTEXT_ASSEMBLY_SHADOW_ENABLED from environment.
 * Default: false.
 */
export function isMemoryShadowEnabled(): boolean {
  const value = process.env.MEMORY_CONTEXT_ASSEMBLY_SHADOW_ENABLED;
  return value === 'true' || value === '1';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Stats (for observability)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Statistics about Memory Context participation in Assembly.
 *
 * These stats are included in shadow metadata and can be used for
 * observability without modifying the standard ContextAssemblyResult.
 *
 * Semantics:
 *   retrieved  — Memory records retrieved from DB
 *   selected   — Memory contexts that passed selection (scope/kind filter)
 *   deduped    — Memory contexts removed as duplicates
 *   included   — Memory contexts in final selected list (post-budget)
 */
export interface MemoryAssemblyStats {
  /** Number of memory contexts retrieved from DB */
  retrieved: number;
  /** Number of memory contexts that passed selection */
  selected: number;
  /** Number of memory contexts deduped */
  deduped: number;
  /** Number of memory contexts included in final selection (post-budget) */
  included: number;
  /** Feature flag state at assembly time */
  enabled: boolean;
  /** Error message if retrieval failed */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assembly Request Extension
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extended assembly request that includes Memory-specific parameters.
 *
 * The standard ContextAssemblyRequest is NOT modified. Instead, this
 * extension is used by assembleContextsWithMemory() for the additional
 * parameters needed for memory retrieval.
 */
export interface MemoryAssemblyOptions {
  /** Optional Memory Context Retriever instance */
  memoryRetriever?: MemoryContextRetriever;

  /** Owner ID — security boundary for memory retrieval */
  ownerId?: string;

  /** Scope override for memory retrieval */
  scope?: MemoryRetrievalParams['scope'];

  /** Policy override for memory retrieval (confidence/importance/age) */
  policy?: MemoryRetrievalParams['policy'];

  /** Maximum number of memory results to retrieve */
  memoryLimit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Integration Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of assembly with memory integration.
 *
 * Wraps the standard ContextAssemblyResult with additional memory stats.
 * The base result is unchanged — consumers that don't need memory stats
 * can use the `result` field directly.
 */
export interface MemoryAssemblyResult {
  /** Standard ContextAssemblyResult (preserves backward compatibility) */
  result: ContextAssemblyResult;
  /** Memory retrieval stats (for observability) */
  memoryStats: MemoryAssemblyStats;
}

/**
 * Assemble contexts with Memory Retrieval integration.
 *
 * This is the main entry point for P0.6.3.2.3. It:
 * 1. Checks the feature flag
 * 2. If enabled, retrieves memory contexts via MemoryContextRetriever
 * 3. Merges memory contexts with existing contexts
 * 4. Runs the standard assembleContexts pipeline (Select → Rank → Dedup → Budget)
 * 5. Returns both the standard result and memory stats
 *
 * When feature flag is OFF, this function behaves identically to
 * assembleContexts() — the standard result is returned with empty memory stats.
 *
 * Pipeline guarantee: Memory contexts go through the FULL pipeline:
 * Selector → Ranker → Deduplicator → Budget → Package.
 * They never bypass any stage.
 *
 * @param request - Standard assembly request
 * @param memoryOptions - Memory-specific options
 * @return MemoryAssemblyResult with standard result + memory stats
 */
export async function assembleContextsWithMemory(
  request: ContextAssemblyRequest,
  memoryOptions?: MemoryAssemblyOptions,
): Promise<MemoryAssemblyResult> {
  // ── Feature flag check ─────────────────────────────────────────────────
  const enabled = isMemoryContextAssemblyEnabled();

  const emptyStats: MemoryAssemblyStats = {
    retrieved: 0,
    selected: 0,
    deduped: 0,
    included: 0,
    enabled,
  };

  // Flag OFF → standard assembly, no memory retrieval
  if (!enabled) {
    const result = assembleContexts(request);
    return { result, memoryStats: emptyStats };
  }

  // Flag ON but no retriever or ownerId → skip gracefully
  if (!memoryOptions?.memoryRetriever || !memoryOptions?.ownerId) {
    const result = assembleContexts(request);
    return {
      result,
      memoryStats: {
        ...emptyStats,
        error: 'Memory retriever or ownerId not provided',
      },
    };
  }

  try {
    // ── Stage 1: Retrieve memory contexts ──────────────────────────────
    const retrievalRequest: RetrievalRequest = {
      kind: 'memory',
      projectId: request.projectId,
      topicId: request.topicId,
      query: request.query,
      limit: memoryOptions.memoryLimit,
    };

    const retrievalParams: MemoryRetrievalParams = {
      ownerId: memoryOptions.ownerId,
      scope: memoryOptions.scope,
      policy: memoryOptions.policy,
      limit: memoryOptions.memoryLimit,
    };

    const memoryContexts = await memoryOptions.memoryRetriever.retrieve(
      retrievalRequest,
      retrievalParams,
    );

    const retrieved = memoryContexts.length;

    // ── Stage 2: Merge with existing contexts ──────────────────────────
    // Memory contexts join the pool and go through the FULL pipeline.
    // They are NOT injected directly into the result.
    const allContexts: ContextObject[] = [
      ...request.contexts,
      ...memoryContexts,
    ];

    // ── Stage 3: Run standard assembly pipeline ────────────────────────
    const mergedRequest: ContextAssemblyRequest = {
      ...request,
      contexts: allContexts,
    };

    const result = assembleContexts(mergedRequest);

    // ── Stage 4: Compute memory stats ──────────────────────────────────
    const memoryContextIds = new Set(memoryContexts.map((ctx) => ctx.id));

    const included = result.selected.filter((s) =>
      memoryContextIds.has(s.context.id)
    ).length;

    const deduped = result.excluded.filter(
      (e) => e.reason === 'duplicate' && memoryContextIds.has(e.contextId)
    ).length;

    // "selected" = memory contexts that were NOT excluded during selection
    // (passed scope/kind validity checks) but may have been removed later by budget
    const selectionExcluded = result.excluded.filter(
      (e) =>
        (e.reason === 'scope_mismatch' ||
          e.reason === 'unknown_scope' ||
          e.reason === 'excluded_kind' ||
          e.reason === 'invalid') &&
        memoryContextIds.has(e.contextId)
    ).length;
    const selected = retrieved - selectionExcluded;

    const memoryStats: MemoryAssemblyStats = {
      retrieved,
      selected,
      deduped,
      included,
      enabled: true,
    };

    return { result, memoryStats };
  } catch (error) {
    // Graceful degradation: on any error, fall back to standard assembly
    const result = assembleContexts(request);
    return {
      result,
      memoryStats: {
        ...emptyStats,
        enabled: true,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
