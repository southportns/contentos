/**
 * P0.7.1 — Runtime Context Unit Tests
 *
 * Tests for context retrieval helpers, policy resolution, and purpose mapping.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveRuntimePolicy,
  DEFAULT_RUNTIME_POLICY,
  createContextUsage,
  mapPurposeToAssembly,
} from '../runtime-context';
import type { ContextOSContextPolicy } from '../runtime-types';

// ═══════════════════════════════════════════════════════════════════════════════
// Category A: Policy Resolution
// ═══════════════════════════════════════════════════════════════════════════════

describe('resolveRuntimePolicy', () => {
  it('A1: should return defaults when no policy provided', () => {
    const policy = resolveRuntimePolicy(undefined);
    expect(policy).toEqual(DEFAULT_RUNTIME_POLICY);
  });

  it('A2: should merge user policy over defaults', () => {
    const userPolicy: ContextOSContextPolicy = {
      maxTokens: 12000,
      maxContexts: 100,
    };
    const resolved = resolveRuntimePolicy(userPolicy);
    expect(resolved.maxTokens).toBe(12000);
    expect(resolved.maxContexts).toBe(100);
  });

  it('A3: should preserve defaults for unspecified fields', () => {
    const userPolicy: ContextOSContextPolicy = { maxTokens: 5000 };
    const resolved = resolveRuntimePolicy(userPolicy);
    expect(resolved.maxTokens).toBe(5000);
    expect(resolved.includeMemory).toBe(DEFAULT_RUNTIME_POLICY.includeMemory);
    expect(resolved.includeOutcomes).toBe(DEFAULT_RUNTIME_POLICY.includeOutcomes);
  });

  it('A4: should not mutate the input policy', () => {
    const userPolicy: ContextOSContextPolicy = { maxTokens: 1000 };
    const snapshot = { ...userPolicy };
    resolveRuntimePolicy(userPolicy);
    expect(userPolicy).toEqual(snapshot);
  });

  it('A5: should override boolean flags when explicitly set', () => {
    const userPolicy: ContextOSContextPolicy = {
      includeMemory: false,
      includeGraph: true,
      graphDepth: 3,
    };
    const resolved = resolveRuntimePolicy(userPolicy);
    expect(resolved.includeMemory).toBe(false);
    expect(resolved.includeGraph).toBe(true);
    expect(resolved.graphDepth).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category B: DEFAULT_RUNTIME_POLICY
// ═══════════════════════════════════════════════════════════════════════════════

describe('DEFAULT_RUNTIME_POLICY', () => {
  it('B1: should have reasonable token budget', () => {
    expect(DEFAULT_RUNTIME_POLICY.maxTokens).toBeGreaterThan(0);
    expect(DEFAULT_RUNTIME_POLICY.maxTokens).toBeLessThanOrEqual(32000);
  });

  it('B2: should include memory by default', () => {
    expect(DEFAULT_RUNTIME_POLICY.includeMemory).toBe(true);
  });

  it('B3: should include outcomes by default', () => {
    expect(DEFAULT_RUNTIME_POLICY.includeOutcomes).toBe(true);
  });

  it('B4: should include decisions by default', () => {
    expect(DEFAULT_RUNTIME_POLICY.includeDecisions).toBe(true);
  });

  it('B5: should include feedback by default', () => {
    expect(DEFAULT_RUNTIME_POLICY.includeFeedback).toBe(true);
  });

  it('B6: should not include graph by default', () => {
    expect(DEFAULT_RUNTIME_POLICY.includeGraph).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category C: Purpose Mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe('mapPurposeToAssembly', () => {
  it('C1: should map strategy keywords to "strategy"', () => {
    expect(mapPurposeToAssembly('content_strategy')).toBe('strategy');
    expect(mapPurposeToAssembly('plan_creation')).toBe('strategy');
    expect(mapPurposeToAssembly('STRATEGY')).toBe('strategy');
  });

  it('C2: should map writing keywords to "writing"', () => {
    expect(mapPurposeToAssembly('writing_content')).toBe('writing');
    expect(mapPurposeToAssembly('draft_creation')).toBe('writing');
    expect(mapPurposeToAssembly('content_generation')).toBe('writing');
  });

  it('C3: should map evaluation keywords to "evaluation"', () => {
    expect(mapPurposeToAssembly('evaluation_request')).toBe('evaluation');
    expect(mapPurposeToAssembly('assess_quality')).toBe('evaluation');
    expect(mapPurposeToAssembly('score_draft')).toBe('evaluation');
  });

  it('C4: should default to "generic" for unknown purposes', () => {
    expect(mapPurposeToAssembly('random_task')).toBe('generic');
    expect(mapPurposeToAssembly('data_processing')).toBe('generic');
    expect(mapPurposeToAssembly('')).toBe('generic');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category D: Context Usage Tracking
// ═══════════════════════════════════════════════════════════════════════════════

describe('createContextUsage', () => {
  it('D1: should create a ContextUsage record with all fields', () => {
    const usage = createContextUsage('ctx_1', 'run_abc', 'writing', () => '2026-10-03T00:00:00Z');
    expect(usage.contextId).toBe('ctx_1');
    expect(usage.runId).toBe('run_abc');
    expect(usage.purpose).toBe('writing');
    expect(usage.usedAt).toBe('2026-10-03T00:00:00Z');
  });

  it('D2: should use current time when now is not provided', () => {
    const before = Date.now();
    const usage = createContextUsage('ctx_1', 'run_abc', 'writing');
    const after = Date.now();
    const usedAtMs = new Date(usage.usedAt).getTime();
    expect(usedAtMs).toBeGreaterThanOrEqual(before);
    expect(usedAtMs).toBeLessThanOrEqual(after);
  });

  it('D3: should accept custom clock function', () => {
    const customNow = () => '2026-01-01T00:00:00Z';
    const usage = createContextUsage('ctx_1', 'run_abc', 'writing', customNow);
    expect(usage.usedAt).toBe('2026-01-01T00:00:00Z');
  });
});
