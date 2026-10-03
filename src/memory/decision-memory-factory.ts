/**
 * P0.6.3.3 — Decision Memory Factory
 *
 * Creates DecisionMemory instances with full validation and defaults.
 *
 * Architecture Position:
 *
 *   createDecisionMemory()
 *       ↓
 *   MemoryRecord<DecisionMemoryPayload>
 *       ↓
 *   MemoryStore.create()
 *       ↓
 *   Database (PrismaMemoryStore)
 *
 * Design Principles:
 *   1. Factory is the ONLY way to create DecisionMemory (no manual construction)
 *   2. Validates all required fields
 *   3. Auto-derives scope from context IDs
 *   4. Initializes version, lifecycle, timestamps
 *   5. Maps DecisionStatus to MemoryStatus for DB compatibility
 */

import type { MemoryScope } from './memory-scope';
import type { DecisionMemory } from './decision-memory';
import type {
  DecisionMemoryPayload,
  DecisionStatus,
  DecisionAlternative,
  DecisionEvidence,
} from './memory-types';
import { createMemoryRecord } from './memory-factory';
import { resolveMemoryScope } from './memory-scope';
import { DECISION_MEMORY_TYPE, DECISION_MEMORY_KIND } from './memory-types';
import { decisionStatusToMemoryStatus } from './decision-memory';
import { validateDecisionPayload } from './decision-memory';

/**
 * Options for creating a DecisionMemory.
 */
export interface CreateDecisionMemoryOptions {
  /** Unique identifier (auto-generated if not provided) */
  id?: string;

  /** The decision statement — REQUIRED */
  decision: string;

  /** Reasoning behind the decision */
  rationale?: string;

  /** Alternatives that were considered */
  alternatives?: DecisionAlternative[];

  /** Supporting evidence references */
  evidence?: DecisionEvidence[];

  /** Constraints that shaped the decision */
  constraints?: string[];

  /** Assumptions made when making this decision */
  assumptions?: string[];

  /** What outcome was expected from this decision */
  expectedOutcome?: string;

  /** Initial decision status (default: 'proposed') */
  decisionStatus?: DecisionStatus;

  /** Owner (user) ID — REQUIRED for persistence */
  ownerId: string;

  /** Project ID (optional, used for scope derivation) */
  projectId?: string | null;

  /** Topic ID (optional, used for scope derivation) */
  topicId?: string | null;

  /** Explicit scope (auto-derived if not provided) */
  scope?: MemoryScope;

  /** Source description (default: 'decision_factory') */
  source?: string;

  /** Source type (default: 'decision') */
  sourceType?: string;

  /** Confidence score (0.0 - 1.0, default: 0.7) */
  confidence?: number;

  /** Importance score (0.0 - 1.0, default: 0.8) */
  importance?: number;

  /** IDs of memories this was derived from */
  derivedFrom?: readonly string[];

  /** ID of a decision this supersedes */
  supersedes?: string;

  /** Creation timestamp (default: now) */
  createdAt?: string;

  /** Update timestamp (default: createdAt) */
  updatedAt?: string;

  /** Expiration timestamp */
  expiresAt?: string | null;
}

/**
 * Generate a decision-specific memory ID.
 */
function generateDecisionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dec_${crypto.randomUUID()}`;
  }
  return `dec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a DecisionMemory with all required fields and sensible defaults.
 *
 * Auto-derivation rules:
 * - scope: explicit → topicId → projectId → global
 * - id: dec_ prefix + crypto.randomUUID
 * - decisionStatus: 'proposed' (default)
 * - kind: 'semantic'
 * - type: 'decision'
 * - MemoryStatus mirrors DecisionStatus for DB compatibility
 * - confidence: 0.7 (decisions are generally high-confidence)
 * - importance: 0.8 (decisions are important for future context)
 *
 * @param options - Decision creation options
 * @return A complete DecisionMemory (MemoryRecord<DecisionMemoryPayload>)
 * @throws Error if decision or ownerId is empty
 */
export function createDecisionMemory(
  options: CreateDecisionMemoryOptions
): DecisionMemory {
  // ─── Validate required fields ─────────────────────────────────────────────
  if (!options.decision || typeof options.decision !== 'string' || options.decision.trim().length === 0) {
    throw new Error('DecisionMemory: decision must be a non-empty string');
  }

  if (!options.ownerId || typeof options.ownerId !== 'string' || options.ownerId.trim().length === 0) {
    throw new Error('DecisionMemory: ownerId must be a non-empty string');
  }

  // ─── Resolve decision status ──────────────────────────────────────────────
  const decisionStatus: DecisionStatus = options.decisionStatus ?? 'proposed';

  // ─── Build payload ────────────────────────────────────────────────────────
  const payload: DecisionMemoryPayload = {
    decision: options.decision.trim(),
    rationale: options.rationale,
    alternatives: options.alternatives ?? [],
    evidence: options.evidence ?? [],
    constraints: options.constraints ?? [],
    assumptions: options.assumptions ?? [],
    expectedOutcome: options.expectedOutcome,
    decisionStatus,
    supersedes: options.supersedes,
  };

  // ─── Validate payload structure ───────────────────────────────────────────
  validateDecisionPayload(payload);

  // ─── Resolve scope ────────────────────────────────────────────────────────
  const scope = options.scope ?? resolveMemoryScope({
    topicId: options.topicId ?? null,
    projectId: options.projectId ?? null,
  });

  // ─── Map DecisionStatus to MemoryStatus for DB compatibility ──────────────
  const memoryStatus = decisionStatusToMemoryStatus(decisionStatus);

  // ─── Create MemoryRecord ──────────────────────────────────────────────────
  const record = createMemoryRecord<DecisionMemoryPayload>({
    id: options.id ?? generateDecisionId(),
    kind: DECISION_MEMORY_KIND,
    type: DECISION_MEMORY_TYPE,
    payload,
    scope,
    ownerId: options.ownerId,
    projectId: options.projectId ?? null,
    topicId: options.topicId ?? null,
    source: options.source ?? 'decision_factory',
    sourceType: options.sourceType ?? 'decision',
    derivedFrom: options.derivedFrom,
    confidence: options.confidence ?? 0.7,
    importance: options.importance ?? 0.8,
    status: memoryStatus,
    version: 1,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt,
    expiresAt: options.expiresAt,
  });

  // Return as DecisionMemory (type alias — same object)
  return record as DecisionMemory;
}
