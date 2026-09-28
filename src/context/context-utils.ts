/**
 * P0.6.1 — Context Utilities
 *
 * Pure utility functions for working with ContextObjects.
 *
 * Architecture Position:
 *   These are the fundamental type guards and accessors for ContextObjects.
 *   They are used by adapters, factories, and future assembly engines.
 *
 * Design Principles:
 *   1. Pure functions — no side effects, no state
 *   2. No database dependencies — work purely with in-memory objects
 *   3. No UI dependencies — usable in any layer
 *   4. No AI Provider dependencies — context-agnostic
 *   5. TypeScript narrowing — each guard narrows the type correctly
 */

import type { ContextObject } from './context-object';
import type { ContextKind } from './context-kind';
import { CONTEXT_KINDS } from './context-kind';
import type { ContextLifecycleStage } from './context-lifecycle';
import { CONTEXT_LIFECYCLE_STAGES } from './context-lifecycle';

// ═══════════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type guard: checks if a value is a valid ContextObject.
 *
 * Validates structural integrity — all required fields present and correctly typed.
 */
export function isContextObject(value: unknown): value is ContextObject {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Required string fields
  if (typeof obj['id'] !== 'string' || obj['id'] === '') return false;
  if (typeof obj['type'] !== 'string' || obj['type'] === '') return false;
  if (typeof obj['createdAt'] !== 'string') return false;
  if (typeof obj['updatedAt'] !== 'string') return false;

  // Kind must be a valid ContextKind
  if (!isContextKind(obj['kind'])) return false;

  // Payload field must exist (content validation is deferred to consumers)
  if (!('payload' in obj)) return false;

  // Provenance must be an object
  if (typeof obj['provenance'] !== 'object' || obj['provenance'] === null) return false;

  // Lifecycle must be valid
  if (!isContextLifecycleState(obj['lifecycle'])) return false;

  return true;
}

/**
 * Type guard: checks if a string is a valid ContextKind.
 */
export function isContextKind(value: unknown): value is ContextKind {
  return typeof value === 'string' && (CONTEXT_KINDS as readonly string[]).includes(value);
}

/**
 * Type guard: checks if a string is a valid ContextLifecycleStage.
 */
export function isContextLifecycleStage(value: unknown): value is ContextLifecycleStage {
  return typeof value === 'string' && (CONTEXT_LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/**
 * Type guard: checks if a value is a valid ContextLifecycleState.
 */
export function isContextLifecycleState(value: unknown): value is { stage: ContextLifecycleStage; updatedAt: string } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return isContextLifecycleStage(obj['stage']) && typeof obj['updatedAt'] === 'string';
}

/**
 * Type guard: narrows a ContextObject to a specific kind.
 *
 * Usage:
 *   if (isContextOfKind(ctx, 'strategy')) { ... }  // ctx is narrowed to ContextObject<StrategyContextPayload>
 */
export function isContextOfKind<TPayload>(
  context: ContextObject,
  kind: ContextKind
): context is ContextObject<TPayload> {
  return context.kind === kind;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accessor Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the unique ID of a context object.
 */
export function getContextId(context: ContextObject): string {
  return context.id;
}

/**
 * Get the context kind.
 */
export function getContextKind(context: ContextObject): ContextKind {
  return context.kind;
}

/**
 * Get the context type.
 */
export function getContextType(context: ContextObject): string {
  return context.type;
}

/**
 * Get the provenance of a context object.
 */
export function getContextProvenance(context: ContextObject): ContextObject['provenance'] {
  return context.provenance;
}

/**
 * Get the lifecycle stage of a context object.
 */
export function getContextLifecycleStage(context: ContextObject): ContextLifecycleStage {
  return context.lifecycle.stage;
}

/**
 * Get the confidence of a context object, normalized to 0-1 range.
 * Returns null if confidence is not set or out of range.
 */
export function getContextConfidence(context: ContextObject): number | null {
  const c = context.confidence;
  if (c === null || c === undefined) return null;
  if (typeof c !== 'number' || Number.isNaN(c)) return null;
  if (c < 0 || c > 1) return null;
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validation Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a context has source provenance.
 */
export function hasSource(context: ContextObject): boolean {
  return (
    context.provenance.source !== null &&
    context.provenance.source !== undefined &&
    context.provenance.source !== ''
  );
}

/**
 * Check if a context belongs to a specific topic.
 */
export function belongsToTopic(context: ContextObject, topicId: string): boolean {
  return context.provenance.topicId === topicId;
}

/**
 * Check if a context belongs to a specific project.
 */
export function belongsToProject(context: ContextObject, projectId: string): boolean {
  return context.provenance.projectId === projectId;
}

/**
 * Check if a context has a specific source type.
 */
export function hasSourceType(context: ContextObject, sourceType: string): boolean {
  return context.provenance.sourceType === sourceType;
}

/**
 * Check if a context is at or beyond a lifecycle stage.
 * Returns false if stages are not comparable.
 */
export function isAtOrBeyondLifecycleStage(
  context: ContextObject,
  targetStage: ContextLifecycleStage
): boolean {
  const stageOrder: ContextLifecycleStage[] = [
    'captured',
    'normalized',
    'stored',
    'retrieved',
    'applied',
    'evaluated',
    'updated',
    'learned',
  ];
  const currentIndex = stageOrder.indexOf(context.lifecycle.stage);
  const targetIndex = stageOrder.indexOf(targetStage);

  if (currentIndex === -1 || targetIndex === -1) return false;
  return currentIndex >= targetIndex;
}
