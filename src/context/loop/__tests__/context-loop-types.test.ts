/**
 * P0.6.7 — Context Loop Types Tests
 *
 * Tests for type-level helpers and pure functions in context-loop-types.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  makeLoopId,
  makeLearningCandidateId,
  determineLoopCompleteness,
  createInitialStageStatus,
  createInitialMetrics,
  LEARNING_CANDIDATE_TYPES,
  CONTEXT_LOOP_STAGES,
  type ContextLoopStageStatus,
} from '../context-loop-index';

describe('P0.6.7 — Context Loop Types', () => {
  // ─── makeLoopId ────────────────────────────────────────────────────────────

  describe('makeLoopId', () => {
    it('should produce deterministic ID for same decisionId', () => {
      const id1 = makeLoopId('dec_001');
      const id2 = makeLoopId('dec_001');
      expect(id1).toBe(id2);
      expect(id1).toBe('loop_dec_001');
    });

    it('should include loop_ prefix', () => {
      const id = makeLoopId('any_decision');
      expect(id.startsWith('loop_')).toBe(true);
    });

    it('should be unique for different decision IDs', () => {
      const id1 = makeLoopId('dec_a');
      const id2 = makeLoopId('dec_b');
      expect(id1).not.toBe(id2);
    });

    it('should not include UUID or timestamp', () => {
      const id = makeLoopId('dec_test');
      expect(id).not.toContain('-');
      expect(id.match(/[a-f0-9]{8}/)).toBeNull();
    });
  });

  // ─── makeLearningCandidateId ───────────────────────────────────────────────

  describe('makeLearningCandidateId', () => {
    it('should produce deterministic ID for same inputs', () => {
      const id1 = makeLearningCandidateId('dec_001', 'successful_pattern');
      const id2 = makeLearningCandidateId('dec_001', 'successful_pattern');
      expect(id1).toBe(id2);
    });

    it('should include lc_ prefix', () => {
      const id = makeLearningCandidateId('dec_001', 'decision_pattern');
      expect(id.startsWith('lc_')).toBe(true);
    });

    it('should include decision ID', () => {
      const id = makeLearningCandidateId('my_decision', 'preference_signal');
      expect(id).toContain('my_decision');
    });

    it('should include candidate type', () => {
      const id = makeLearningCandidateId('dec_x', 'failure_pattern');
      expect(id).toContain('failure_pattern');
    });

    it('should produce unique IDs for different types', () => {
      const types = ['decision_pattern', 'successful_pattern', 'failure_pattern'] as const;
      const ids = types.map((t) => makeLearningCandidateId('dec_x', t));
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(types.length);
    });
  });

  // ─── determineLoopCompleteness ─────────────────────────────────────────────

  describe('determineLoopCompleteness', () => {
    it('should return no_decision when decision is false', () => {
      const status: ContextLoopStageStatus = {
        decision: false,
        outcome: false,
        feedback: false,
        graph: false,
        assembly: false,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('no_decision');
    });

    it('should return no_outcome when decision true but outcome false', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: false,
        feedback: false,
        graph: false,
        assembly: false,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('no_outcome');
    });

    it('should return outcome_available when outcome true but feedback false', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: true,
        feedback: false,
        graph: false,
        assembly: false,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('outcome_available');
    });

    it('should return feedback_available when feedback true but graph false', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: true,
        feedback: true,
        graph: false,
        assembly: false,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('feedback_available');
    });

    it('should return graph_available when graph true but assembly false', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: true,
        feedback: true,
        graph: true,
        assembly: false,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('graph_available');
    });

    it('should return assembled when assembly true but learning false', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: true,
        feedback: true,
        graph: true,
        assembly: true,
        learning: false,
      };
      expect(determineLoopCompleteness(status)).toBe('assembled');
    });

    it('should return learned when all stages true', () => {
      const status: ContextLoopStageStatus = {
        decision: true,
        outcome: true,
        feedback: true,
        graph: true,
        assembly: true,
        learning: true,
      };
      expect(determineLoopCompleteness(status)).toBe('learned');
    });
  });

  // ─── createInitialStageStatus ──────────────────────────────────────────────

  describe('createInitialStageStatus', () => {
    it('should create all-false status', () => {
      const status = createInitialStageStatus();
      expect(status.decision).toBe(false);
      expect(status.outcome).toBe(false);
      expect(status.feedback).toBe(false);
      expect(status.graph).toBe(false);
      expect(status.assembly).toBe(false);
      expect(status.learning).toBe(false);
    });
  });

  // ─── createInitialMetrics ──────────────────────────────────────────────────

  describe('createInitialMetrics', () => {
    it('should create metrics with all counters at zero', () => {
      const metrics = createInitialMetrics();
      expect(metrics.contextCount).toBe(0);
      expect(metrics.graphContextCount).toBe(0);
      expect(metrics.outcomeCount).toBe(0);
      expect(metrics.learningCandidateCount).toBe(0);
    });
  });

  // ─── Constants ─────────────────────────────────────────────────────────────

  describe('LEARNING_CANDIDATE_TYPES', () => {
    it('should contain exactly 5 types', () => {
      expect(LEARNING_CANDIDATE_TYPES).toHaveLength(5);
    });

    it('should include all expected types', () => {
      expect(LEARNING_CANDIDATE_TYPES).toContain('decision_pattern');
      expect(LEARNING_CANDIDATE_TYPES).toContain('successful_pattern');
      expect(LEARNING_CANDIDATE_TYPES).toContain('failure_pattern');
      expect(LEARNING_CANDIDATE_TYPES).toContain('preference_signal');
      expect(LEARNING_CANDIDATE_TYPES).toContain('strategy_signal');
    });
  });

  describe('CONTEXT_LOOP_STAGES', () => {
    it('should contain all 9 stages', () => {
      expect(CONTEXT_LOOP_STAGES).toHaveLength(9);
    });

    it('should start with validate and end with persist_learning', () => {
      expect(CONTEXT_LOOP_STAGES[0]).toBe('validate');
      expect(CONTEXT_LOOP_STAGES[CONTEXT_LOOP_STAGES.length - 1]).toBe('persist_learning');
    });
  });
});
