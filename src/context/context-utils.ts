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

export function isContextObject(value: unknown): value is ContextObject {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj['id'] !== 'string' || obj['id'] === '') return false;
  if (typeof obj['type'] !== 'string' || obj['type'] === '') return false;
  if (typeof obj['createdAt'] !== 'string') return false;
  if (typeof obj['updatedAt'] !== 'string') return false;
  if (!isContextKind(obj['kind'])) return false;
  if (typeof obj['provenance'] !== 'object' || obj['provenance'] === null) return false;
  if (!isContextLifecycleState(obj['lifecycle'])) return false;

  return true;
}

export function isContextKind(value: unknown): value is ContextKind {
  return typeof value === 'string' && (CONTEXT_KINDS as readonly string[]).includes(value);
}

export function isContextLifecycleStage(value: unknown): value is ContextLifecycleStage {
  return typeof value === 'string' && (CONTEXT_LIFECYCLE_STAGES as readonly string[]).includes(value);
}

export function isContextLifecycleState(value: unknown): value is { stage: ContextLifecycleStage; updatedAt: string } {
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return isContextLifecycleStage(obj['stage']) && typeof obj['updatedAt'] === 'string';
}

export function isContextOfKind<TPayload>(
  context: ContextObject,
  kind: ContextKind
): context is ContextObject<TPayload> {
  return context.kind === kind;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Accessor Utilities
// ═══════════════════════════════════════════════════════════════════════════════

export function getContextId(context: ContextObject): string {
  return context.id;
}

export function getContextKind(context: ContextObject): ContextKind {
  return context.kind;
}

export function getContextType(context: ContextObject): string {
  return context.type;
}

export function getContextProvenance(context: ContextObject): ContextObject['provenance'] {
  return context.provenance;
}

export function getContextLifecycleStage(context: ContextObject): ContextLifecycleStage {
  return context.lifecycle.stage;
}

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

export function hasSource(context: ContextObject): boolean {
  return (
    context.provenance.source !== null &&
    context.provenance.source !== undefined &&
    context.provenance.source !== ''
  );
}

export function belongsToTopic(context: ContextObject, topicId: string): boolean {
  return context.provenance.topicId === topicId;
}

export function belongsToProject(context: ContextObject, projectId: string): boolean {
  return context.provenance.projectId === projectId;
}

export function hasSourceType(context: ContextObject, sourceType: string): boolean {
  return context.provenance.sourceType === sourceType;
}

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