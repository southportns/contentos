/**
 * P0.6.7 — Context Loop End-to-End
 *
 * Barrel exports for the Context Loop module.
 *
 * Architecture:
 *   Context Loop connects Decision → Outcome → Feedback → Graph → Assembly → Learning
 *
 * Usage:
 *   import {
 *     runContextLoop,
 *     buildLearningCandidates,
 *     makeLoopId,
 *     makeLearningCandidateId,
 *     type ContextLoopRequest,
 *     type ContextLoopResult,
 *     type ContextLoopDependencies,
 *     type LearningCandidate,
 *   } from '@/context/loop';
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  ContextLoopRequest,
  ContextLoopResult,
  ContextLoopDependencies,
  ContextLoopCompleteness,
  ContextLoopStageStatus,
  ContextLoopMetrics,
  LearningCandidate,
  LearningCandidateType,
  LearningCandidateEvidence,
} from './context-loop-types';

export {
  LEARNING_CANDIDATE_TYPES,
  CONTEXT_LOOP_STAGES,
  makeLoopId,
  makeLearningCandidateId,
  determineLoopCompleteness,
  createInitialStageStatus,
  createInitialMetrics,
} from './context-loop-types';

export type { ContextLoopStage } from './context-loop-types';

// ── Core Functions ──────────────────────────────────────────────────────────

export { runContextLoop } from './context-loop-orchestrator';
export { buildLearningCandidates } from './context-loop-learning';
