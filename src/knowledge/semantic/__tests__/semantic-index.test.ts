/**
 * P0.3.1 — Semantic Index Tests
 *
 * Tests for semantic index building and filtering.
 * Coverage:
 * - 24 KU can successfully build index
 * - candidate default not in index
 * - suspect NEVER in index
 * - include_candidates=true allows candidate
 * - Entry filter matching
 */

import { describe, it, expect } from 'vitest';
import type { CanonicalKnowledgeUnit, ConfidenceLevel } from '../../types';
import { buildSemanticIndex, entryMatchesFilters, computeIndexStats } from '../semantic-index';
import { MockEmbeddingProvider } from '../embedding-provider';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function createMockKU(overrides: Partial<CanonicalKnowledgeUnit> = {}): CanonicalKnowledgeUnit {
  const baseUnit: CanonicalKnowledgeUnit = {
    knowledge_id: 'KU_TEST_001',
    name: 'Test Knowledge Unit',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: 'A test knowledge unit',
    confidence: 'medium' as ConfidenceLevel,
    status: 'validated' as const,
    reclassified: false,
    evidence: {
      items: [
        {
          evidence_id: 'EV_TEST_001',
          content_id: 'test_content_1',
          quote: 'Test evidence quote',
          location: 'body',
          validation: 'valid' as const,
          evidence_quality: 'high' as const,
          noise_risk: 'low' as const,
          evidence_trust: 'trusted' as const,
        },
      ],
      unique_content_count: 3,
    },
    ...overrides,
  };
  return baseUnit;
}

// ─── Test Data ─────────────────────────────────────────────────────────────

const testUnits: CanonicalKnowledgeUnit[] = [
  // 1. Validated cognition
  createMockKU({
    knowledge_id: 'KU_A',
    name: '女性在成长过程中建立自我价值',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '帮助女性建立内在价值感',
    status: 'validated',
  }),

  // 2. Validated hook
  createMockKU({
    knowledge_id: 'KU_B',
    name: '如何提高视频开头的吸引力',
    category: 'hook',
    knowledge_level: 'surface_technique',
    description: '视频开头技巧与钩子设计',
    status: 'validated',
  }),

  // 3. Validated cognition
  createMockKU({
    knowledge_id: 'KU_C',
    name: '通过认知反转制造内容张力',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '用认知反转制造情绪张力',
    status: 'validated',
  }),

  // 4. Candidate (should be excluded by default)
  createMockKU({
    knowledge_id: 'KU_D',
    name: '争议性观点开场',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: '用争议性话题引起注意',
    status: 'candidate',
  }),

  // 5. Human expression confirmed
  createMockKU({
    knowledge_id: 'KU_E',
    name: '真实自然表达技巧',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '模拟真人说话方式',
    status: 'validated',
    human_expression_verdict: 'confirmed',
  }),

  // 6. Human expression suspect (NEVER enter index)
  createMockKU({
    knowledge_id: 'KU_F',
    name: 'ASR错误粘连表达',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '句子不完整的错误表达',
    status: 'candidate',
    human_expression_verdict: 'suspect',
  }),

  // 7. Human expression unconfirmed
  createMockKU({
    knowledge_id: 'KU_G',
    name: '自我修正真实感',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '说错话后自我纠正',
    status: 'candidate',
    human_expression_verdict: 'unconfirmed',
  }),
];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('buildSemanticIndex', () => {
  const provider = new MockEmbeddingProvider(32);

  it('should successfully build index from multiple KUs', async () => {
    const index = await buildSemanticIndex(
      testUnits.filter((u) => u.status === 'validated'),
      provider
    );

    expect(index.entries.length).toBe(4); // KU_A, KU_B, KU_C, KU_E
    expect(index.dimensions).toBe(32);
    expect(index.provider_id).toBe('mock');
  });

  it('should exclude candidate KUs by default', async () => {
    const index = await buildSemanticIndex(testUnits, provider, {
      include_candidates: false,
    });

    const candidateIds = index.entries
      .filter((e) => e.status === 'candidate')
      .map((e) => e.knowledge_id);

    expect(candidateIds.length).toBe(0);
  });

  it('should NEVER include suspect human_expression KUs', async () => {
    const index = await buildSemanticIndex(testUnits, provider, {
      include_candidates: true, // Even with candidates enabled
    });

    const suspectEntry = index.entries.find((e) => e.knowledge_id === 'KU_F');
    expect(suspectEntry).toBeUndefined();
  });

  it('should include candidate KUs when include_candidates=true', async () => {
    const index = await buildSemanticIndex(testUnits, provider, {
      include_candidates: true,
    });

    const ids = index.entries.map((e) => e.knowledge_id).sort();
    expect(ids).toContain('KU_D'); // candidate
    expect(ids).toContain('KU_G'); // unconfirmed candidate
    expect(ids).not.toContain('KU_F'); // suspect excluded
  });

  it('should produce normalized vectors', async () => {
    const index = await buildSemanticIndex(testUnits, provider);

    for (const entry of index.entries) {
      const magnitude = Math.sqrt(
        entry.vector.reduce((sum, v) => sum + v * v, 0)
      );
      expect(magnitude).toBeCloseTo(1.0, 5);
    }
  });

  it('should produce different vectors for different KUs', async () => {
    const index = await buildSemanticIndex(testUnits, provider);
    const aEntry = index.entries.find((e) => e.knowledge_id === 'KU_A');
    const bEntry = index.entries.find((e) => e.knowledge_id === 'KU_B');

    if (aEntry && bEntry) {
      const hasDifference = aEntry.vector.some(
        (v, i) => Math.abs(v - bEntry.vector[i]) > 0.01
      );
      expect(hasDifference).toBe(true);
    }
  });

  it('should be deterministic: same input produces same index', async () => {
    const index1 = await buildSemanticIndex(testUnits, provider);
    const index2 = await buildSemanticIndex(testUnits, provider);

    expect(index1.entries.length).toBe(index2.entries.length);
    expect(index1.dimensions).toBe(index2.dimensions);
    expect(index1.provider_id).toBe(index2.provider_id);

    for (let i = 0; i < index1.entries.length; i++) {
      expect(index1.entries[i].vector).toEqual(index2.entries[i].vector);
    }
  });

  it('only validated KUs should be in default index', async () => {
    const index = await buildSemanticIndex(testUnits, provider, {
      include_candidates: false,
    });