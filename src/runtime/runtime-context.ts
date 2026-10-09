/**
 * P0.7.2 — ContextOS Runtime Context Lifecycle
 *
 * Implements the context retrieval and assembly helpers that wire
 * ContextOS Runtime to the existing P0.6 Context/Memory systems.
 *
 * Architecture Position:
 *
 *   runContextOS()
 *       ↓
 *   retrieveRuntimeContext()        ← Unified retrieval pipeline (P0.7.2)
 *       ↓                              �────────┼────────┐
 *   ContextObject[]                   ↓        ↓        ↓
 *       ↓                          Memory   Decision  Outcome
 *   assembleRuntimeContext()          ↓        ↓        ↓
 *       ↓                          Knowledge Graph    Feedback
 *   RuntimeContextPackage             ↓        ↓        ↓
 *                                  Scope/Owner Validation
 *                                       ↓
 *                                  Kind Filters
 *                                       ↓
 *                                  Deterministic Dedup
 *                                       ↓
 *                                  ContextObject[]
 *
 * P0.7.2 Delivery:
 *   - Unified multi-source retrieval (Memory, Decision, Outcome, Feedback, Knowledge, Graph)
 *   - Runtime scope enforcement (explicit scope + multi-scope dedup)
 *   - Context-level owner/project/topic validation
 *   - Kind filters (allowedKinds/excludedKinds)
 *   - Deterministic deduplication and ordering
 *   - Retrieval diagnostics (retrieveRuntimeContextWithMetadata)
 *   - Backward-compatible retrieveRuntimeContext()
 */

import type {
  ContextOSRuntimeRequest,
  ContextOSContextPolicy,
  RuntimeContextPackage,
  ContextUsage,
  RuntimeContextRetrievalResult,
  RuntimeContextSourceReport,
} from './runtime-types';
import { runContextOS } from './runtime-core';
import type { ContextObject } from '@/context/context-object';
import type { ContextProvenance } from '@/context/context-provenance';
import { assembleContexts, buildContextPackage, serializeContextPackage } from '@/context/assembly';
import type { AssemblyPurpose } from '@/context/assembly';
import type { ContextRetriever } from '@/context/assembly/types';
import type { MemoryRetriever } from '@/memory/memory-retriever';
import type { MemoryRecord } from '@/memory/memory-record';
import type { RetrievalRequest } from '@/context/assembly/types';
import { memoryRecordsToContexts, decisionMemoryToContext, outcomeMemoryToContext } from '@/memory/memory-utils';
import { isDecisionMemory } from '@/memory/decision-memory';
import { isOutcomeMemory } from '@/memory/outcome-memory';
import { retrieveDecisionMemories } from '@/memory/decision-memory-retrieval';
import type { DecisionRetrievalParams } from '@/memory/decision-memory-retrieval';
import { retrieveOutcomeMemoriesWithMetadata } from '@/memory/outcome-memory-retrieval';
import type { OutcomeRetrievalParams } from '@/memory/outcome-memory-retrieval';
import { decisionFeedbackToContext } from '@/memory/decision-feedback-bridge';
import { buildDecisionFeedback } from '@/memory/decision-feedback-entry';
import type { DecisionFeedbackParams } from '@/memory/decision-feedback';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Default source limit for memory/knowledge/graph retrieval */
const DEFAULT_SOURCE_LIMIT = 50;

/** Maximum allowed source limit (safety cap) */
const MAX_SOURCE_LIMIT = 500;

/** Default feedback decision limit (max number of decisions to build feedback for) */
const DEFAULT_FEEDBACK_DECISION_LIMIT = 5;

/** Maximum allowed feedback decision limit */
const MAX_FEEDBACK_DECISION_LIMIT = 50;

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Retrieval Dependencies (P0.7.2 Extended)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dependencies for retrieveRuntimeContext.
 *
 * P0.7.2 Extended:
 *   - knowledgeRetriever: Optional ContextRetriever for knowledge contexts
 *   - graphContextProvider: Optional function for graph enrichment
 *   - now: Clock for deterministic feedback generation
 *   - sourceLimit: Max records per source (default: 50)
 *   - feedbackDecisionLimit: Max decisions to build feedback for (default: 5)
 */
export interface RuntimeRetrievalDependencies {
  /** MemoryRetriever for all memory records (owner-scoped) — REQUIRED */
  memoryRetriever: MemoryRetriever;

  /** Optional knowledge retriever for knowledge contexts */
  knowledgeRetriever?: ContextRetriever;

  /**
   * Optional graph enrichment provider.
   * Receives request and seed contexts, returns enriched contexts.
   */
  graphContextProvider?: (
    request: ContextOSRuntimeRequest,
    seedContexts: ContextObject[],
  ) => Promise<ContextObject[]>;

  /** Clock function for deterministic timestamps (default: Date.now()) */
  now?: () => string;

  /** Max records per source (default: 50, max: 500) */
  sourceLimit?: number;

  /** Max decisions to build feedback for (default: 5, max: 50) */
  feedbackDecisionLimit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unified Retrieval Entry Points
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve context objects for a runtime request with full diagnostics.
 *
 * P0.7.2: Unified retrieval across multiple sources:
 *   - Memory (general-purpose)
 *   - Decision (decision memories)
 *   - Outcome (outcome observations)
 *   - Feedback (decision-feedback derived views)
 *   - Knowledge (knowledge retriever)
 *   - Graph (graph enrichment provider)
 *
 * All sources are subject to:
 *   - Owner/Project/Topic isolation
 *   - Runtime scope policy
 *   - Kind filters (allowedKinds/excludedKinds)
 *   - Deterministic deduplication
 *
 * @param request - Runtime request with owner/project/topic scope
 * @param deps - Extended retrieval dependencies
 * @returns Full result with contexts and per-source diagnostics
 */
export async function retrieveRuntimeContextWithMetadata(
  request: ContextOSRuntimeRequest,
  deps: RuntimeRetrievalDependencies
): Promise<RuntimeContextRetrievalResult> {
  const policy = resolveRuntimePolicy(request.contextPolicy);
  const { ownerId, projectId, topicId, contextQuery } = request;
  const now = deps.now ?? (() => new Date().toISOString());
  const sourceLimit = clampSourceLimit(deps.sourceLimit);
  const feedbackDecisionLimit = clampFeedbackLimit(deps.feedbackDecisionLimit);

  const sources: RuntimeContextSourceReport[] = [];
  const allContexts: ContextObject[] = [];

  // ─── Source: Memory ────────────────────────────────────────────────────────
  if (policy.includeMemory !== false) {
    try {
      const memoryContexts = await retrieveMemoryContexts(
        request, deps, policy, sourceLimit
      );
      sources.push({
        source: 'memory',
        status: memoryContexts.length > 0 ? 'included' : 'disabled',
        contextCount: memoryContexts.length,
      });
      allContexts.push(...memoryContexts);
    } catch (err) {
      sources.push({
        source: 'memory',
        status: 'failed',
        contextCount: 0,
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sources.push({ source: 'memory', status: 'disabled', contextCount: 0 });
  }

  // ─── Source: Decision ──────────────────────────────────────────────────────
  if (policy.includeDecisions === true) {
    try {
      const decisionContexts = await retrieveDecisionContexts(
        deps, ownerId, projectId, topicId, sourceLimit
      );
      sources.push({
        source: 'decision',
        status: decisionContexts.length > 0 ? 'included' : 'disabled',
        contextCount: decisionContexts.length,
      });
      allContexts.push(...decisionContexts);
    } catch (err) {
      sources.push({
        source: 'decision',
        status: 'failed',
        contextCount: 0,
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sources.push({ source: 'decision', status: 'disabled', contextCount: 0 });
  }

  // ─── Source: Outcome ───────────────────────────────────────────────────────
  if (policy.includeOutcomes === true) {
    try {
      const outcomeContexts = await retrieveOutcomeContexts(
        deps, ownerId, projectId, topicId, sourceLimit
      );
      sources.push({
        source: 'outcome',
        status: outcomeContexts.length > 0 ? 'included' : 'disabled',
        contextCount: outcomeContexts.length,
      });
      allContexts.push(...outcomeContexts);
    } catch (err) {
      sources.push({
        source: 'outcome',
        status: 'failed',
        contextCount: 0,
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sources.push({ source: 'outcome', status: 'disabled', contextCount: 0 });
  }

  // ─── Source: Feedback ──────────────────────────────────────────────────────
  if (policy.includeFeedback === true) {
    try {
      const feedbackContexts = await retrieveFeedbackContexts(
        deps, ownerId, projectId, topicId, now, feedbackDecisionLimit
      );
      sources.push({
        source: 'feedback',
        status: feedbackContexts.length > 0 ? 'included' : 'disabled',
        contextCount: feedbackContexts.length,
      });
      allContexts.push(...feedbackContexts);
    } catch (err) {
      sources.push({
        source: 'feedback',
        status: 'failed',
        contextCount: 0,
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sources.push({ source: 'feedback', status: 'disabled', contextCount: 0 });
  }

  // ─── Source: Knowledge ─────────────────────────────────────────────────────
  if (policy.includeKnowledge === true) {
    if (deps.knowledgeRetriever) {
      try {
        const knowledgeContexts = await retrieveKnowledgeContexts(
          deps, request, contextQuery, sourceLimit
        );
        sources.push({
          source: 'knowledge',
          status: knowledgeContexts.length > 0 ? 'included' : 'disabled',
          contextCount: knowledgeContexts.length,
        });
        allContexts.push(...knowledgeContexts);
      } catch (err) {
        sources.push({
          source: 'knowledge',
          status: 'failed',
          contextCount: 0,
          warning: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      sources.push({ source: 'knowledge', status: 'unavailable', contextCount: 0 });
    }
  } else {
    sources.push({ source: 'knowledge', status: 'disabled', contextCount: 0 });
  }

  // ─── Source: Graph ─────────────────────────────────────────────────────────
  if (policy.includeGraph === true) {
    if (deps.graphContextProvider) {
      try {
        const graphContexts = await retrieveGraphContexts(
          deps, request, allContexts
        );
        sources.push({
          source: 'graph',
          status: graphContexts.length > 0 ? 'included' : 'disabled',
          contextCount: graphContexts.length,
        });
        allContexts.push(...graphContexts);
      } catch (err) {
        sources.push({
          source: 'graph',
          status: 'failed',
          contextCount: 0,
          warning: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      sources.push({ source: 'graph', status: 'unavailable', contextCount: 0 });
    }
  } else {
    sources.push({ source: 'graph', status: 'disabled', contextCount: 0 });
  }

  // ─── Post-processing ───────────────────────────────────────────────────────
  // Context-level owner/topic/project validation
  const validatedContexts = allContexts.filter((ctx) =>
    validateContextScope(ctx, ownerId, projectId, topicId)
  );

  // Apply kind filters
  const filteredContexts = applyKindFilters(validatedContexts, policy);

  // Deterministic dedup by context.id
  const dedupedContexts = deduplicateContexts(filteredContexts);

  const warnings: string[] = [];
  for (const s of sources) {
    if (s.warning) {
      warnings.push(`[${s.source}] ${s.warning}`);
    }
  }

  return {
    contexts: dedupedContexts,
    sources,
    warnings,
  };
}

/**
 * Retrieve context objects for a runtime request (backward-compatible).
 *
 * Calls retrieveRuntimeContextWithMetadata internally, returns only contexts.
 * Preserves P0.7.1 API contract: returns ContextObject[].
 *
 * @param request - Runtime request with owner/project/topic scope
 * @param deps - Retrieval dependencies
 * @returns ContextObjects ready for assembly
 */
export async function retrieveRuntimeContext(
  request: ContextOSRuntimeRequest,
  deps: RuntimeRetrievalDependencies
): Promise<ContextObject[]> {
  const result = await retrieveRuntimeContextWithMetadata(request, deps);
  return result.contexts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Source-Specific Retrieval Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieve general-purpose memory contexts.
 *
 * Excludes decision/outcome records (they are handled by their dedicated sources).
 * Prevents ctx_mem_xxx / ctx_dec_xxx (or ctx_out_xxx) duplication.
 */
async function retrieveMemoryContexts(
  request: ContextOSRuntimeRequest,
  deps: RuntimeRetrievalDependencies,
  policy: ContextOSContextPolicy,
  sourceLimit: number
): Promise<ContextObject[]> {
  const { ownerId, projectId, topicId } = request;
  const allowedScopes = policy.allowedScopes;

  let records: MemoryRecord[];

  // Multi-scope retrieval with deduplication (P0.7.1-R1 logic preserved)
  if (!allowedScopes || allowedScopes.length === 0) {
    records = await deps.memoryRetriever.retrieve({
      ownerId,
      projectId,
      topicId,
      policy: { maxResults: sourceLimit },
    });
  } else if (allowedScopes.length === 1) {
    records = await deps.memoryRetriever.retrieve({
      ownerId,
      projectId,
      topicId,
      scope: allowedScopes[0],
      policy: { maxResults: sourceLimit },
    });
  } else {
    const results = await Promise.all(
      allowedScopes.map((scope) =>
        deps.memoryRetriever.retrieve({
          ownerId,
          projectId,
          topicId,
          scope,
          policy: { maxResults: sourceLimit },
        })
      )
    );
    records = deduplicateMemoryRecords(results.flat());
  }

  // Exclude domain-specific records to prevent duplication
  // Decision and Outcome records are retrieved through their dedicated sources
  const generalRecords = records.filter(
    (r) => !isDecisionMemory(r) && !isOutcomeMemory(r)
  );

  return memoryRecordsToContexts(generalRecords);
}

/**
 * Retrieve decision contexts.
 * Uses dedicated decision retrieval path, not filtered from general memory.
 */
async function retrieveDecisionContexts(
  deps: RuntimeRetrievalDependencies,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
  sourceLimit: number
): Promise<ContextObject[]> {
  const params: DecisionRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: sourceLimit,
    includeSuperseded: true,
    includeReversed: true,
  };

  const decisions = await retrieveDecisionMemories(deps.memoryRetriever, params);

  // retrieveDecisionMemories already filters by type='decision' + status.
  const contexts: ContextObject[] = [];
  for (const decision of decisions) {
    try {
      contexts.push(decisionMemoryToContext(decision));
    } catch {
      // Conversion failure: skip, don't fabricate context
    }
  }

  return contexts;
}

/**
 * Retrieve outcome contexts.
 * Uses dedicated outcome retrieval with bounded window.
 */
async function retrieveOutcomeContexts(
  deps: RuntimeRetrievalDependencies,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
  sourceLimit: number
): Promise<ContextObject[]> {
  const params: OutcomeRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: sourceLimit,
  };

  const result = await retrieveOutcomeMemoriesWithMetadata(deps.memoryRetriever, params);

  // retrieveOutcomeMemoriesWithMetadata already filters by type='outcome' + payload criteria.
  const contexts: ContextObject[] = [];
  for (const outcome of result.outcomes) {
    try {
      contexts.push(outcomeMemoryToContext(outcome));
    } catch {
      // Conversion failure: skip
    }
  }

  return contexts;
}

/**
 * Retrieve feedback contexts.
 * Generates Decision Feedback for each retrieved Decision.
 *
 * Scope safety: uses the same MemoryRetriever adapter to ensure
 * buildDecisionFeedback inherits Runtime scope policy.
 */
async function retrieveFeedbackContexts(
  deps: RuntimeRetrievalDependencies,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
  now: () => string,
  feedbackDecisionLimit: number
): Promise<ContextObject[]> {
  // Retrieve decisions to build feedback for (bounded by feedbackDecisionLimit)
  const params: DecisionRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: feedbackDecisionLimit,
    includeSuperseded: true,
    includeReversed: true,
  };

  const decisions = await retrieveDecisionMemories(deps.memoryRetriever, params);
  const contexts: ContextObject[] = [];

  for (const decision of decisions) {
    try {
      // Build feedback using the same MemoryRetriever (scope-safe)
      const feedbackParams: DecisionFeedbackParams = {
        ownerId,
        decisionId: decision.id,
        projectId,
        topicId,
        now,
      };

      const feedback = await buildDecisionFeedback(
        deps.memoryRetriever,
        feedbackParams
      );
      contexts.push(decisionFeedbackToContext(feedback));
    } catch {
      // Feedback generation failure: skip, don't fabricate
    }
  }

  return contexts;
}

/**
 * Retrieve knowledge contexts from the optional knowledge retriever.
 */
async function retrieveKnowledgeContexts(
  deps: RuntimeRetrievalDependencies,
  request: ContextOSRuntimeRequest,
  contextQuery: string | undefined,
  sourceLimit: number
): Promise<ContextObject[]> {
  if (!deps.knowledgeRetriever) return [];

  const retrievalRequest: RetrievalRequest = {
    kind: 'knowledge',
    projectId: request.projectId,
    topicId: request.topicId,
    query: contextQuery,
    limit: sourceLimit,
  };

  return deps.knowledgeRetriever.retrieve(retrievalRequest);
}

/**
 * Retrieve graph-enriched contexts from the optional graph provider.
 */
async function retrieveGraphContexts(
  deps: RuntimeRetrievalDependencies,
  request: ContextOSRuntimeRequest,
  seedContexts: ContextObject[]
): Promise<ContextObject[]> {
  if (!deps.graphContextProvider) return [];

  return deps.graphContextProvider(request, seedContexts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Context Validation (Owner / Project / Topic Isolation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate a context against the runtime request's owner/project/topic boundaries.
 *
 * Rules:
 * - Context has ownerId different from request: exclude.
 * - Context has projectId but request has no matching project: exclude.
 * - Context has topicId but request has no matching topic: exclude.
 * - Memory-derived context must have matching owner.
 * - Unowned shared knowledge (no ownerId) is allowed.
 */
function validateContextScope(
  context: ContextObject,
  requestOwnerId: string,
  requestProjectId: string | undefined,
  requestTopicId: string | undefined
): boolean {
  const prov = context.provenance;

  // Owner check: if context has ownerId and doesn't match → exclude
  if (prov.ownerId && prov.ownerId !== requestOwnerId) {
    return false;
  }

  // Project check: if context has projectId but request doesn't match → exclude
  if (prov.projectId && requestProjectId && prov.projectId !== requestProjectId) {
    return false;
  }

  // Topic check: if context has topicId but request doesn't match → exclude
  if (prov.topicId && requestTopicId && prov.topicId !== requestTopicId) {
    return false;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Kind Filters
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply allowedKinds/excludedKinds filters to contexts.
 *
 * Rules:
 * - excludedKinds takes priority over allowedKinds.
 * - allowedKinds non-empty → only retain contexts in the whitelist.
 * - excludedKinds always remove matching contexts.
 * - Both empty → no filtering.
 */
function applyKindFilters(
  contexts: ContextObject[],
  policy: ContextOSContextPolicy
): ContextObject[] {
  let result = contexts;

  // excludedKinds always applies (blacklist)
  if (policy.excludedKinds && policy.excludedKinds.length > 0) {
    result = result.filter((ctx) => !policy.excludedKinds!.includes(ctx.kind));
  }

  // allowedKinds applies if non-empty (whitelist)
  if (policy.allowedKinds && policy.allowedKinds.length > 0) {
    result = result.filter((ctx) => policy.allowedKinds!.includes(ctx.kind));
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Deduplication
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Deterministic deduplication of ContextObjects by id.
 * Keeps the first occurrence. Preserves order.
 */
function deduplicateContexts(contexts: ContextObject[]): ContextObject[] {
  const seen = new Set<string>();
  const result: ContextObject[] = [];
  for (const ctx of contexts) {
    if (!seen.has(ctx.id)) {
      seen.add(ctx.id);
      result.push(ctx);
    }
  }
  return result;
}

/**
 * Deterministic deduplication of MemoryRecords by id.
 * Keeps the first occurrence. Preserves order.
 */
function deduplicateMemoryRecords<T>(records: MemoryRecord<T>[]): MemoryRecord<T>[] {
  const seen = new Set<string>();
  const result: MemoryRecord<T>[] = [];
  for (const record of records) {
    if (!seen.has(record.id)) {
      seen.add(record.id);
      result.push(record);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Clamp Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function clampSourceLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_SOURCE_LIMIT;
  if (limit < 1) return 1;
  if (limit > MAX_SOURCE_LIMIT) return MAX_SOURCE_LIMIT;
  return limit;
}

function clampFeedbackLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_FEEDBACK_DECISION_LIMIT;
  if (limit < 1) return 1;
  if (limit > MAX_FEEDBACK_DECISION_LIMIT) return MAX_FEEDBACK_DECISION_LIMIT;
  return limit;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Runtime Assembly (P0.7.1, preserved)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Assemble contexts into a RuntimeContextPackage.
 *
 * P0.7.1 implementation preserved. P0.7.3 will enhance.
 */
export async function assembleRuntimeContext(
  contexts: ContextObject[],
  policy: ContextOSContextPolicy | undefined,
  purpose: string,
  now: () => string = () => new Date().toISOString(),
): Promise<RuntimeContextPackage> {
  const timestamp = now();

  const assemblyPurpose = mapPurposeToAssembly(purpose);

  const assemblyRequest = {
    contexts,
    purpose: assemblyPurpose,
    maxTokens: policy?.maxTokens,
    maxContexts: policy?.maxContexts,
  };

  const assemblyResult = assembleContexts(assemblyRequest);
  const contextPackage = buildContextPackage(assemblyResult);
  const serialized = serializeContextPackage(contextPackage, {
    includeHeader: true,
  });

  const provenance: ContextProvenance[] = assemblyResult.selected.map(
    (s) => s.context.provenance
  );
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
// Policy Resolution (P0.7.2 Extended Defaults)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default runtime policy when none is provided.
 *
 * P0.7.2 adds: includeKnowledge: true
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
  includeKnowledge: true,
};

/**
 * Resolve runtime policy with defaults.
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
// Context Usage Tracking (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

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
// Purpose Mapping (preserved)
// ═══════════════════════════════════════════════════════════════════════════════

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
// Runtime Factory (P0.7.2 Extended)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a pre-configured runContextOS function with dependencies wired.
 *
 * @param memoryRetriever - MemoryRetriever instance
 * @param now - Optional clock function
 * @returns A runContextOS function with dependencies pre-wired
 */
export function createRuntimeRunner(
  memoryRetriever: MemoryRetriever,
  now: () => string = () => new Date().toISOString(),
) {
  return async (request: ContextOSRuntimeRequest) => {
    return runContextOS(request, {
      retrieveContext: (req) => retrieveRuntimeContext(req, { memoryRetriever, now }),
      assembleContext: (contexts, policy, purpose) =>
        assembleRuntimeContext(contexts, policy, purpose, now),
      now,
    });
  };
}
