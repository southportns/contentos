/**
 * P0.6.1 — Context Lifecycle Contract
 *
 * Defines the lifecycle stages a Context Object passes through.
 *
 * Architecture Position:
 *   Lifecycle tracks the "maturity" of a Context Object over time.
 *   It does NOT implement lifecycle management — it only defines the contract.
 *
 * Lifecycle Stages:
 *   captured   — Raw data entered the system (user input, API response, file upload)
 *   normalized — Transformed into structured format (validation, serialization)
 *   stored     — Persisted in database or memory
 *   retrieved  — Loaded from storage for use
 *   applied    — Injected into a process (prompt assembly, decision flow)
 *   evaluated  — Assessed for quality, relevance, or accuracy
 *   updated    — Modified based on feedback or new information
 *   learned    — Insights extracted and stored in memory layer
 *
 * Design Principles:
 *   1. Stages are sequential but not strictly enforced
 *   2. A context can move backward (e.g., re-evaluation after update)
 *   3. Only current stage is tracked (not full history)
 *   4. P0.6.1 defines the contract only — no lifecycle engine
 *
 * Non-goals:
 *   - Not a state machine (that is P0.6.2+)
 *   - Not persisted to database
 *   - Not enforced by runtime
 */

export type ContextLifecycleStage =
  | 'captured'
  | 'normalized'
  | 'stored'
  | 'retrieved'
  | 'applied'
  | 'evaluated'
  | 'updated'
  | 'learned';

export const CONTEXT_LIFECYCLE_STAGES: readonly ContextLifecycleStage[] = [
  'captured',
  'normalized',
  'stored',
  'retrieved',
  'applied',
  'evaluated',
  'updated',
  'learned',
] as const;

export interface ContextLifecycleState {
  stage: ContextLifecycleStage;
  updatedAt: string;
}

export function createInitialLifecycleState(
  stage: ContextLifecycleStage = 'captured',
  updatedAt?: string
): ContextLifecycleState {
  return {
    stage,
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}