/**
 * P0.6.5.1 — Outcome Memory Type & Validation Helpers
 *
 * Outcome Memory is a specialized MemoryRecord:
 * - kind: 'episodic'
 * - type: 'outcome'
 * - payload: OutcomeMemoryPayload
 *
 * Architecture Position:
 *
 *   MemoryRecord<OutcomeMemoryPayload>
 *       ↓
 *   OutcomeMemory (type alias — no new persistence, no second DB)
 *       ↓
 *   OutcomeMemoryFactory → createOutcomeMemory()
 *       ↓
 *   Retrieval helpers → retrieveOutcomeMemories() / getOutcomeHistory() / getLatestOutcome()
 *       ↓
 *   Context Bridge → outcomeMemoryToContext()
 *
 * Design Principles:
 *   1. OutcomeMemory IS-A MemoryRecord — no parallel type system
 *   2. Outcome = episodic memory (observed events, not abstracted knowledge)
 *   3. Outcome persists as observation snapshots — never overwrites history
 *   4. Attribution links Outcomes to Decisions/Content/Drafts via IDs
 *   5. No schema change — payload stored in MemoryRecord.payload JSON
 *   6. OBSERVE / STORE / RETRIEVE only — no judgment or learning
 */

import type { MemoryRecord } from './memory-record';
import type { MemoryKind } from './memory-kind';

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Type Enums
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classification of what kind of outcome was observed.
 *
 * - performance:   Overall effectiveness/comprehensive results
 * - engagement:    Likes, comments, shares, saves, etc.
 * - conversion:    Concrete conversions (sales, sign-ups, follows)
 * - feedback:      Qualitative user feedback
 * - publication:   Publication event (content went live)
 * - failure:       Explicit failure event
 * - milestone:     Stage-level achievement
 */
export type OutcomeType =
  | 'performance'
  | 'engagement'
  | 'conversion'
  | 'feedback'
  | 'publication'
  | 'failure'
  | 'milestone';

/**
 * All valid OutcomeType values.
 */
export const OUTCOME_TYPES: readonly OutcomeType[] = [
  'performance',
  'engagement',
  'conversion',
  'feedback',
  'publication',
  'failure',
  'milestone',
] as const;

/**
 * Entity type that this Outcome describes/measures.
 */
export type OutcomeTargetType =
  | 'content'
  | 'draft'
  | 'topic'
  | 'decision'
  | 'project';

/**
 * All valid OutcomeTargetType values.
 */
export const OUTCOME_TARGET_TYPES: readonly OutcomeTargetType[] = [
  'content',
  'draft',
  'topic',
  'decision',
  'project',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Metric
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A single observed metric value.
 *
 * Extensible: views, likes, comments, shares, CTR, completion_rate,
 * conversion_rate, followers_gained, orders, revenue, saves, watch_time, etc.
 */
export interface OutcomeMetric {
  /** Metric key (e.g., 'views', 'likes', 'ctr') */
  key: string;

  /** Observed numeric value */
  value: number;

  /** Optional unit (e.g., 'count', 'percent', 'seconds', 'usd') */
  unit?: string;

  /** Optional source/platform (e.g., 'douyin', 'xiaohongshu', 'manual') */
  source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Attribution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Links an Outcome to the entities that led to it.
 *
 * No database relations — ID-based attribution only.
 * Future P0.6.6 Context Graph will establish real graph relationships.
 */
export interface OutcomeAttribution {
  /** ID of the Decision that influenced this outcome (if any) */
  decisionId?: string;

  /** ID of the Strategy (if any) */
  strategyId?: string;

  /** ID of the Content (if any) */
  contentId?: string;

  /** ID of the Draft (if any) */
  draftId?: string;

  /** ID of the Topic (if any) */
  topicId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Memory Payload
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Typed payload for Outcome Memory.
 *
 * Outcome Memory is a MemoryRecord with:
 * - kind: 'episodic'
 * - type: 'outcome'
 * - payload: OutcomeMemoryPayload
 *
 * Core design: this is an OBSERVATION SNAPSHOT at a specific point in time.
 * Multiple observations for the same target form a time series.
 */
export interface OutcomeMemoryPayload {
  /** What kind of outcome was observed — REQUIRED */
  outcomeType: OutcomeType;

  /** Entity type being measured — REQUIRED */
  targetType: OutcomeTargetType;

  /** Entity ID being measured — REQUIRED */
  targetId: string;

  /** Observed metrics (quantitative measurements) */
  metrics?: OutcomeMetric[];

  /** Qualitative feedback (user comments, observations) */
  qualitativeFeedback?: string[];

  /** Human-readable summary of this observation */
  summary?: string;

  /** What outcome was expected (for future comparison) */
  expectedOutcome?: string;

  /** When this outcome was observed (ISO 8601) — REQUIRED */
  observedAt: string;

  /** Attribution links to decisions/content/drafts */
  attribution?: OutcomeAttribution;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Memory Type
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OutcomeMemory — type alias for MemoryRecord<OutcomeMemoryPayload>.
 *
 * No new interface, no new base type. Outcome Memory IS a MemoryRecord
 * with a specific kind/type/payload combination.
 */
export type OutcomeMemory = MemoryRecord<OutcomeMemoryPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The memory type discriminator for Outcome Memory.
 */
export const OUTCOME_MEMORY_TYPE = 'outcome' as const;

/**
 * The memory kind for Outcome Memory.
 *
 * Outcome = episodic memory (observed events), NOT semantic (abstracted knowledge).
 * Decision = semantic, Outcome = episodic — this distinction is critical.
 */
export const OUTCOME_MEMORY_KIND: MemoryKind = 'episodic';

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a MemoryRecord is an Outcome Memory.
 *
 * A record is an Outcome Memory if type === 'outcome' AND
 * payload has outcomeType and observedAt fields.
 *
 * @param record - MemoryRecord to check
 * @return True if the record is an Outcome Memory
 */
export function isOutcomeMemory(record: MemoryRecord): record is OutcomeMemory {
  return record.type === OUTCOME_MEMORY_TYPE &&
    record.payload != null &&
    typeof record.payload === 'object' &&
    'outcomeType' in record.payload &&
    'observedAt' in record.payload;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate OutcomeMemoryPayload-specific fields.
 *
 * This is in addition to the base MemoryRecord validation.
 * Checks:
 * - outcomeType is a valid OutcomeType
 * - targetType is a valid OutcomeTargetType
 * - targetId is non-empty string
 * - observedAt is a valid ISO 8601 timestamp string
 * - metrics (if present) have valid structure
 * - attribution (if present) fields are strings
 *
 * @param payload - The OutcomeMemoryPayload to validate
 * @throws Error if validation fails
 */
export function validateOutcomePayload(payload: OutcomeMemoryPayload): void {
  // Validate outcomeType
  if (!payload.outcomeType || !OUTCOME_TYPES.includes(payload.outcomeType)) {
    throw new Error(
      `OutcomeMemoryPayload.outcomeType must be one of: ${OUTCOME_TYPES.join(', ')}. Got: ${payload.outcomeType}`
    );
  }

  // Validate targetType
  if (!payload.targetType || !OUTCOME_TARGET_TYPES.includes(payload.targetType)) {
    throw new Error(
      `OutcomeMemoryPayload.targetType must be one of: ${OUTCOME_TARGET_TYPES.join(', ')}. Got: ${payload.targetType}`
    );
  }

  // Validate targetId
  if (!payload.targetId || typeof payload.targetId !== 'string' || payload.targetId.trim().length === 0) {
    throw new Error('OutcomeMemoryPayload.targetId must be a non-empty string');
  }

  // Validate observedAt
  if (!payload.observedAt || typeof payload.observedAt !== 'string') {
    throw new Error('OutcomeMemoryPayload.observedAt must be a non-empty ISO 8601 string');
  }
  const observedDate = new Date(payload.observedAt);
  if (isNaN(observedDate.getTime())) {
    throw new Error(`OutcomeMemoryPayload.observedAt must be a valid ISO 8601 date. Got: ${payload.observedAt}`);
  }

  // Validate metrics (if present)
  if (payload.metrics !== undefined) {
    if (!Array.isArray(payload.metrics)) {
      throw new Error('OutcomeMemoryPayload.metrics must be an array');
    }
    for (let i = 0; i < payload.metrics.length; i++) {
      const m = payload.metrics[i];
      if (!m.key || typeof m.key !== 'string' || m.key.trim().length === 0) {
        throw new Error(`OutcomeMemoryPayload.metrics[${i}].key must be a non-empty string`);
      }
      if (typeof m.value !== 'number' || isNaN(m.value)) {
        throw new Error(`OutcomeMemoryPayload.metrics[${i}].value must be a valid number`);
      }
    }
  }

  // Validate qualitativeFeedback (if present)
  if (payload.qualitativeFeedback !== undefined) {
    if (!Array.isArray(payload.qualitativeFeedback)) {
      throw new Error('OutcomeMemoryPayload.qualitativeFeedback must be an array');
    }
    for (let i = 0; i < payload.qualitativeFeedback.length; i++) {
      if (typeof payload.qualitativeFeedback[i] !== 'string') {
        throw new Error(`OutcomeMemoryPayload.qualitativeFeedback[${i}] must be a string`);
      }
    }
  }

  // Validate attribution (if present)
  if (payload.attribution !== undefined) {
    if (typeof payload.attribution !== 'object' || payload.attribution === null) {
      throw new Error('OutcomeMemoryPayload.attribution must be an object');
    }
    const attr = payload.attribution;
    const attrFields: (keyof OutcomeAttribution)[] = [
      'decisionId', 'strategyId', 'contentId', 'draftId', 'topicId'
    ];
    for (const field of attrFields) {
      if (attr[field] !== undefined && typeof attr[field] !== 'string') {
        throw new Error(`OutcomeMemoryPayload.attribution.${field} must be a string when present`);
      }
    }
  }

  // Validate confidence range (if present at payload level, though typically on MemoryRecord)
  // confidence/importance are on MemoryRecord, not payload — skip here
}

// ═══════════════════════════════════════════════════════════════════════════════
// Re-exports for convenience
// ═══════════════════════════════════════════════════════════════════════════════

export type { OutcomeMetric, OutcomeAttribution, OutcomeMemoryPayload };
