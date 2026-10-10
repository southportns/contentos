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
import { ContextOSRuntimeError } from './runtime-types';
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
import type { OutcomeRetrievalParams, OutcomeRetrievalMetadata } from '@/memory/outcome-memory-retrieval';
import { decisionFeedbackToContext } from '@/memory/decision-feedback-bridge';
import { buildDecisionFeedback } from '@/memory/decision-feedback-entry';
import type { DecisionFeedbackParams } from '@/memory/decision-feedback';
import type { MemoryScope } from '@/memory/memory-scope';

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

  // P0.7.2-R2: Track contexts with source labels so we can compute
  // contextCount AFTER validation/filter/dedup (not from raw provider output).
  const labeledContexts: Array<{ ctx: ContextObject; source: RuntimeContextSourceName }> = [];

  // Use a builder pattern to collect source statuses/metadata first,
  // then compute contextCount from the final surviving contexts.
  const sourceBuilders: Array<{
    source: RuntimeContextSourceName;
    status: RuntimeContextSourceStatus;
    warning?: string;
    metadata?: RuntimeContextSourceMetadata;
  }> = [];

  // Allowed scopes derived from policy (single scope extracted for direct use)
  const allowedScopes = policy.allowedScopes;
  const singleScope: MemoryScope | undefined =
    allowedScopes && allowedScopes.length === 1 ? allowedScopes[0] : undefined;

  // ─── Source: Memory ────────────────────────────────────────────────────────
  // Memory is the PRIMARY source. Failure must propagate — never silently return.
  if (policy.includeMemory !== false) {
    try {
      const memoryContexts = await retrieveMemoryContexts(
        request, deps, policy, sourceLimit
      );
      for (const ctx of memoryContexts) {
        labeledContexts.push({ ctx, source: 'memory' });
      }
      sourceBuilders.push({ source: 'memory', status: 'included' });
    } catch (err) {
      // Primary source failure: propagate error upward
      throw new ContextOSRuntimeError(
        'RUNTIME_EXECUTION',
        `Primary memory retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
        request.taskId
      );
    }
  } else {
    sourceBuilders.push({ source: 'memory', status: 'disabled' });
  }

  // ─── Source: Decision ──────────────────────────────────────────────────────
  // Optional source. Failure is isolated — does not block other sources.
  if (policy.includeDecisions === true) {
    try {
      const decisionContexts = await retrieveDecisionContexts(
        deps, ownerId, projectId, topicId, sourceLimit, allowedScopes, singleScope
      );
      for (const ctx of decisionContexts) {
        labeledContexts.push({ ctx, source: 'decision' });
      }
      sourceBuilders.push({ source: 'decision', status: 'included' });
    } catch (err) {
      sourceBuilders.push({
        source: 'decision',
        status: 'failed',
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sourceBuilders.push({ source: 'decision', status: 'disabled' });
  }

  // ─── Source: Outcome ───────────────────────────────────────────────────────
  // Optional source with metadata preservation.
  if (policy.includeOutcomes === true) {
    try {
      const { contexts: outcomeContexts, metadata: outcomeMetadata } = await retrieveOutcomeContexts(
        deps, ownerId, projectId, topicId, sourceLimit, allowedScopes, singleScope
      );
      for (const ctx of outcomeContexts) {
        labeledContexts.push({ ctx, source: 'outcome' });
      }
      sourceBuilders.push({
        source: 'outcome',
        status: 'included',
        metadata: {
          scannedRecords: outcomeMetadata.scannedRecords,
          batchesFetched: outcomeMetadata.batchesFetched,
          truncated: outcomeMetadata.truncated,
          exhausted: outcomeMetadata.exhausted,
        },
      });
    } catch (err) {
      sourceBuilders.push({
        source: 'outcome',
        status: 'failed',
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sourceBuilders.push({ source: 'outcome', status: 'disabled' });
  }

  // ─── Source: Feedback ──────────────────────────────────────────────────────
  if (policy.includeFeedback === true) {
    try {
      const feedbackContexts = await retrieveFeedbackContexts(
        deps, ownerId, projectId, topicId, now, feedbackDecisionLimit,
        allowedScopes, singleScope
      );
      for (const ctx of feedbackContexts) {
        labeledContexts.push({ ctx, source: 'feedback' });
      }
      sourceBuilders.push({ source: 'feedback', status: 'included' });
    } catch (err) {
      sourceBuilders.push({
        source: 'feedback',
        status: 'failed',
        warning: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    sourceBuilders.push({ source: 'feedback', status: 'disabled' });
  }

  // ─── Source: Knowledge ─────────────────────────────────────────────────────
  if (policy.includeKnowledge === true) {
    if (deps.knowledgeRetriever) {
      try {
        const knowledgeContexts = await retrieveKnowledgeContexts(
          deps, request, contextQuery, sourceLimit
        );
        for (const ctx of knowledgeContexts) {
          labeledContexts.push({ ctx, source: 'knowledge' });
        }
        sourceBuilders.push({ source: 'knowledge', status: 'included' });
      } catch (err) {
        sourceBuilders.push({
          source: 'knowledge',
          status: 'failed',
          warning: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      sourceBuilders.push({ source: 'knowledge', status: 'unavailable' });
    }
  } else {
    sourceBuilders.push({ source: 'knowledge', status: 'disabled' });
  }

  // ─── Post-processing BEFORE Graph Provider ────────────────────────────────
  // Validate and filter contexts BEFORE feeding them to the Graph Provider.
  // This prevents out-of-bound or cross-owner contexts from reaching graph enrichment.
  const validatedLabeled = labeledContexts.filter(({ ctx }) =>
    validateContextScope(ctx, ownerId, projectId, topicId, allowedScopes)
  );

  // Apply kind filters
  const filteredLabeled = validatedLabeled.filter(({ ctx }) =>
    applyKindFilters([ctx], policy).length > 0
  );

  // Deterministic dedup by context.id (keep first occurrence)
  const seenIds = new Set<string>();
  const dedupedLabeled: typeof filteredLabeled = [];
  for (const item of filteredLabeled) {
    if (!seenIds.has(item.ctx.id)) {
      seenIds.add(item.ctx.id);
      dedupedLabeled.push(item);
    }
  }

  const dedupedContexts = dedupedLabeled.map(({ ctx }) => ctx);

  // ─── Source: Graph ─────────────────────────────────────────────────────────
  // Graph receives only validated, filtered, deduplicated contexts as seeds.
  if (policy.includeGraph === true) {
    if (deps.graphContextProvider) {
      try {
        const graphContexts = await retrieveGraphContexts(
          deps, request, dedupedContexts
        );
        // Graph contexts must also pass scope/owner validation
        const validatedGraphContexts = graphContexts.filter((ctx) =>
          validateContextScope(ctx, ownerId, projectId, topicId, allowedScopes)
        );
        for (const ctx of validatedGraphContexts) {
          labeledContexts.push({ ctx, source: 'graph' });
        }
        sourceBuilders.push({ source: 'graph', status: 'included' });
      } catch (err) {
        sourceBuilders.push({
          source: 'graph',
          status: 'failed',
          warning: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      sourceBuilders.push({ source: 'graph', status: 'unavailable' });
    }
  } else {
    sourceBuilders.push({ source: 'graph', status: 'disabled' });
  }

  // ─── Final pass: re-validate ALL labeled contexts and deduplicate ──────────
  // P0.7.2-R2: contextCount must reflect contexts that survived ALL checks.
  const finalLabeled = labeledContexts.filter(({ ctx }) =>
    validateContextScope(ctx, ownerId, projectId, topicId, allowedScopes)
  );
  const finalFiltered = finalLabeled.filter(({ ctx }) =>
    applyKindFilters([ctx], policy).length > 0
  );
  const finalSeenIds = new Set<string>();
  const finalDedupedLabeled: typeof finalFiltered = [];
  for (const item of finalFiltered) {
    if (!finalSeenIds.has(item.ctx.id)) {
      finalSeenIds.add(item.ctx.id);
      finalDedupedLabeled.push(item);
    }
  }

  // ─── Build source reports with accurate contextCount ──────────────────────
  // P0.7.2-R2: Count per source from the FINAL surviving contexts.
  // This ensures contextCount never includes rejected/out-of-bound data.
  const sourceContextCounts = new Map<RuntimeContextSourceName, number>();
  for (const item of finalDedupedLabeled) {
    sourceContextCounts.set(item.source, (sourceContextCounts.get(item.source) ?? 0) + 1);
  }

  const sources: RuntimeContextSourceReport[] = sourceBuilders.map((builder) => ({
    source: builder.source,
    status: builder.status,
    contextCount: sourceContextCounts.get(builder.source) ?? 0,
    warning: builder.warning,
    metadata: builder.metadata,
  }));

  const warnings: string[] = [];
  for (const s of sources) {
    if (s.warning) {
      warnings.push(`[${s.source}] ${s.warning}`);
    }
  }

  return {
    contexts: finalDedupedLabeled.map(({ ctx }) => ctx),
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
  sourceLimit: number,
  allowedScopes: MemoryScope[] | undefined,
  singleScope: MemoryScope | undefined
): Promise<ContextObject[]> {
  // Multi-scope: run each scope separately and deduplicate
  if (allowedScopes && allowedScopes.length > 1) {
    const results = await Promise.all(
      allowedScopes.map((scope) => {
        const params: DecisionRetrievalParams = {
          ownerId,
          projectId,
          topicId,
          limit: sourceLimit,
          includeSuperseded: true,
          includeReversed: true,
          scope,
        };
        return retrieveDecisionMemories(deps.memoryRetriever, params);
      })
    );
    const allDecisions = deduplicateMemoryRecords(results.flat());
    return convertDecisionsToContexts(allDecisions);
  }

  const params: DecisionRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: sourceLimit,
    includeSuperseded: true,
    includeReversed: true,
    scope: singleScope,
  };

  const decisions = await retrieveDecisionMemories(deps.memoryRetriever, params);
  return convertDecisionsToContexts(decisions);
}

/** Convert DecisionMemory records to ContextObjects, skipping conversion failures */
function convertDecisionsToContexts(decisions: DecisionMemory[]): ContextObject[] {
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
 * Returns both contexts and retrieval metadata for diagnostic reporting.
 */
async function retrieveOutcomeContexts(
  deps: RuntimeRetrievalDependencies,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
  sourceLimit: number,
  allowedScopes: MemoryScope[] | undefined,
  singleScope: MemoryScope | undefined
): Promise<{ contexts: ContextObject[]; metadata: OutcomeRetrievalMetadata }> {
  const params: OutcomeRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: sourceLimit,
    scope: singleScope,
  };

  let result = await retrieveOutcomeMemoriesWithMetadata(deps.memoryRetriever, params);

  // Multi-scope: run each scope separately, merge outcomes, aggregate metadata
  if (allowedScopes && allowedScopes.length > 1) {
    const results = await Promise.all(
      allowedScopes.map((scope) => {
        const multiParams: OutcomeRetrievalParams = {
          ownerId,
          projectId,
          topicId,
          limit: sourceLimit,
          scope,
        };
        return retrieveOutcomeMemoriesWithMetadata(deps.memoryRetriever, multiParams);
      })
    );

    // Merge all outcomes, deduplicate by id
    const allOutcomes = deduplicateMemoryRecords(
      results.flatMap((r) => r.outcomes)
    ) as import('@/memory/outcome-memory').OutcomeMemory[];

    // Aggregate metadata (conservative: truncated if any truncated, sum scans)
    const aggregatedMetadata: OutcomeRetrievalMetadata = {
      scannedRecords: results.reduce((sum, r) => sum + r.metadata.scannedRecords, 0),
      batchesFetched: results.reduce((sum, r) => sum + r.metadata.batchesFetched, 0),
      truncated: results.some((r) => r.metadata.truncated),
      exhausted: results.every((r) => r.metadata.exhausted),
    };

    result = { outcomes: allOutcomes, metadata: aggregatedMetadata };
  }

  // retrieveOutcomeMemoriesWithMetadata already filters by type='outcome' + payload criteria.
  const contexts: ContextObject[] = [];
  for (const outcome of result.outcomes) {
    try {
      contexts.push(outcomeMemoryToContext(outcome));
    } catch {
      // Conversion failure: skip
    }
  }

  return { contexts, metadata: result.metadata };
}

/**
 * Retrieve feedback contexts.
 * Generates Decision Feedback for each retrieved Decision.
 *
 * P0.7.2-R2 Scope safety:
 *   - Decision retrieval enforces Runtime scope boundaries (same as other sources).
 *   - For each decision, the feedback build uses the decision's OWN scope
 *     (not the runtime singleScope), ensuring outcome retrieval stays within
 *     the allowed boundary.  In multi-scope mode, each decision carries its
 *     concrete scope from its source record; that scope is guaranteed to be
 *     within allowedScopes because the decision was retrieved via allowedScopes.
 *   - Provenance (projectId/topicId/scope) from the decision is explicitly
 *     threaded into the feedback context so it passes validateContextScope.
 */
async function retrieveFeedbackContexts(
  deps: RuntimeRetrievalDependencies,
  ownerId: string,
  projectId: string | undefined,
  topicId: string | undefined,
  now: () => string,
  feedbackDecisionLimit: number,
  allowedScopes: MemoryScope[] | undefined,
  singleScope: MemoryScope | undefined
): Promise<ContextObject[]> {
  // Scope-safe decision retrieval: enforce the same Runtime scope boundaries
  const params: DecisionRetrievalParams = {
    ownerId,
    projectId,
    topicId,
    limit: feedbackDecisionLimit,
    includeSuperseded: true,
    includeReversed: true,
    scope: singleScope,
  };

  let decisions: import('@/memory/decision-memory').DecisionMemory[];

  if (allowedScopes && allowedScopes.length > 1) {
    // Multi-scope: retrieve from each scope and deduplicate
    const results = await Promise.all(
      allowedScopes.map((scope) =>
        retrieveDecisionMemories(deps.memoryRetriever, { ...params, scope })
      )
    );
    decisions = deduplicateMemoryRecords(results.flat());
  } else {
    decisions = await retrieveDecisionMemories(deps.memoryRetriever, params);
  }

  const contexts: ContextObject[] = [];

  for (const decision of decisions) {
    try {
      // P0.7.2-R2: Use the decision's OWN scope for nested outcome retrieval.
      // In single-scope mode, decision.scope === singleScope.
      // In multi-scope mode, decision.scope is the concrete scope this
      // decision was found in (guaranteed ∈ allowedScopes).
      // This prevents outcome retrieval from expanding beyond allowed boundaries.
      const decisionScope = decision.scope ?? undefined;

      const feedbackParams: DecisionFeedbackParams = {
        ownerId,
        decisionId: decision.id,
        projectId,
        topicId,
        now,
        scope: decisionScope,
      };

      const feedback = await buildDecisionFeedback(
        deps.memoryRetriever,
        feedbackParams
      );

      // P0.7.2-R2: Thread the decision's real provenance into the feedback
      // context so it survives validateContextScope with full boundary info.
      contexts.push(decisionFeedbackToContext(feedback, {
        projectId: decision.projectId,
        topicId: decision.topicId,
        scope: decisionScope as import('@/context/context-provenance').ContextScope,
      }));
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
 * P0.7.2-R3 — Strict scope completeness & provenance integrity:
 *
 * 1. Owner isolation:
 *    - If context has ownerId and it does not match request owner → REJECT.
 *    - Memory, Decision, Outcome, Feedback are user-owned data → must have correct owner.
 *    - No-owner non-public data → REJECT (cannot be treated as shared just because owner missing).
 *
 * 2. Shared knowledge exception (strict):
 *    - Only unowned (no ownerId), sourceType === 'knowledge', scope === 'global',
 *      and no project/topic restrictions → ALLOW.
 *    - Regular graph/memory data without owner → REJECT.
 *
 * 3. Scope completeness (P0.7.2-R3):
 *    - When allowedScopes is non-empty, provenance.scope MUST exist, be a valid scope,
 *      AND belong to the allowed list. Missing scope → REJECT.
 *    - provenance.scope === 'unknown' or unrecognized → REJECT.
 *
 * 4. Scope-specific provenance integrity (P0.7.2-R3):
 *    - scope === 'global': must NOT carry projectId or topicId (contradicts global boundary).
 *    - scope === 'project': must have valid projectId, must NOT carry topicId.
 *    - scope === 'topic': must have both valid projectId AND topicId.
 *
 * 5. Project / Topic isolation:
 *    - If context has projectId → request must have matching projectId. If request has no
 *      projectId → project-scoped context is REJECTED.
 *    - If context has topicId → request must have matching topicId AND projectId must also match.
 *
 * 6. Contradiction guard (P0.7.2-R3):
 *    - Even when allowedScopes is empty, scope/project/topic contradictions are rejected:
 *      e.g., scope='global' but projectId present → REJECT.
 *
 * @param context - ContextObject to validate
 * @param requestOwnerId - The runtime request's owner ID
 * @param requestProjectId - The runtime request's project scope (undefined = no project scope)
 * @param requestTopicId - The runtime request's topic scope (undefined = no topic scope)
 * @param allowedScopes - Optional runtime policy scope restriction
 * @returns True if the context passes all boundary checks
 */
function validateContextScope(
  context: ContextObject,
  requestOwnerId: string,
  requestProjectId: string | undefined,
  requestTopicId: string | undefined,
  allowedScopes?: MemoryScope[]
): boolean {
  const prov = context.provenance;
  const scope = prov.scope;

  // ─── 1. Owner isolation ──────────────────────────────────────────────────
  // If context has an ownerId, it must match exactly.
  // Mismatch → immediate reject. Match → continue to further checks
  // (NEVER short-circuit return true just because owner matches).
  if (prov.ownerId != null && prov.ownerId !== '') {
    if (prov.ownerId !== requestOwnerId) {
      return false;
    }
    // Owner matches — fall through to project/topic/scope validation below.
  } else {
    // ─── 2. No ownerId — check if this is legitimate shared knowledge ──────
    // Only allow unowned data when ALL of these conditions hold:
    //   - sourceType is 'knowledge' (explicit knowledge classification)
    //   - scope is 'global' (explicit global classification)
    //   - no projectId or topicId restrictions (unrestricted sharing)
    const isSharedKnowledge =
      prov.sourceType === 'knowledge' &&
      scope === 'global' &&
      !prov.projectId &&
      !prov.topicId;

    if (!isSharedKnowledge) {
      // No owner and not legitimate shared knowledge → reject
      // This prevents Graph data, memory data, etc. from leaking without owner
      return false;
    }
    // Shared global knowledge falls through to scope validation below.
  }

  // ─── 3. Scope validation ────────────────────────────────────────────────
  // unknown scope is not allowed (even if sourceType is knowledge)
  if (scope === 'unknown') {
    return false;
  }
  // Reject unrecognized scope values (only global/project/topic are valid ContextScope).
  // Note: MemoryScope includes 'session' but ContextScope does not — session is rejected here.
  if (scope !== undefined && scope !== null && scope !== 'global' && scope !== 'project' && scope !== 'topic') {
    return false;
  }

  // ─── 4. allowedScopes enforcement (STRICT — P0.7.2-R3) ──────────────────
  // When allowedScopes is non-empty, scope MUST exist AND be in the allowed list.
  // Missing scope when allowedScopes is set → REJECT.
  if (allowedScopes && allowedScopes.length > 0) {
    if (!scope || !allowedScopes.includes(scope)) {
      return false;
    }
  }

  // ─── 5. Scope-specific provenance integrity (P0.7.2-R3) ─────────────────
  // These checks fire regardless of allowedScopes — they catch contradictions
  // in the context's own metadata.
  //
  // scope='global': must NOT carry projectId or topicId (contradicts global boundary).
  // scope='project': must have valid projectId AND must NOT carry topicId.
  // scope='topic': must have both valid projectId AND topicId.
  if (scope === 'global') {
    if (prov.projectId != null && prov.projectId !== '') {
      return false; // global scope contradicts project restriction
    }
    if (prov.topicId != null && prov.topicId !== '') {
      return false; // global scope contradicts topic restriction
    }
  } else if (scope === 'project') {
    if (!prov.projectId || prov.projectId === '') {
      return false; // project scope requires valid projectId
    }
    if (prov.topicId != null && prov.topicId !== '') {
      return false; // project scope must not carry topicId
    }
  } else if (scope === 'topic') {
    if (!prov.projectId || prov.projectId === '') {
      return false; // topic scope requires valid projectId
    }
    if (!prov.topicId || prov.topicId === '') {
      return false; // topic scope requires valid topicId
    }
  }
  // Note: scope === undefined (and not caught by allowedScopes above) falls through.
  // This preserves native scope inference semantics when allowedScopes is empty.

  // ─── 6. Project isolation ──────────────────────────────────────────────
  // If context carries projectId, request must have matching projectId.
  // If request has no projectId, project-scoped context is REJECTED.
  if (prov.projectId != null && prov.projectId !== '') {
    if (!requestProjectId || requestProjectId !== prov.projectId) {
      return false;
    }
  }

  // ─── 7. Topic isolation ─────────────────────────────────────────────────
  // If context carries topicId, request must have matching topicId AND projectId.
  if (prov.topicId != null && prov.topicId !== '') {
    if (!requestTopicId || requestTopicId !== prov.topicId) {
      return false;
    }
    // projectId must also match (topic is always sub-scope of project)
    if (!requestProjectId || requestProjectId !== prov.projectId) {
      return false;
    }
  }

  // All checks passed
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
 *
 * Kept for backward-compatible external use even though the unified
 * pipeline now performs dedup inline with source tracking.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
 * Dependencies for createRuntimeRunner (P0.7.4 Extended).
 *
 * Allows callers to optionally inject a Run Store for persistence.
 * When runStore is not provided, the runner operates in memory-only mode
 * (backward-compatible with P0.7.1 — P0.7.3).
 */
export interface RuntimeRunnerDependencies {
  memoryRetriever: MemoryRetriever;
  now?: () => string;
  /**
   * P0.7.4 — Optional Run Store.
   * When provided, every call persists the Run lifecycle.
   * When NOT provided, Runs stay in memory only.
   */
  runStore?: import('./run-store').ContextOSRunStore;
}

/**
 * Create a pre-configured runContextOS function with dependencies wired.
 *
 * P0.7.4 Extended: accepts RuntimeRunnerDependencies object.
 *
 * @param deps - Runner dependencies (memoryRetriever, now?, runStore?)
 * @returns A runContextOS function with dependencies pre-wired
 *
 * Backward compatibility:
 *   - createRuntimeRunner(retriever)          → in-memory only
 *   - createRuntimeRunner(retriever, clock)   → in-memory only (deprecated)
 *   - createRuntimeRunner({ memoryRetriever, now, runStore }) → persistent
 */
export function createRuntimeRunner(
  memoryRetrieverOrDeps: MemoryRetriever | RuntimeRunnerDependencies,
  nowOrUndefined?: () => string,
) {
  // Support legacy 2-arg call: createRuntimeRunner(retriever, now?)
  let memoryRetriever: MemoryRetriever;
  let now: () => string;
  let runStore: import('./run-store').ContextOSRunStore | undefined;

  if (nowOrUndefined !== undefined || !('memoryRetriever' in (memoryRetrieverOrDeps as object))) {
    // Legacy positional call: (retriever, now?)
    memoryRetriever = memoryRetrieverOrDeps as MemoryRetriever;
    now = nowOrUndefined ?? (() => new Date().toISOString());
    runStore = undefined;
  } else {
    // New object call: ({ memoryRetriever, now?, runStore? })
    const deps = memoryRetrieverOrDeps as RuntimeRunnerDependencies;
    memoryRetriever = deps.memoryRetriever;
    now = deps.now ?? (() => new Date().toISOString());
    runStore = deps.runStore;
  }

  return async (request: ContextOSRuntimeRequest) => {
    return runContextOS(request, {
      retrieveContext: (req) => retrieveRuntimeContext(req, { memoryRetriever, now }),
      assembleContext: (contexts, policy, purpose) =>
        assembleRuntimeContext(contexts, policy, purpose, now),
      now,
      runStore,
    });
  };
}
