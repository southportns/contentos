/**
 * P0.6.3.3 — Memory Utilities
 *
 * Provides the critical Memory → Context bridge, including Decision Memory
 * to Decision Context conversion.
 *
 * Architecture Position:
 *
 *   MemoryRecord
 *       ↓ (memoryRecordToContext)
 *   ContextObject<MemoryContextPayload>  (kind='memory')
 *
 *   DecisionMemory
 *       ↓ (decisionMemoryToContext)
 *   ContextObject<DecisionContextPayload>  (kind='decision')
 *
 * These bridges connect Memory Layer to Context Layer.
 * Memory Layer does NOT depend on Context Assembly — only on ContextObject construction.
 */

import type { MemoryRecord } from './memory-record';
import type { ContextObject } from '@/context/context-object';
import type { MemoryContextPayload } from './memory-types';
import type { DecisionMemoryPayload, DecisionMemory } from './decision-memory';
import type { DecisionContextPayload, DecisionContext, OutcomeContextPayload, OutcomeContext } from '@/context/context-types';
import type { DecisionAlternative } from './memory-types';
import type { OutcomeMemoryPayload, OutcomeMemory } from './outcome-memory';
import { createMemoryContext, createDecisionContext, createOutcomeContext } from '@/context/context-factory';
import { isDecisionMemory } from './decision-memory';
import { isOutcomeMemory } from './outcome-memory';

// ═══════════════════════════════════════════════════════════════════════════════
// Generic Memory → Context Bridge (existing, unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a MemoryRecord to a ContextObject<MemoryContextPayload>.
 *
 * Field mapping:
 *   MemoryRecord.id              → ContextObject.id
 *   MemoryRecord.kind            → MemoryContextPayload.memoryKind
 *   MemoryRecord.type            → ContextObject.type
 *   MemoryRecord.payload         → MemoryContextPayload.value
 *   MemoryRecord.source          → ContextObject.provenance.source
 *   MemoryRecord.sourceType      → ContextObject.provenance.sourceType
 *   MemoryRecord.ownerId         → ContextObject.provenance.ownerId
 *   MemoryRecord.projectId       → ContextObject.provenance.projectId
 *   MemoryRecord.topicId         → ContextObject.provenance.topicId
 *   MemoryRecord.derivedFrom     → ContextObject.provenance.derivedFrom
 *   MemoryRecord.confidence      → ContextObject.confidence + MemoryContextPayload.confidence
 *   MemoryRecord.importance      → MemoryContextPayload.importance
 *   MemoryRecord.createdAt       → ContextObject.createdAt
 *   MemoryRecord.updatedAt       → ContextObject.updatedAt
 *   MemoryRecord.lastAccessedAt  → MemoryContextPayload.lastAccessedAt
 *   MemoryRecord.accessCount     → MemoryContextPayload.accessCount
 *   MemoryRecord.expiresAt       → MemoryContextPayload.expiresAt
 *   MemoryRecord.status          → MemoryContextPayload.status
 *
 * @param record - The MemoryRecord to convert
 * @return A ContextObject wrapping the memory data
 */
export function memoryRecordToContext(
  record: MemoryRecord
): ContextObject<MemoryContextPayload> {
  const payload: MemoryContextPayload = {
    memoryKind: record.kind,
    memoryType: record.type,
    value: record.payload,
    importance: record.importance,
    confidence: record.confidence,
    accessCount: record.accessCount,
    lastAccessedAt: record.lastAccessedAt,
    expiresAt: record.expiresAt,
    status: record.status,
  };

  return createMemoryContext(payload, {
    id: `ctx_mem_${record.id}`,
    provenance: {
      source: record.source,
      sourceType: record.sourceType,
      ownerId: record.ownerId,
      projectId: record.projectId,
      topicId: record.topicId,
      derivedFrom: record.derivedFrom,
      confidence: record.confidence,
    },
    lifecycleStage: 'retrieved',
    confidence: record.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Batch convert multiple MemoryRecords to ContextObjects.
 *
 * @param records - MemoryRecords to convert
 * @return ContextObjects wrapping the memory data
 */
export function memoryRecordsToContexts(
  records: MemoryRecord[]
): ContextObject<MemoryContextPayload>[] {
  return records.map(memoryRecordToContext);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Memory → Decision Context Bridge (P0.6.3.3)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert a DecisionMemory to a ContextObject<DecisionContextPayload>.
 *
 * This bridge repackages structured decision data from the Memory Layer
 * into a Decision Context for consumption by Context Assembly.
 *
 * Field mapping:
 *   DecisionMemory.id             → ContextObject.id
 *   DecisionMemory.type           → 'decision'
 *   DecisionMemory.payload.decision  → DecisionContextPayload.selected
 *   DecisionMemory.payload.rationale → DecisionContextPayload.reason
 *   DecisionMemory.payload.alternatives → DecisionContextPayload.rejected
 *   DecisionMemory.evidence       → DecisionContextPayload (alternatives field)
 *   DecisionMemory.status         → DecisionContextPayload (decisionType)
 *
 * @param record - The DecisionMemory to convert
 * @return A DecisionContext (ContextObject<DecisionContextPayload>)
 * @throws Error if record is not a DecisionMemory
 */
export function decisionMemoryToContext(
  record: DecisionMemory
): DecisionContext {
  const payload = record.payload as DecisionMemoryPayload;

  // Map DecisionMemory fields to DecisionContextPayload
  const decisionPayload: DecisionContextPayload = {
    decisionType: payload.decision,
    actor: record.ownerId ?? null,
    selected: payload.decision,
    rejected: extractRejectedAlternatives(payload.alternatives),
    reason: payload.rationale ?? null,
    alternatives: extractAlternativeDescriptions(payload.alternatives),
  };

  return createDecisionContext(decisionPayload, {
    id: `ctx_dec_${record.id}`,
    provenance: {
      source: record.source,
      sourceType: record.sourceType,
      ownerId: record.ownerId,
      projectId: record.projectId,
      topicId: record.topicId,
      derivedFrom: record.derivedFrom,
      confidence: record.confidence,
    },
    lifecycleStage: 'retrieved',
    confidence: record.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Check if a MemoryRecord is a Decision Memory and convert it.
 * Returns null if not a Decision Memory.
 *
 * @param record - MemoryRecord to try converting
 * @return DecisionContext or null
 */
export function tryDecisionMemoryToContext(
  record: MemoryRecord
): DecisionContext | null {
  if (isDecisionMemory(record)) {
    return decisionMemoryToContext(record);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract rejected alternatives as string array.
 */
function extractRejectedAlternatives(
  alternatives?: DecisionAlternative[]
): string[] | null {
  if (!alternatives || alternatives.length === 0) return null;
  const rejected = alternatives.filter((a) => a.rejectionReason);
  if (rejected.length === 0) return null;
  return rejected.map((a) => a.rejectionReason!);
}

/**
 * Extract alternative descriptions.
 */
function extractAlternativeDescriptions(
  alternatives?: DecisionAlternative[]
): string[] | null {
  if (!alternatives || alternatives.length === 0) return null;
  return alternatives.map((a) => a.description);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Memory → Outcome Context Bridge (P0.6.5.1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert an OutcomeMemory to a ContextObject<OutcomeContextPayload>.
 *
 * This bridge repackages outcome observation data from the Memory Layer
 * into an Outcome Context for consumption by Context Assembly.
 *
 * Field mapping:
 *   OutcomeMemory.id                   → ContextObject.id
 *   OutcomeMemory.type                 → 'outcome'
 *   OutcomeMemory.kind                 → 'episodic' (ContextKind = 'outcome')
 *   OutcomeMemory.payload.outcomeType  → OutcomeContextPayload.outcomeType
 *   OutcomeMemory.metrics              → OutcomeContextPayload.value
 *   OutcomeMemory.observedAt           → OutcomeContextPayload.observedAt
 *   OutcomeMemory.source               → OutcomeContextPayload.source (via sum metric source)
 *
 * @param record - The OutcomeMemory to convert
 * @return An OutcomeContext (ContextObject<OutcomeContextPayload>)
 * @throws Error if record is not an OutcomeMemory
 */
export function outcomeMemoryToContext(
  record: OutcomeMemory
): OutcomeContext {
  const payload = record.payload as OutcomeMemoryPayload;

  // Extract the first metric source as the context source (if any)
  const firstMetricSource = payload.metrics && payload.metrics.length > 0
    ? payload.metrics[0].source ?? null
    : null;

  // Build the outcome context payload
  const outcomePayload: OutcomeContextPayload = {
    outcomeType: payload.outcomeType,
    value: payload.metrics ?? null,
    source: firstMetricSource,
    observedAt: payload.observedAt,
  };

  return createOutcomeContext(outcomePayload, {
    id: `ctx_out_${record.id}`,
    provenance: {
      source: record.source,
      sourceType: record.sourceType,
      ownerId: record.ownerId,
      projectId: record.projectId,
      topicId: record.topicId,
      derivedFrom: record.derivedFrom,
      confidence: record.confidence,
    },
    lifecycleStage: 'retrieved',
    confidence: record.confidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Check if a MemoryRecord is an Outcome Memory and convert it.
 * Returns null if not an Outcome Memory.
 *
 * @param record - MemoryRecord to try converting
 * @return OutcomeContext or null
 */
export function tryOutcomeMemoryToContext(
  record: MemoryRecord
): OutcomeContext | null {
  if (isOutcomeMemory(record)) {
    return outcomeMemoryToContext(record);
  }
  return null;
}
