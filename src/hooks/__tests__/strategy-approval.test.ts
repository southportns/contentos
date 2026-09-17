/**
 * P0.3.8.4 — Strategy Human Approval Gate Tests
 *
 * Tests the state transitions for the strategy approval workflow.
 *
 * TEST 01: Initial state — status is 'none'
 * TEST 02: setStrategyPending — transitions to 'pending'
 * TEST 03: approveStrategy — transitions to 'approved'
 * TEST 04: rejectStrategy — transitions to 'rejected'
 * TEST 05: resetStrategyApproval — returns to 'none'
 * TEST 06: approveStrategy with edited strategy — stores modified version
 * TEST 07: knowledgeAssisted flag preserved across transitions
 * TEST 08: reviewedAt timestamp set on approve
 * TEST 09: reviewedAt timestamp set on reject
 * TEST 10: reset clears reviewedAt and approvedStrategy
 * TEST 11: Full lifecycle: none → pending → approved
 * TEST 12: Full lifecycle: none → pending → rejected → pending (regenerate)
 * TEST 13: approveStrategy without edit uses current strategy
 * TEST 14: Multiple resets maintain clean state
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StrategyApprovalState, StrategyApprovalStatus, ContentStrategy } from '../use-workflow';

const initialApproval: StrategyApprovalState = {
  status: 'none',
  knowledgeAssisted: false,
  reviewedAt: null,
  approvedStrategy: null,
};

function reducer(prev: WorkflowApprovalLite, action: ApprovalAction): WorkflowApprovalLite {
  switch (action.type) {
    case 'SET_PENDING':
      return { ...prev, strategyApproval: { status: 'pending', knowledgeAssisted: action.knowledgeAssisted, reviewedAt: null, approvedStrategy: null } };
    case 'APPROVE':
      return { ...prev, strategy: action.editedStrategy ?? prev.strategy, strategyApproval: { ...prev.strategyApproval, status: 'approved', reviewedAt: Date.now(), approvedStrategy: action.editedStrategy ?? prev.strategy } };
    case 'REJECT':
      return { ...prev, strategyApproval: { ...prev.strategyApproval, status: 'rejected', reviewedAt: Date.now() } };
    case 'RESET':
      return { ...prev, strategyApproval: { status: 'none', knowledgeAssisted: false, reviewedAt: null, approvedStrategy: null } };
    default:
      return prev;
  }
}

interface WorkflowApprovalLite { strategy: ContentStrategy | null; strategyApproval: StrategyApprovalState; }
type ApprovalAction =
  | { type: 'SET_PENDING'; knowledgeAssisted: boolean }
  | { type: 'APPROVE'; editedStrategy?: ContentStrategy }
  | { type: 'REJECT' }
  | { type: 'RESET' };

const sampleStrategy: ContentStrategy = {
  title: '测试策略标题', hook: '测试钩子',
  structure: [
    { section: '开头', purpose: '引起注意', keyArguments: ['论点1'], estimatedWords: 100 },
    { section: '主体', purpose: '展开论述', keyArguments: ['论点2', '论点3'], estimatedWords: 300 },
    { section: '结尾', purpose: '总结升华', keyArguments: ['论点4'], estimatedWords: 100 },
  ],
  keyArguments: ['论点1', '论点2', '论点3', '论点4'],
  emotionalArc: { start: '好奇', middle: '共鸣', end: '行动' },
  callToAction: '关注我', suggestedReferences: ['参考1'], tone: '温暖', estimatedWordCount: 500,
};

const editedStrategy: ContentStrategy = { ...sampleStrategy, title: '修改后的策略标题', hook: '修改后的钩子' };

const makeInitialState = (): WorkflowApprovalLite => ({ strategy: null, strategyApproval: { ...initialApproval } });

describe('P0.3.8.4 — Strategy Approval Gate', () => {
  let state: WorkflowApprovalLite;

  beforeEach(() => { state = makeInitialState(); vi.useRealTimers(); });

  it('TEST 01: initial status is none', () => {
    expect(state.strategyApproval.status).toBe('none');
    expect(state.strategyApproval.knowledgeAssisted).toBe(false);
    expect(state.strategyApproval.reviewedAt).toBeNull();
    expect(state.strategyApproval.approvedStrategy).toBeNull();
  });

  it('TEST 02: setStrategyPending transitions to pending', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    expect(state.strategyApproval.status).toBe('pending');
    expect(state.strategyApproval.knowledgeAssisted).toBe(true);
  });

  it('TEST 03: approveStrategy transitions to approved', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    state = { ...state, strategy: sampleStrategy };
    state = reducer(state, { type: 'APPROVE' });
    expect(state.strategyApproval.status).toBe('approved');
    expect(state.strategyApproval.approvedStrategy).toEqual(sampleStrategy);
  });

  it('TEST 04: rejectStrategy transitions to rejected', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    state = reducer(state, { type: 'REJECT' });
    expect(state.strategyApproval.status).toBe('rejected');
    expect(state.strategyApproval.reviewedAt).toBeTypeOf('number');
  });

  it('TEST 05: resetStrategyApproval returns to none', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    state = reducer(state, { type: 'REJECT' });
    state = reducer(state, { type: 'RESET' });
    expect(state.strategyApproval.status).toBe('none');
    expect(state.strategyApproval.knowledgeAssisted).toBe(false);
  });

  it('TEST 06: approveStrategy with edited strategy stores modified version', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    state = { ...state, strategy: sampleStrategy };
    state = reducer(state, { type: 'APPROVE', editedStrategy: editedStrategy });
    expect(state.strategy).toEqual(editedStrategy);
    expect(state.strategyApproval.approvedStrategy).toEqual(editedStrategy);
    expect(state.strategy?.title).toBe('修改后的策略标题');
  });

  it('TEST 07: knowledgeAssisted flag preserved through approve/reject', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    expect(state.strategyApproval.knowledgeAssisted).toBe(true);
    state = reducer(state, { type: 'REJECT' });
    expect(state.strategyApproval.knowledgeAssisted).toBe(true);
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    expect(state.strategyApproval.knowledgeAssisted).toBe(false);
  });

  it('TEST 08: reviewedAt timestamp set on approve', () => {
    const before = Date.now();
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    state = reducer(state, { type: 'APPROVE' });
    const after = Date.now();
    expect(state.strategyApproval.reviewedAt).toBeTypeOf('number');
    expect(state.strategyApproval.reviewedAt!).toBeGreaterThanOrEqual(before);
    expect(state.strategyApproval.reviewedAt!).toBeLessThanOrEqual(after);
  });

  it('TEST 09: reviewedAt timestamp set on reject', () => {
    const before = Date.now();
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    state = reducer(state, { type: 'REJECT' });
    const after = Date.now();
    expect(state.strategyApproval.reviewedAt).toBeTypeOf('number');
    expect(state.strategyApproval.reviewedAt!).toBeGreaterThanOrEqual(before);
    expect(state.strategyApproval.reviewedAt!).toBeLessThanOrEqual(after);
  });

  it('TEST 10: reset clears reviewedAt and approvedStrategy', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    state = { ...state, strategy: sampleStrategy };
    state = reducer(state, { type: 'APPROVE' });
    expect(state.strategyApproval.reviewedAt).not.toBeNull();
    state = reducer(state, { type: 'RESET' });
    expect(state.strategyApproval.reviewedAt).toBeNull();
    expect(state.strategyApproval.approvedStrategy).toBeNull();
  });

  it('TEST 11: full lifecycle none → pending → approved', () => {
    const statuses: StrategyApprovalStatus[] = [];
    statuses.push(state.strategyApproval.status);
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    statuses.push(state.strategyApproval.status);
    state = reducer(state, { type: 'APPROVE' });
    statuses.push(state.strategyApproval.status);
    expect(statuses).toEqual(['none', 'pending', 'approved']);
  });

  it('TEST 12: full lifecycle none → pending → rejected → pending (regenerate)', () => {
    const statuses: StrategyApprovalStatus[] = [];
    statuses.push(state.strategyApproval.status);
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    statuses.push(state.strategyApproval.status);
    state = reducer(state, { type: 'REJECT' });
    statuses.push(state.strategyApproval.status);
    state = reducer(state, { type: 'RESET' });
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    statuses.push(state.strategyApproval.status);
    expect(statuses).toEqual(['none', 'pending', 'rejected', 'pending']);
  });

  it('TEST 13: approveStrategy without edit uses current strategy', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    state = { ...state, strategy: sampleStrategy };
    state = reducer(state, { type: 'APPROVE' });
    expect(state.strategy).toEqual(sampleStrategy);
    expect(state.strategyApproval.status).toBe('approved');
  });

  it('TEST 14: multiple resets maintain clean state', () => {
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: true });
    state = reducer(state, { type: 'APPROVE' });
    state = reducer(state, { type: 'RESET' });
    state = reducer(state, { type: 'SET_PENDING', knowledgeAssisted: false });
    state = reducer(state, { type: 'REJECT' });
    state = reducer(state, { type: 'RESET' });
    expect(state.strategyApproval).toEqual({ status: 'none', knowledgeAssisted: false, reviewedAt: null, approvedStrategy: null });
  });
});
