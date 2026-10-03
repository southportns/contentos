/**
 * P0.6.7 — Context Loop Orchestrator
 *
 * Orchestrates the complete End-to-End Context Loop:
 *   Decision → Outcome → Feedback → Graph → Assembly → Learning → Memory
 *
 * Architecture Position:
 *
 *   runContextLoop()
 *       ↓
 *   [1] Validate Request
 *       ↓
 *   [2] Retrieve Decision (getDecisionById — O(1) exact-id)
 *       ↓
 *   [3] Build Decision Feedback (buildDecisionFeedback)
 *       ↓
 *   [4] Resolve Graph Context (getGraphContext — optional)
 *       ↓
 *   [5] Build Context Collection (all sources)
 *       ↓
 *   [6] Assemble Context (assembleContexts — Select→Rank→Dedup→Budget)
 *       ↓
 *   [7] Generate Learning Candidates (buildLearningCandidates)
 *       ↓
 *   [8] (Optional) Persist Learning Candidates as MemoryRecords
 *       ↓
 *   Return ContextLoopResult
 *
 * Design Principles:
 *   1. Orchestration only — delegates to existing subsystems
 *   2. Deterministic — same input always produces same output (except generatedAt)
 *   3. Partial success > total failure — non-fatal stages degrade gracefully
 *   4. No modification of Decision or Outcome records
 *   5. No Knowledge mutation — Learning Candidates returned, not persisted by default
 *   6. No LLM, no causal inference, no fuzzy relationships
 */

import type { ContextObject } from '../context-object';
import type { ContextAssemblyRequest } from '../assembly/types';
import { assembleContexts } from '../assembly/context-assembler';
import { getGraphContext } from '../graph/context-graph-assembly-bridge';
import { MemoryNotFoundError } from '@/memory/persistence/memory-persistence-types';
import { getDecisionById } from '@/memory/decision-memory-retrieval';
import { buildDecisionFeedback } from '@/memory/decision-feedback-entry';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import type { DecisionContext } from '../context-types';
import { decisionMemoryToContext } from '@/memory/memory-utils';
import { decisionFeedbackToContext } from '@/memory/decision-feedback-bridge';

import type {
  ContextLoopRequest,
  ContextLoopResult,
  ContextLoopDependencies,
  ContextLoopStageStatus,
  ContextLoopMetrics,
  ContextLoopCompleteness,
  ContextLoopWarning,
} from './context-loop-types';
import {
  makeLoopId,
  createInitialStageStatus,
  createInitialMetrics,
  determineLoopCompleteness,
} from './context-loop-types';
import { buildLearningCandidates } from './context-loop-learning';

// ═══════════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate a ContextLoopRequest for required fields.
 * @throws Error if request is invalid
 */
function validateRequest(request: ContextLoopRequest): void {
  if (!request.ownerId || request.ownerId.trim().length === 0) {
    throw new Error('ContextLoopRequest.ownerId is required');
  }
  if (!request.decisionId || request.decisionId.trim().length === 0) {
    throw new Error('ContextLoopRequest.decisionId is required');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a complete Context Loop.
 *
 * This is the main entry point for P0.6.7. It orchestrates all subsystems
 * into a single end-to-end pipeline.
 *
 * @param request - The loop request parameters
 * @param dependencies - Injected dependencies (for testability)
 * @return The complete loop result
 * @throws Error on fatal validation errors
 * @throws MemoryNotFoundError if Decision not found for owner
 */
export async function runContextLoop(
  request: ContextLoopRequest,
  dependencies: ContextLoopDependencies,
): Promise<ContextLoopResult> {
  const startTime = Date.now();
  const now = dependencies.now ?? (() => new Date().toISOString());
  const currentNow = now();

  const stageStatus = createInitialStageStatus();
  const metrics = createInitialMetrics();
  const warnings: string[] = [];

  // ─── Stage 1: Validate Request ─────────────────────────────────────────────
  validateRequest(request);

  const loopId = makeLoopId(request.decisionId);

  // ─── Stage 2: Retrieve Decision ───────────────────────────────────────────
  const decisionStartTime = Date.now();
  const decision = await getDecisionById(dependencies.memoryRetriever, {
    ownerId: request.ownerId,
    decisionId: request.decisionId,
    projectId: request.projectId,
    topicId: request.topicId,
  });
  metrics.decisionLookupMs = Date.now() - decisionStartTime;

  // Decision not found — throw (fatal, per spec section 39)
  if (!decision) {
    throw new MemoryNotFoundError(request.decisionId);
  }

  stageStatus.decision = true;

  // ─── Stage 3: Build Decision Feedback ─────────────────────────────────────
  const feedbackStartTime = Date.now();
  let feedback: DecisionFeedback | null = null;

  try {
    if (dependencies.decisionFeedbackBuilder) {
      feedback = await dependencies.decisionFeedbackBuilder(
        dependencies.memoryRetriever,
        {
          ownerId: request.ownerId,
          decisionId: request.decisionId,
          windowStart: request.windowStart,
          windowEnd: request.windowEnd,
          retrievalLimit: request.retrievalLimit,
        },
      );
    } else {
      // Use default builder — pass projectId/topicId for scope-restricted lookup
      // and now() provider for deterministic timestamps
      feedback = await buildDecisionFeedback(
        dependencies.memoryRetriever,
        {
          ownerId: request.ownerId,
          decisionId: request.decisionId,
          windowStart: request.windowStart,
          windowEnd: request.windowEnd,
          retrievalLimit: request.retrievalLimit,
          projectId: request.projectId,
          topicId: request.topicId,
          now: dependencies.now,
        },
      );
    }

    stageStatus.feedback = true;
    stageStatus.outcome = feedback.outcomeCount > 0;
    metrics.outcomeCount = feedback.outcomeCount;
  } catch (error) {
    // If feedback building fails, log warning but continue
    // (feedback might fail if outcome retrieval has issues)
    warnings.push(
      `Feedback building failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  metrics.feedbackMs = Date.now() - feedbackStartTime;

  // ─── Stage 4 & 5: Graph Traversal (optional) ──────────────────────────────
  const graphStartTime = Date.now();
  const allContexts: ContextObject[] = [];
  const graphContext: ContextObject[] = [];

  // Add Decision context (always)
  try {
    const decisionCtx = decisionMemoryToContext(decision);
    allContexts.push(decisionCtx);
  } catch {
    warnings.push('Failed to convert Decision to Context');
  }

  // Add Feedback context (if available)
  if (feedback) {
    try {
      const feedbackCtx = decisionFeedbackToContext(feedback);
      allContexts.push(feedbackCtx);
    } catch {
      warnings.push('Failed to convert DecisionFeedback to Context');
    }
  }

  // Graph traversal (if graph provided)
  if (request.graph) {
    try {
      const relatedContexts = getGraphContext(
        request.graph,
        request.decisionId,
        {
          maxDepth: request.graphDepth,
          direction: request.graphDirection,
          edgeTypes: request.graphEdgeTypes,
        },
      );

      if (relatedContexts.length > 0) {
        graphContext.push(...relatedContexts);
        allContexts.push(...relatedContexts);
        stageStatus.graph = true;
      }
    } catch (error) {
      warnings.push(
        `Graph traversal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  metrics.graphContextCount = graphContext.length;
  metrics.graphTraversalMs = Date.now() - graphStartTime;

  // ─── Stage 6: Context Assembly ─────────────────────────────────────────────
  const assemblyStartTime = Date.now();
  let assembledContext: ContextLoopResult['assembledContext'];

  if (allContexts.length > 0) {
    try {
      const assemblyRequest: ContextAssemblyRequest = {
        contexts: deduplicateContextsById(allContexts),
        purpose: request.assemblyPurpose ?? 'generic',
        projectId: request.projectId,
        topicId: request.topicId,
        maxTokens: request.maxTokens,
        maxContexts: request.maxContexts,
      };

      assembledContext = assembleContexts(assemblyRequest);
      stageStatus.assembly = true;
      metrics.contextCount = assemblyRequest.contexts.length;
    } catch (error) {
      warnings.push(
        `Context assembly failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  } else {
    warnings.push('No contexts available for assembly');
  }

  metrics.assemblyMs = Date.now() - assemblyStartTime;

  // ─── Stage 7: Generate Learning Candidates ─────────────────────────────────
  const learningStartTime = Date.now();
  const learningCandidates = [];

  if (feedback && stageStatus.outcome) {
    try {
      const candidates = buildLearningCandidates(decision, feedback, currentNow);
      learningCandidates.push(...candidates);
      if (candidates.length > 0) {
        stageStatus.learning = true;
      }
    } catch (error) {
      warnings.push(
        `Learning candidate generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  metrics.learningCandidateCount = learningCandidates.length;
  metrics.learningMs = Date.now() - learningStartTime;

  // ─── Stage 8: (Optional) Persist Learning Candidates ──────────────────────
  if (dependencies.persistLearningCandidate && learningCandidates.length > 0) {
    for (const candidate of learningCandidates) {
      try {
        await dependencies.persistLearningCandidate(candidate, request.ownerId);
      } catch (error) {
        warnings.push(
          `Failed to persist learning candidate ${candidate.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  // ─── Compute final result ──────────────────────────────────────────────────
  metrics.totalMs = Date.now() - startTime;

  const completeness = determineLoopCompleteness(stageStatus);

  return {
    loopId,
    decisionId: request.decisionId,
    decisionFound: true,
    feedback,
    graphContext,
    assembledContext,
    learningCandidates,
    completeness,
    stageStatus,
    warnings,
    metrics,
    generatedAt: currentNow,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility: Deduplicate contexts by ID
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Deduplicate ContextObjects by ID.
 * Keeps the first occurrence of each ID.
 */
function deduplicateContextsById(contexts: ContextObject[]): ContextObject[] {
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
