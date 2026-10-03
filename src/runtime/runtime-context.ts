/**
 * P0.7.1 — ContextOS Runtime Context Lifecycle
 *
 * Implements the context retrieval and assembly helpers that wire
 * ContextOS Runtime to the existing P0.6 Context/Memory systems.
 *
 * Architecture Position:
 *
 *   runContextOS()
 *       ↓
 *   retrieveRuntimeContext()  ← This file (P0.7.2 enhances)
 *       ↓
 *   ContextObject[]
 *       ↓
 *   assembleRuntimeContext()  ← This file (P0.7.3 enhances)
 *       ↓
 *   RuntimeContextPackage
 *
 * P0.7.1 Delivery:
 *   - retrieveRuntimeContext(): Basic retrieval via MemoryRetriever + Context bridge
 *   - assembleRuntimeContext(): Basic assembly via P0.6 Assembly Engine
 *   - resolveRuntimePolicy(): Policy resolution with sensible defaults
 *   - Context ID generation: Deterministic IDs for runtime contexts
 */

import type {
  ContextOSRuntimeRequest,
  ContextOSContextPolicy,
  RuntimeContextPackage,
  ContextUsage,
} from './runtime-types';
import { runContextOS } from './runtime-core';
import type { ContextObject } from '@/context/context-object';
import type { ContextProvenance } from '@/context/context-provenance';
import { assembleContexts, buildContextPackage, serializeContextPackage } from '@/context/assembly';
import type { AssemblyPurpose } from '@/context/assembly';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import { memoryRecordsToContexts } from '@/memory/memory-utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for retrieveRuntimeContext.
 *
 * P0.7.1: MemoryRetriever only.
 * P0.7.2: Adds Decision/Outcome/Knowledge/Graph retrievers.
 */
export interface RuntimeRetrievalDependencies {
  /** MemoryRetriever for all memory records (owner-scoped) */
  memoryRetriever: MemoryRetriever;
}

/**
 * Retrieve context objects for a runtime request.
 *
 * P0.7.1 Implementation:
 *   - Retrieves MemoryRecords via MemoryRetriever (owner-scoped)
 *   - Converts to ContextObjects via memoryRecordsToContexts
 *   - Returns flat array ready for assembly
 *
 * P0.7.2 will extend with:
 *   - Decision Retrieval
 *   - Outcome Retrieval
 *   - Knowledge Retrieval
 *   - Graph Retrieval
 *
 * @param request - Runtime request with owner/project/topic scope
 * @param deps - Retrieval dependencies (MemoryRetriever)
 * @returns ContextObjects ready for assembly
 */
export async function retrieveRuntimeContext(
  request: ContextOSRuntimeRequest,
  deps: RuntimeRetrievalDependencies
): Promise<ContextObject[]> {
  const { ownerId, projectId, topicId } = request;
  const policy = resolveRuntimePolicy(request.contextPolicy);

  // Retrieve MemoryRecords with owner isolation
  const records = await deps.memoryRetriever.retrieve({
    ownerId,
    projectId,
    topicId,
    scope: policy.allowedScopes?.[0], // Primary scope filter
  });

  // Filter by allowed scopes if specified
  let filtered = records;
  if (policy.allowedScopes && policy.allowedScopes.length > 0) {
    filtered = records.filter((r) => {
      if (r.scope === 'global') return true;
      return policy.allowedScopes!.includes(r.scope);
    });
  }

  // Convert to ContextObjects
  const contexts = memoryRecordsToContexts(filtered);

  // Apply kind filter if specified
  if (policy.allowedKinds && policy.allowedKinds.length > 0) {
    return contexts.filter((ctx) => policy.allowedKinds!.includes(ctx.kind));
  }
  if (policy.excludedKinds && policy.excludedKinds.length > 0) {
    return contexts.filter((ctx) => !policy.excludedKinds!.includes(ctx.kind));
  }

  return contexts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Assembly
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assemble contexts into a RuntimeContextPackage.
 *
 * P0.7.1 Implementation:
 *   - Uses P0.6.2 assembleContexts() for Select→Rank→Dedup→Budget
 *   - Builds ContextPackage via buildContextPackage()
 *   - Serializes via serializeContextPackage()
 *   - Wraps in RuntimeContextPackage
 *
 * P0.7.3 will enhance with:
 *   - Graph-based enrichment
 *   - Multi-source context merging
 *   - Advanced serialization
 *
 * @param contexts - ContextObjects to assemble
 * @param policy - Context policy for budget constraints
 * @param purpose - Purpose string for assembly
 * @returns RuntimeContextPackage ready for Agent injection
 */
export async function assembleRuntimeContext(
  contexts: ContextObject[],
  policy: ContextOSContextPolicy | undefined,
  purpose: string
): Promise<RuntimeContextPackage> {
  const now = () => new Date().toISOString();
  const timestamp = now();

  // Map purpose string to AssemblyPurpose
  const assemblyPurpose = mapPurposeToAssembly(purpose);

  // Build assembly request from P0.6.2
  const assemblyRequest = {
    contexts,
    purpose: assemblyPurpose,
    maxTokens: policy?.maxTokens,
    maxContexts: policy?.maxContexts,
    // Future: projectId, topicId, query from policy
  };

  // Run P0.6.2 assembly pipeline: Select → Rank → Dedup → Budget
  const assemblyResult = assembleContexts(assemblyRequest);

  // Build structured package (organized by kind)
  const contextPackage = buildContextPackage(assemblyResult);

  // Serialize for prompt injection
  const serialized = serializeContextPackage(contextPackage, {
    includeHeader: true,
  });

  // Build provenance array from selected contexts
  const provenance: ContextProvenance[] = assemblyResult.selected.map(
    (s) => s.context.provenance
  );

  // Collect context IDs for usage tracking
  const contextIds = assemblyResult.selected.map((s) => s.context.id);

  return {
    contexts: assemblyResult.selected.map((s) => s.context),
    serialized,
    tokenEstimate: assemblyResult.tokenEstimate,
    contextIds,
    provenance,
    generatedAt: timestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Policy Resolution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default runtime policy when none is provided.
 */
export const DEFAULT_RUNTIME_POLICY: ContextOSContextPolicy = {
  maxTokens: 8000,
  maxContexts: 50,
  includeGraph: false,
  graphDepth: 0,
  includeMemory: true,
  includeOutcomes: true,
  includeDecisions: true,
  includeFeedback: true,
};

/**
 * Resolve runtime policy with defaults.
 *
 * Merges user-provided policy with sensible defaults.
 * Explicit user settings always win over defaults.
 */
export function resolveRuntimePolicy(
  policy: ContextOSContextPolicy | undefined
): ContextOSContextPolicy {
  if (!policy) return { ...DEFAULT_RUNTIME_POLICY };

  return {
    ...DEFAULT_RUNTIME_POLICY,
    ...policy,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Usage Tracking
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record context usage for an Agent Run.
 *
 * Creates a ContextUsage entry linking a Context to a Run.
 *
 * This is a factory function — actual persistence is P0.7.4+.
 *
 * @param contextId - Which context was used
 * @param runId - In which run
 * @param purpose - For what purpose
 * @param now - Clock function
 * @returns ContextUsage record
 */
export function createContextUsage(
  contextId: string,
  runId: string,
  purpose: string,
  now: () => string = () => new Date().toISOString()
): ContextUsage {
  return {
    contextId,
    runId,
    usedAt: now(),
    purpose,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Purpose Mapping
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a runtime purpose string to an AssemblyPurpose.
 *
 * P0.7.1: Simple keyword-based mapping.
 * P0.7.3: May use more sophisticated mapping.
 */
export function mapPurposeToAssembly(purpose: string): AssemblyPurpose {
  const lower = purpose.toLowerCase();

  if (lower.includes('strategy') || lower.includes('plan')) {
    return 'strategy';
  }
  if (lower.includes('evaluat') || lower.includes('assess') || lower.includes('score')) {
    return 'evaluation';
  }
  if (lower.includes('write') || lower.includes('content') || lower.includes('draft')) {
    return 'writing';
  }

  return 'generic';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Factory (convenience)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a pre-configured runContextOS function with dependencies wired.
 *
 * This is a convenience factory for common use cases.
 * Advanced users can call runContextOS() directly with custom deps.
 *
 * @param memoryRetriever - MemoryRetriever instance
 * @param now - Optional clock function
 * @returns A runContextOS function with dependencies pre-wired
 */
export function createRuntimeRunner(memoryRetriever: MemoryRetriever) {
  return async (request: ContextOSRuntimeRequest) => {
    return runContextOS(request, {
      retrieveContext: (req) => retrieveRuntimeContext(req, { memoryRetriever }),
      assembleContext: (contexts, policy, purpose) =>
        assembleRuntimeContext(contexts, policy, purpose),
    });
  };
}
