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
  | 'INVALID_OUTCOME_EVIDENCE'
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

/**
 * Machine-readable error codes for persistence-layer failures.
 * Distinct from reasonCode (which carries policy-evaluation semantics).
 */
export type RuntimeLearningItemErrorCode =
  | 'PERSISTENCE_READ_FAILED'
  | 'PERSISTENCE_WRITE_FAILED'
  | 'DUPLICATE_ID_CONFLICT'
  | 'DUPLICATE_RECHECK_FAILED';

export interface RuntimeLearningItemResult {
  candidateId: string;
  status: RuntimeLearningItemStatus;
  reasonCode?: RuntimeLearningPolicyReasonCode | 'MAX_CANDIDATES_PER_RUN';
  errorCode?: RuntimeLearningItemErrorCode;
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

const _DEFAULT_ALLOWED_CANDIDATE_TYPES: readonly LearningCandidateType[] = Object.freeze([
  'decision_pattern',
  'successful_pattern',
  'failure_pattern',
  'preference_signal',
  'strategy_signal',
]);

const _DEFAULT_ALLOWED_SCOPES: readonly PersistentMemoryScope[] = Object.freeze([
  'topic',
  'project',
]);

const _DEFAULT_LEARNING_POLICY: ContextOSLearningPolicy = {
  minConfidence: 0.3,
  minImportance: 0,
  maxCandidatesPerRun: 20,
  allowedCandidateTypes: _DEFAULT_ALLOWED_CANDIDATE_TYPES,
  allowedScopes: _DEFAULT_ALLOWED_SCOPES,
  requireOutcomeEvidence: true,
};

/**
 * Top-level frozen default policy. The entire object is immutable at runtime:
 * scalar properties cannot be reassigned; nested arrays are individually frozen.
 */
export const DEFAULT_LEARNING_POLICY: Readonly<ContextOSLearningPolicy> = Object.freeze(_DEFAULT_LEARNING_POLICY);

// ═══════════════════════════════════════════════════════════════════════════════
// Policy Validation
// ═══════════════════════════════════════════════════════════════════════════════

/** Runtime-valid candidate types (mirrors LearningCandidateType union). */
const VALID_CANDIDATE_TYPES = new Set<string>([
  'decision_pattern',
  'successful_pattern',
  'failure_pattern',
  'preference_signal',
  'strategy_signal',
]);

/** Runtime-valid scope values. */
const VALID_SCOPES = new Set<string>([
  'global',
  'project',
  'topic',
]);

export function validatePolicy(
  partial: Partial<ContextOSLearningPolicy> = {},
): ContextOSLearningPolicy {
  // ── Validate override types BEFORE spreading (prevent TypeError on non-iterables) ──
  if (partial.allowedCandidateTypes !== undefined && !Array.isArray(partial.allowedCandidateTypes)) {
    throw new LearningValidationError(
      `allowedCandidateTypes must be an array. Got: ${typeof partial.allowedCandidateTypes}`,
    );
  }
  if (partial.allowedScopes !== undefined && !Array.isArray(partial.allowedScopes)) {
    throw new LearningValidationError(
      `allowedScopes must be an array. Got: ${typeof partial.allowedScopes}`,
    );
  }

  const merged: ContextOSLearningPolicy = {
    ...DEFAULT_LEARNING_POLICY,
    ...partial,
  };

  // Arrays: use caller-provided copy if explicitly set, else frozen default persists
  if (partial.allowedCandidateTypes !== undefined) {
    // Re-validate elements before freezing (already passed Array.isArray above)
    for (const ct of partial.allowedCandidateTypes) {
      if (!VALID_CANDIDATE_TYPES.has(ct)) {
        throw new LearningValidationError(
          `allowedCandidateTypes contains unknown value: "${ct}"`,
        );
      }
    }
    merged.allowedCandidateTypes = Object.freeze([...partial.allowedCandidateTypes]);
  }
  if (partial.allowedScopes !== undefined) {
    for (const sc of partial.allowedScopes) {
      if (!VALID_SCOPES.has(sc)) {
        throw new LearningValidationError(
          `allowedScopes contains unknown value: "${sc}"`,
        );
      }
    }
    merged.allowedScopes = Object.freeze([...partial.allowedScopes]);
  }

  // ── minConfidence ────────────────────────────────────────────────────
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

  // ── minImportance ────────────────────────────────────────────────────
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

  // ── maxCandidatesPerRun ──────────────────────────────────────────────
  if (
    typeof merged.maxCandidatesPerRun !== 'number' ||
    !Number.isInteger(merged.maxCandidatesPerRun) ||
    merged.maxCandidatesPerRun < 1
  ) {
    throw new LearningValidationError(
      `maxCandidatesPerRun must be a positive integer >= 1. Got: ${merged.maxCandidatesPerRun}`,
    );
  }

  // ── allowedCandidateTypes ────────────────────────────────────────────
  if (
    !Array.isArray(merged.allowedCandidateTypes) ||
    merged.allowedCandidateTypes.length === 0
  ) {
    throw new LearningValidationError(
      'allowedCandidateTypes must be a non-empty array of LearningCandidateType values',
    );
  }
  for (const ct of merged.allowedCandidateTypes) {
    if (!VALID_CANDIDATE_TYPES.has(ct)) {
      throw new LearningValidationError(
        `allowedCandidateTypes contains unknown value: "${ct}"`,
      );
    }
  }

  // ── allowedScopes ────────────────────────────────────────────────────
  if (!Array.isArray(merged.allowedScopes) || merged.allowedScopes.length === 0) {
    throw new LearningValidationError(
      'allowedScopes must be a non-empty array of PersistentMemoryScope values',
    );
  }
  for (const sc of merged.allowedScopes) {
    if (!VALID_SCOPES.has(sc)) {
      throw new LearningValidationError(
        `allowedScopes contains unknown value: "${sc}"`,
      );
    }
  }

  // ── requireOutcomeEvidence ───────────────────────────────────────────
  if (typeof merged.requireOutcomeEvidence !== 'boolean') {
    throw new LearningValidationError(
      `requireOutcomeEvidence must be a boolean. Got: ${merged.requireOutcomeEvidence}`,
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

  // 4. Type must be a non-empty string and allowed
  if (typeof candidate.type !== 'string' || candidate.type.trim().length === 0) {
    return ineligible('DISALLOWED_CANDIDATE_TYPE');
  }
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

  // 9. Outcome evidence validation — independent of requireOutcomeEvidence setting
  // 9a. Reject non-array evidence collections (malformed)
  if (!Array.isArray(candidate.sourceOutcomeIds)) {
    return ineligible('INVALID_OUTCOME_EVIDENCE');
  }
  // 9b. Validate array elements: each must be a non-empty string
  for (const outcomeId of candidate.sourceOutcomeIds) {
    if (typeof outcomeId !== 'string' || outcomeId.trim().length === 0) {
      return ineligible('INVALID_OUTCOME_EVIDENCE');
    }
  }
  // 9c. When outcome evidence is required, empty collection is ineligible
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
  // Deduplicated decision + outcome IDs.
  // Defensive: sourceOutcomeIds guaranteed to be string[] at this point
  // (validated in evaluateLearningCandidate step 9a/9b). If malformed data
  // somehow bypasses evaluation, spread of non-iterable throws controlled TypeError
  // rather than silent data corruption.
  const safeOutcomeIds: string[] = Array.isArray(candidate.sourceOutcomeIds)
    ? candidate.sourceOutcomeIds.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : [];
  const derivedFrom = Array.from(
    new Set([candidate.sourceDecisionId, ...safeOutcomeIds]),
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
  const memId = `mem_${candidate.id}`;

  // Step 1: Idempotency check — owner-scoped lookup.
  // Catch read failures: a failed pre-check must NOT crash the whole pipeline.
  try {
    const existing = await store.getById(memId, ownerId);
    if (existing) {
      return {
        candidateId: candidate.id,
        status: 'already_exists',
        scope: policyEval.resolvedScope,
        reasonCode: 'VALID_POLICY',
      };
    }
  } catch {
    // Read failure: record as failed with specific error code. Never expose raw DB error.
    return {
      candidateId: candidate.id,
      status: 'failed',
      scope: policyEval.resolvedScope,
      errorCode: 'PERSISTENCE_READ_FAILED',
    };
  }

  // Step 2: Construct the record
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
      // Owner-scoped recheck disambiguates cross-owner ID collision from genuine duplicate.
      try {
        const raced = await store.getById(memId, ownerId);
        if (raced) {
          return {
            candidateId: candidate.id,
            status: 'already_exists',
            scope: policyEval.resolvedScope,
            reasonCode: 'VALID_POLICY',
          };
        }
        // Foreign-owner record: collision on ID but not owned by caller.
        return {
          candidateId: candidate.id,
          status: 'failed',
          scope: policyEval.resolvedScope,
          errorCode: 'DUPLICATE_ID_CONFLICT',
        };
      } catch {
        // Recheck itself failed. Do not expose raw error; do NOT report as already_exists.
        return {
          candidateId: candidate.id,
          status: 'failed',
          scope: policyEval.resolvedScope,
          errorCode: 'DUPLICATE_RECHECK_FAILED',
        };
      }
    }
    // Non-concurrency create failure: generic write failure.
    return {
      candidateId: candidate.id,
      status: 'failed',
      scope: policyEval.resolvedScope,
      errorCode: 'PERSISTENCE_WRITE_FAILED',
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
