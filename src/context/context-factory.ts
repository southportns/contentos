/**
 * P0.6.1 — Context Factory
 *
 * Creates ContextObject instances from raw data or entity payloads.
 *
 * Architecture Position:
 *   Factory is the primary way to construct ContextObject instances.
 *   It ensures all ContextObjects have the required fields and valid provenance.
 *
 * Design Principles:
 *   1. Small, composable functions — NOT a giant switch
 *   2. Every factory function produces a valid ContextObject
 *   3. Provenance is always populated (minimum: source + timestamps)
 *   4. Pure where possible — no database calls in factory functions
 *
 * Non-goals:
 *   - Not an ORM — factories create in-memory objects, not DB records
 *   - Not an adapter — adapters convert entities, factories assemble objects
 */

import type { ContextObject } from './context-object';
import type { ContextProvenance } from './context-provenance';
import type { ContextKind } from './context-kind';
import { createInitialLifecycleState } from './context-lifecycle';

// ═══════════════════════════════════════════════════════════════════════════════
// Core Factory
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateContextOptions<TPayload> {
  id?: string;
  kind: ContextKind;
  type: string;
  payload: TPayload;
  provenance?: ContextProvenance;
  lifecycleStage?: Parameters<typeof createInitialLifecycleState>[0];
  confidence?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export function createContextObject<TPayload>(
  options: CreateContextOptions<TPayload>
): ContextObject<TPayload> {
  const now = new Date().toISOString();
  const createdAt = options.createdAt ?? now;
  const updatedAt = options.updatedAt ?? createdAt;

  return {
    id: options.id ?? generateContextId(),
    kind: options.kind,
    type: options.type,
    payload: options.payload,
    provenance: options.provenance ?? {},
    lifecycle: createInitialLifecycleState(options.lifecycleStage),
    confidence: options.confidence ?? null,
    createdAt,
    updatedAt,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Specialized Factory Functions
// ═══════════════════════════════════════════════════════════════════════════════

import type { IdentityContext, IdentityContextPayload } from './context-types';
import type { IntentContext, IntentContextPayload } from './context-types';

export function createIdentityContext(
  payload: IdentityContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): IdentityContext {
  return createContextObject({
    ...options,
    kind: 'identity',
    type: 'identity',
    payload,
  });
}

export function createIntentContext(
  payload: IntentContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): IntentContext {
  return createContextObject({
    ...options,
    kind: 'intent',
    type: 'intent',
    payload,
  });
}

import type { StrategyContext, StrategyContextPayload } from './context-types';

export function createStrategyContext(
  payload: StrategyContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): StrategyContext {
  return createContextObject({
    ...options,
    kind: 'strategy',
    type: 'strategy',
    payload,
  });
}

import type { ContentContext, ContentContextPayload } from './context-types';

export function createContentContext(
  payload: ContentContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): ContentContext {
  return createContextObject({
    ...options,
    kind: 'content',
    type: 'content',
    payload,
  });
}

import type { EvaluationContext, EvaluationContextPayload } from './context-types';

export function createEvaluationContext(
  payload: EvaluationContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): EvaluationContext {
  return createContextObject({
    ...options,
    kind: 'evaluation',
    type: 'evaluation',
    payload,
  });
}

import type { DecisionContext, DecisionContextPayload } from './context-types';

export function createDecisionContext(
  payload: DecisionContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): DecisionContext {
  return createContextObject({
    ...options,
    kind: 'decision',
    type: 'decision',
    payload,
  });
}

import type { OutcomeContext, OutcomeContextPayload } from './context-types';

export function createOutcomeContext(
  payload: OutcomeContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): OutcomeContext {
  return createContextObject({
    ...options,
    kind: 'outcome',
    type: 'outcome',
    payload,
  });
}

import type { MemoryContext, MemoryContextPayload } from './context-types';

export function createMemoryContext(
  payload: MemoryContextPayload,
  options?: Omit<Parameters<typeof createContextObject>[0], 'kind' | 'type' | 'payload'>
): MemoryContext {
  return createContextObject({
    ...options,
    kind: 'memory',
    type: payload.memoryKind,
    payload,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function generateContextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ctx_${crypto.randomUUID()}`;
  }
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}