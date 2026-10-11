/**
 * P0.7.5 — Runtime Learning Pipeline
 *
 * Orchestrates: LearningCandidate → Policy → MemoryStore.
 *
 * Architecture Position:
 *
 *   buildLearningCandidates()  [P0.6.7 Context Loop]
 *       ↓
 *   evaluateLearningCandidate()  (pure policy evaluator)
 *       ↓
 *   persistEligibleCandidate()  (owner-scoped idempotent store)
 *       ↓
 *   RuntimeLearningResult  (counter aggregation)
 *
 * Design Principles:
 *   1. Three-phase processing: generate → evaluate → persist
 *   2. Deterministic policy evaluation (no side effects in evaluator)
 *   3. Owner isolation enforced at batch preflight AND per-record persistence
 *   4. Idempotent persistence (owner-scoped lookup before create)
 *   5. Fail-closed: any auth/owner mismatch throws before any storage I/O
 *   6. Memory record deduplication via deterministic ID: mem_${candidateId}
 */

import {
  buildLearningCandidates,
} from '@/context/loop/context-loop-learning';
import type { LearningCandidate } from '@/context/loop/context-loop-types';
import type { LearningCandidateType } from '@/context/loop/context-loop-types';
import type { DecisionMemory } from '@/memory/decision-memory';
import type { DecisionFeedback } from '@/memory/decision-feedback';
import type { MemoryStore } from '@/memory/persistence/memory-store';
import type { MemoryRecord } from '@/memory/memory-record';
import type { PersistentMemoryScope } from '@/memory/memory-scope';
import {
  MemoryConcurrencyError,
} from '@/memory/persistence/memory-persistence-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class LearningAuthorizationError extends Error {
  constructor(
    public readonly id: string,
    message?: string,
  ) {
    super(message ?? `Learning pipeline authorization denied: id=${id}`);
    this.name = 'LearningAuthorizationError';
  }
}

export class LearningValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LearningValidationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface RuntimeLearningSource {
  decision: DecisionMemory;
  feedback: DecisionFeedback;
}

export interface RuntimeLearningDependencies {
  memoryStore: MemoryStore;
  now?: () => string;
}

export interface RuntimeLearningInput {
  authenticatedOwnerId: string;
  sources: readonly RuntimeLearningSource[];
  policy?: Partial<ContextOSLearningPolicy>;
}

export interface ContextOSLearningPolicy {
  minConfidence: number;
  minImportance: number;
  maxCandidatesPerRun: number;
  allowedCandidateTypes: readonly LearningCandidateType[];
  allowedScopes: readonly PersistentMemoryScope[];
  requireOutcomeEvidence: boolean;
}

export type RuntimeLearningPolicyReasonCode =
  | 'VALID_POLICY'
  | 'DISALLOWED_CANDIDATE_TYPE'
  | 'BELOW_MIN_CONFIDENCE'
  | 'BELOW_MIN_IMPORTANCE'
  | 'INVALID_CONFIDENCE'
  | 'INVALID_IMPORTANCE'
  | 'INVALID_STATUS'
  | 'MISSING_DECISION_SOURCE'
  | 'MISSING_FEEDBACK_SOURCE'
  | 'MISSING_OUTCOME_SOURCE'
  | 'SCOPE_NOT_ALLOWED';

export interface RuntimeLearningPolicyEvaluation {
  eligible: boolean;
  reasonCode: RuntimeLearningPolicyReasonCode;
  resolvedScope?: PersistentMemoryScope;
  resolvedProjectId?: string;
  resolvedTopicId?: string;
}

export type RuntimeLearningItemStatus =
  | 'persisted'
  | 'discarded'
  | 'already_exists'
  | 'failed';

export interface RuntimeLearningItemResult {
  candidateId: string;
  status: RuntimeLearningItemStatus;
  reasonCode?: RuntimeLearningPolicyReasonCode | 'MAX_CANDIDATES_PER_RUN';
  scope?: PersistentMemoryScope;
}

export interface RuntimeLearningResult {
  items: RuntimeLearningItemResult[];
  counts: {
    persisted: number;
    discarded: number;
    already_exists: number;
    failed: number;
    total: number;
  };
  processingTimestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Policy
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_LEARNING_POLICY: ContextOSLearningPolicy = {
  minConfidence: 0.3,
  minImportance: 0,
  maxCandidatesPerRun: 20,
  allowedCandidateTypes: [
    'decision_pattern',
    'successful_pattern',
    'failure_pattern',
    'preference_signal',
    'strategy_signal',
  ],
  allowedScopes: ['topic', 'project'],
  requireOutcomeEvidence: true,
};

export { DEFAULT_LEARNING_POLICY };

// ═══════════════════════════════════════════════════════════════════════════════
// Policy Validation
// ═══════════════════════════════════════════════════════════════════════════════

export function validatePolicy(
  partial: Partial<ContextOSLearningPolicy> = {},
): ContextOSLearningPolicy {
  const merged: ContextOSLearningPolicy = {
    ...DEFAULT_LEARNING_POLICY,
    ...partial,
  };

  // Arrays: use caller-provided value if explicitly set, else keep default
  if (partial.allowedCandidateTypes !== undefined) {
    merged.allowedCandidateTypes = partial.allowedCandidateTypes;
  }
  if (partial.allowedScopes !== undefined) {
    merged.allowedScopes = partial.allowedScopes;
  }

  if (
    typeof merged.minConfidence !== 'number' ||
    !Number.isFinite(merged.minConfidence) ||
    merged.minConfidence < 0 ||
    merged.minConfidence > 1
  ) {
    throw new LearningValidationError(
      `minConfidence must be a finite number in [0, 1]. Got: ${merged.minConfidence}`,
    );
  }

  if (
    typeof merged.minImportance !== 'number' ||
    !Number.isFinite(merged.minImportance) ||
    merged.minImportance < 0 ||
    merged.minImportance > 1
  ) {
    throw new LearningValidationError(
      `minImportance must be a finite number in [0, 1]. Got: ${merged.minImportance}`,
    );
  }

  if (
    typeof merged.maxCandidatesPerRun !== 'number' ||
    !Number.isInteger(merged.maxCandidatesPerRun) ||
    merged.maxCandidatesPerRun < 1
  ) {
    throw new LearningValidationError(
      `maxCandidatesPerRun must be a positive integer >= 1. Got: ${merged.maxCandidatesPerRun}`,
    );
  }

  if (
    !Array.isArray(merged.allowedCandidateTypes) ||
    merged.allowedCandidateTypes.length === 0
  ) {
    throw new LearningValidationError(
      'allowedCandidateTypes must be a non-empty array of LearningCandidateType values',
    );
  }

  if (!Array.isArray(merged.allowedScopes) || merged.allowedScopes.length === 0) {
    throw new LearningValidationError(
      'allowedScopes must be a non-empty array of PersistentMemoryScope values',
    );
  }

  return merged;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pure Policy Evaluator
// ═══════════════════════════════════════════════════════════════════════════════

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

export function evaluateLearningCandidate(
  candidate: LearningCandidate,
  policy: ContextOSLearningPolicy,
): RuntimeLearningPolicyEvaluation {
  const ineligible = (
    reason: RuntimeLearningPolicyReasonCode,
  ): RuntimeLearningPolicyEvaluation => ({
    eligible: false,
    reasonCode: reason,
  });

  // 1. Confidence must be finite number in [0, 1]
  if (!isValidScore(candidate.confidence)) {
    return ineligible('INVALID_CONFIDENCE');
  }

  // 2. Importance must be finite number in [0, 1]
  if (!isValidScore(candidate.importance)) {
    return ineligible('INVALID_IMPORTANCE');
  }

  // 3. Candidate status must be 'candidate'
  if (candidate.status !== 'candidate') {
    return ineligible('INVALID_STATUS');
  }

  // 4. Type must be allowed
  if (!policy.allowedCandidateTypes.includes(candidate.type)) {
    return ineligible('DISALLOWED_CANDIDATE_TYPE');
  }

  // 5. Confidence >= minConfidence
  if (candidate.confidence < policy.minConfidence) {
    return ineligible('BELOW_MIN_CONFIDENCE');
  }

  // 6. Importance >= minImportance (only if threshold > 0 to retain default behavior)
  if (policy.minImportance > 0 && candidate.importance < policy.minImportance) {
    return ineligible('BELOW_MIN_IMPORTANCE');
  }

  // 7. Decision source required
  if (!isNonEmptyString(candidate.sourceDecisionId)) {
    return ineligible('MISSING_DECISION_SOURCE');
  }

  // 8. Feedback source required
  if (!isNonEmptyString(candidate.sourceFeedbackId)) {
    return ineligible('MISSING_FEEDBACK_SOURCE');
  }

  // 9. Outcome evidence required (when policy demands it)
  if (policy.requireOutcomeEvidence && candidate.sourceOutcomeIds.length === 0) {
    return ineligible('MISSING_OUTCOME_SOURCE');
  }

  // 10. Resolve scope
  const scopeResult = resolveLearningScope(candidate);

  // 11. Session scope must never be persisted as long-term memory
  if (scopeResult.scope === 'session') {
    return ineligible('SCOPE_NOT_ALLOWED');
  }

  // 12. Scope allowlist policy
  if (!policy.allowedScopes.includes(scopeResult.scope)) {
    return ineligible('SCOPE_NOT_ALLOWED');
  }

  return {
    eligible: true,
    reasonCode: 'VALID_POLICY',
    resolvedScope: scopeResult.scope,
    resolvedProjectId: scopeResult.projectId,
    resolvedTopicId: scopeResult.topicId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scope Resolution (Pure)
// ═══════════════════════════════════════════════════════════════════════════════

function resolveLearningScope(
  candidate: LearningCandidate,
): { scope: PersistentMemoryScope; projectId?: string; topicId?: string } {
  if (candidate.topicId) {
    return {
      scope: 'topic',
      topicId: candidate.topicId,
      projectId: candidate.projectId,
    };
  }
  if (candidate.projectId) {
    return {
      scope: 'project',
      projectId: candidate.projectId,
    };
  }
  return {
    scope: 'global',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Authorization Preflight (Fail-Closed)
// ═══════════════════════════════════════════════════════════════════════════════

function validateAuthenticatedOwner(ownerId: string): void {
  if (!ownerId || typeof ownerId !== 'string' || ownerId.trim().length === 0) {
    throw new LearningAuthorizationError(
      'owner_empty',
      'authenticatedOwnerId must be a non-empty string',
    );
  }
}

function preflightSources(ownerId: string, sources: readonly RuntimeLearningSource[]): void {
  for (const source of sources) {
    if (source.decision.ownerId !== ownerId) {
      throw new LearningAuthorizationError(
        source.decision.id,
        `Decision owner mismatch: expected ${ownerId}, got ${source.decision.id}`,
      );
    }
    if (source.feedback.ownerId !== ownerId) {
      throw new LearningAuthorizationError(
        source.feedback.id,
        `Feedback owner mismatch: expected ${ownerId}, got ${source.feedback.ownerId}`,
      );
    }
    if (source.feedback.decisionId !== source.decision.id) {
      throw new LearningAuthorizationError(
        source.decision.id,
        `Feedback decisionId mismatch: ${source.feedback.decisionId} !== ${source.decision.id}`,
      );
    }
  }
}

function preflightCandidates(ownerId: string, candidates: readonly LearningCandidate[]): void {
  for (const c of candidates) {
    if (c.ownerId !== ownerId) {
      throw new LearningAuthorizationError(
        c.id,
        `Candidate owner mismatch: expected ${ownerId}, got ${c.ownerId}`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Record Construction
// ═══════════════════════════════════════════════════════════════════════════════

function buildMemoryRecord(
  candidate: LearningCandidate,
  policyEval: RuntimeLearningPolicyEvaluation,
  authenticatedOwnerId: string,
  processingTimestamp: string,
): MemoryRecord<LearningCandidate> {
  // Deduplicated decision + outcome IDs
  const derivedFrom = Array.from(
    new Set([candidate.sourceDecisionId, ...candidate.sourceOutcomeIds]),
  );

  return {
    id: `mem_${candidate.id}`,
    kind: 'semantic',
    type: 'learning_candidate',
    payload: candidate,
    ownerId: authenticatedOwnerId,
    scope: policyEval.resolvedScope ?? 'global',
    projectId: policyEval.resolvedProjectId ?? null,
    topicId: policyEval.resolvedTopicId ?? null,
    source: 'contextos_runtime_learning',
    sourceType: 'learning_candidate',
    derivedFrom,
    confidence: candidate.confidence,
    importance: candidate.importance,
    createdAt: processingTimestamp,
    updatedAt: processingTimestamp,
    lastAccessedAt: null,
    expiresAt: null,
    accessCount: 0,
    version: 1,
    status: 'active',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Persistence (Idempotent, Owner-Scoped)
// ═══════════════════════════════════════════════════════════════════════════════

async function persistEligibleCandidate(
  candidate: LearningCandidate,
  policyEval: RuntimeLearningPolicyEvaluation,
  input: RuntimeLearningInput,
  processingTimestamp: string,
  deps: RuntimeLearningDependencies,
): Promise<RuntimeLearningItemResult> {
  const store = deps.memoryStore;
  const ownerId = input.authenticatedOwnerId;

  // Step 1: Idempotency check — owner-scoped lookup
  const existing = await store.getById(`mem_${candidate.id}`, ownerId);
  if (existing) {
    return {
      candidateId: candidate.id,
      status: 'already_exists',
      scope: policyEval.resolvedScope,
      reasonCode: 'VALID_POLICY',
    };
  }

  // Step 2: Construct and validate the record
  const record = buildMemoryRecord(
    candidate,
    policyEval,
    ownerId,
    processingTimestamp,
  );

  // Step 3: Attempt create
  try {
    await store.create(record);
    return {
      candidateId: candidate.id,
      status: 'persisted',
      scope: policyEval.resolvedScope,
      reasonCode: 'VALID_POLICY',
    };
  } catch (err) {
    if (err instanceof MemoryConcurrencyError) {
      // Race condition — another worker persisted between our getById and create.
      // Re-check ownership to disambiguous from cross-owner ID collision.
      const raced = await store.getById(`mem_${candidate.id}`, ownerId);
      if (raced) {
        return {
          candidateId: candidate.id,
          status: 'already_exists',
          scope: policyEval.resolvedScope,
          reasonCode: 'VALID_POLICY',
        };
      }
    }
    return {
      candidateId: candidate.id,
      status: 'failed',
      scope: policyEval.resolvedScope,
      reasonCode: 'VALID_POLICY',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Aggregate Counter Builder
// ═══════════════════════════════════════════════════════════════════════════════

function buildResult(
  items: RuntimeLearningItemResult[],
  processingTimestamp: string,
): RuntimeLearningResult {
  let persisted = 0, discarded = 0, already_exists = 0, failed = 0;
  for (const item of items) {
    switch (item.status) {
      case 'persisted': persisted++; break;
      case 'discarded': discarded++; break;
      case 'already_exists': already_exists++; break;
      case 'failed': failed++; break;
    }
  }
  return {
    items,
    counts: {
      persisted,
      discarded,
      already_exists,
      failed,
      total: items.length,
    },
    processingTimestamp,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public Pipeline Entry
// ═══════════════════════════════════════════════════════════════════════════════

export async function runRuntimeLearning(
  input: RuntimeLearningInput,
  deps: RuntimeLearningDependencies,
): Promise<RuntimeLearningResult> {
  // ── Phase 1: Authorization Preflight (fail-closed) ──────────────────────
  validateAuthenticatedOwner(input.authenticatedOwnerId);
  preflightSources(input.authenticatedOwnerId, input.sources);

  // ── Phase 2: Policy validation ──────────────────────────────────────────
  const policy = validatePolicy(input.policy);

  // ── Phase 3: Timestamp (injected clock) ─────────────────────────────────
  const now = deps.now ?? (() => new Date().toISOString());
  const processingTimestamp = now();

  // ── Phase 4: Generate candidates (reuse P0.6.7) ─────────────────────────
  const allCandidates: LearningCandidate[] = [];
  for (const source of input.sources) {
    const candidates = buildLearningCandidates(
      source.decision,
      source.feedback,
      processingTimestamp,
    );
    allCandidates.push(...candidates);
  }

  // Validate all generated candidates belong to authenticated owner
  preflightCandidates(input.authenticatedOwnerId, allCandidates);

  // ── Phase 5: Apply maxCandidatesPerRun limit ────────────────────────────
  // Limit is applied BEFORE policy evaluation (capacity control).
  const withinLimit = allCandidates.slice(0, policy.maxCandidatesPerRun);
  const beyondLimit = allCandidates.slice(policy.maxCandidatesPerRun);

  // ── Phase 6: Evaluate + persist eligible candidates ─────────────────────
  const items: RuntimeLearningItemResult[] = [];

  // Candidates beyond the limit: explicitly discarded
  for (const candidate of beyondLimit) {
    items.push({
      candidateId: candidate.id,
      status: 'discarded',
      reasonCode: 'MAX_CANDIDATES_PER_RUN',
    });
  }

  // Candidates within the limit: evaluate then persist
  for (const candidate of withinLimit) {
    const evalResult = evaluateLearningCandidate(candidate, policy);

    if (!evalResult.eligible) {
      items.push({
        candidateId: candidate.id,
        status: 'discarded',
        reasonCode: evalResult.reasonCode,
        scope: evalResult.resolvedScope,
      });
      continue;
    }

    // Persist eligible candidate
    const persistResult = await persistEligibleCandidate(
      candidate,
      evalResult,
      input,
      processingTimestamp,
      deps,
    );
    items.push(persistResult);
  }

  // ── Phase 7: Aggregate counters ─────────────────────────────────────────
  return buildResult(items, processingTimestamp);
}
