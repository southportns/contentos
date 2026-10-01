/**
 * P0.6.5.1 — Outcome Memory Factory
 *
 * Creates OutcomeMemory instances with full validation and defaults.
 *
 * Architecture Position:
 *
 *   createOutcomeMemory()
 *       ↓
 *   MemoryRecord<OutcomeMemoryPayload>
 *       ↓
 *   MemoryStore.create()
 *       ↓
 *   Database (PrismaMemoryStore)
 *
 * Design Principles:
 *   1. Factory is the ONLY way to create OutcomeMemory (no manual construction)
 *   2. Validates all required fields (outcomeType, targetType, targetId, observedAt)
 *   3. Auto-derives scope from context IDs
 *   4. Initializes version, lifecycle, timestamps
 *   5. Outcomes are observation snapshots — no history overwrite
 */

import type { MemoryScope } from './memory-scope';
import type { OutcomeMemory } from './outcome-memory';
import type {
  OutcomeMemoryPayload,
  OutcomeType,
  OutcomeTargetType,
  OutcomeMetric,
  OutcomeAttribution,
} from './outcome-memory';
import { createMemoryRecord } from './memory-factory';
import { resolveMemoryScope } from './memory-scope';
import { OUTCOME_MEMORY_TYPE, OUTCOME_MEMORY_KIND } from './outcome-memory';
import { validateOutcomePayload } from './outcome-memory';

/**
 * Options for creating an OutcomeMemory.
 */
export interface CreateOutcomeMemoryOptions {
  /** Unique identifier (auto-generated if not provided) */
  id?: string;

  /** What kind of outcome was observed — REQUIRED */
  outcomeType: OutcomeType;

  /** Entity type being measured — REQUIRED */
  targetType: OutcomeTargetType;

  /** Entity ID being measured — REQUIRED */
  targetId: string;

  /** Observed metrics */
  metrics?: OutcomeMetric[];

  /** Qualitative feedback */
  qualitativeFeedback?: string[];

  /** Human-readable summary */
  summary?: string;

  /** Expected outcome (for future comparison) */
  expectedOutcome?: string;

  /** When this outcome was observed (ISO 8601) — REQUIRED */
  observedAt: string;

  /** Attribution links */
  attribution?: OutcomeAttribution;

  /** Owner (user) ID — REQUIRED for persistence */
  ownerId: string;

  /** Project ID (optional, used for scope derivation) */
  projectId?: string | null;

  /** Topic ID (optional, used for scope derivation) */
  topicId?: string | null;

  /** Explicit scope (auto-derived if not provided) */
  scope?: MemoryScope;

  /** Source description (default: 'outcome_factory') */
  source?: string;

  /** Source type (default: 'outcome') */
  sourceType?: string;

  /** Confidence score (0.0 - 1.0, default: 0.7) */
  confidence?: number;

  /** Importance score (0.0 - 1.0, default: 0.7) */
  importance?: number;

  /** IDs of memories this was derived from */
  derivedFrom?: readonly string[];
}

/**
 * Generate an outcome-specific memory ID.
 */
function generateOutcomeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `out_${crypto.randomUUID()}`;
  }
  return `out_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create an OutcomeMemory with all required fields and sensible defaults.
 *
 * Auto-derivation rules:
 * - scope: explicit → topicId → projectId → global
 * - id: out_ prefix + crypto.randomUUID
 * - kind: 'episodic'
 * - type: 'outcome'
 * - status: 'active' (outcomes are immutable snapshots — always active)
 * - confidence: 0.7 (outcomes are observed facts, reasonably high confidence)
 * - importance: 0.7 (outcomes are important for future learning)
 *
 * @param options - Outcome creation options
 * @return A complete OutcomeMemory (MemoryRecord<OutcomeMemoryPayload>)
 * @throws Error if required fields are missing or invalid
 */
export function createOutcomeMemory(
  options: CreateOutcomeMemoryOptions
): OutcomeMemory {
  // ─── Validate required fields ─────────────────────────────────────────────
  if (!options.outcomeType) {
    throw new Error('OutcomeMemory: outcomeType is required');
  }

  if (!options.targetType) {
    throw new Error('OutcomeMemory: targetType is required');
  }

  if (!options.targetId || typeof options.targetId !== 'string' || options.targetId.trim().length === 0) {
    throw new Error('OutcomeMemory: targetId must be a non-empty string');
  }

  if (!options.observedAt || typeof options.observedAt !== 'string') {
    throw new Error('OutcomeMemory: observedAt must be a non-empty ISO 8601 string');
  }
  const observedDate = new Date(options.observedAt);
  if (isNaN(observedDate.getTime())) {
    throw new Error(`OutcomeMemory: observedAt must be a valid ISO 8601 date. Got: ${options.observedAt}`);
  }

  if (!options.ownerId || typeof options.ownerId !== 'string' || options.ownerId.trim().length === 0) {
    throw new Error('OutcomeMemory: ownerId must be a non-empty string');
  }

  // ─── Build payload ────────────────────────────────────────────────────────
  const payload: OutcomeMemoryPayload = {
    outcomeType: options.outcomeType,
    targetType: options.targetType,
    targetId: options.targetId.trim(),
    metrics: options.metrics ?? [],
    qualitativeFeedback: options.qualitativeFeedback ?? [],
    summary: options.summary,
    expectedOutcome: options.expectedOutcome,
    observedAt: options.observedAt,
    attribution: options.attribution,
  };

  // ─── Validate payload structure ───────────────────────────────────────────
  validateOutcomePayload(payload);

  // ─── Resolve scope ────────────────────────────────────────────────────────
  const scope = options.scope ?? resolveMemoryScope({
    topicId: options.topicId ?? null,
    projectId: options.projectId ?? null,
  });

  // ─── Create MemoryRecord ──────────────────────────────────────────────────
  const record = createMemoryRecord<OutcomeMemoryPayload>({
    id: options.id ?? generateOutcomeId(),
    kind: OUTCOME_MEMORY_KIND,
    type: OUTCOME_MEMORY_TYPE,
    payload,
    scope,
    ownerId: options.ownerId,
    projectId: options.projectId ?? null,
    topicId: options.topicId ?? null,
    source: options.source ?? 'outcome_factory',
    sourceType: options.sourceType ?? 'outcome',
    derivedFrom: options.derivedFrom,
    confidence: options.confidence ?? 0.7,
    importance: options.importance ?? 0.7,
    status: 'active', // Outcomes are immutable snapshots — always active
    version: 1,
  });

  // Return as OutcomeMemory (type alias — same object)
  return record as OutcomeMemory;
}
