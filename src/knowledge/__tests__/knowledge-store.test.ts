/**
 * P0.2.3 — Knowledge Store Unit Tests
 *
 * Covers: Store, Index, Filters, Ranker, Retriever
 * 25 test cases covering validated/candidate/excluded/suspect scenarios.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeStore } from '../knowledge-store';
import {
  CanonicalKnowledgeUnit,
} from '../types';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createMockKU(overrides: Partial<CanonicalKnowledgeUnit> = {}): CanonicalKnowledgeUnit {
  return {
    knowledge_id: 'KU_TEST_001',
    name: 'Test Knowledge Unit',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: 'A test knowledge unit for testing',
    abstract_pattern: 'Test → Assert → Verify',
    function: 'Enable testing of the knowledge store',
    confidence: 'medium',
    status: 'validated',
    reclassified: false,
    evidence: {
      items: [
        {
          evidence_id: 'EV_TEST_001',
          content_id: 'test_content_1',
          quote: 'Test evidence quote',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 3,
    },
    ...overrides,
  };
}

// ─── Test Data: Diverse KUs ─────────────────────────────────────────────────

const mockUnits: CanonicalKnowledgeUnit[] = [
  // 1. Validated strategic_pattern (perspective)
  createMockKU({
    knowledge_id: 'KU_010',
    name: 'Direct Address Empowerment',
    category: 'perspective',
    knowledge_level: 'strategic_pattern',
    description: '用姐妹/女生直接称呼观众，配合赋能式语言建立情感连接和信任',
    confidence: 'high',
    status: 'validated',
    evidence: {
      items: [
        {
          evidence_id: 'EV_010_01',
          content_id: 'c1',
          quote: '姐妹们记住',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
        {
          evidence_id: 'EV_010_02',
          content_id: 'c2',
          quote: '真心建议所有年轻女孩子',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
        {
          evidence_id: 'EV_010_03',
          content_id: 'c3',
          quote: '一定要给自己建立标准',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 3,
    },
  }),

  // 2. Validated cognition (strategic_pattern)
  createMockKU({
    knowledge_id: 'KU_014',
    name: 'Expectation Reversal Pattern',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '挑战观众固有认知，用反直觉但逻辑自洽的观点制造认知冲击',
    confidence: 'medium',
    status: 'validated',
    evidence: {
      items: [
        {
          evidence_id: 'EV_014_01',
          content_id: 'c4',
          quote: '我们一直以为追求被爱很重要',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
        {
          evidence_id: 'EV_014_02',
          content_id: 'c5',
          quote: '我们一直以为女性天生恋爱脑',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 2,
    },
  }),

  // 3. Candidate KU (should be excluded by default)
  createMockKU({
    knowledge_id: 'KU_002',
    name: 'Controversial Assertion Hook',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    description: '用争议性观点开场制造认知冲突',
    confidence: 'low',
    status: 'candidate',
    evidence: {
      items: [
        {
          evidence_id: 'EV_002_01',
          content_id: 'c6',
          quote: '说一个很多女生不愿意承认的',
          location: 'opening',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 1,
    },
  }),

  // 4. Human expression confirmed
  createMockKU({
    knowledge_id: 'KU_020',
    name: 'Intentional Rhythm Device',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '通过重复制造节奏感和情绪递进',
    confidence: 'medium',
    status: 'validated',
    human_expression_verdict: 'confirmed',
    principle: '用重复制造节奏感',
    surface_forms: ['他忽略了X他忽略了Y他忽略了Z'],
    evidence: {
      items: [
        {
          evidence_id: 'EV_020_01',
          content_id: 'c7',
          quote: '他忽略了年龄差他忽略了美貌',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
        {
          evidence_id: 'EV_020_02',
          content_id: 'c8',
          quote: '你总是在解释，对方总是在敷衍',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 2,
    },
  }),

  // 5. Human expression suspect (should NEVER appear in default retrieval)
  createMockKU({
    knowledge_id: 'KU_019',
    name: 'Cognitive Veracity Signal',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '句子不完整模拟真实思维流动',
    confidence: 'low',
    status: 'candidate',
    human_expression_verdict: 'suspect',
    evidence: {
      items: [
        {
          evidence_id: 'EV_019_02',
          content_id: 'c9',
          quote: 'ASR句子粘连',
          location: 'body',
          validation: 'weak',
          evidence_quality: 'low',
          noise_risk: 'high',
          evidence_trust: 'excluded',
        },
      ],
      unique_content_count: 1,
    },
  }),

  // 6. Human expression unconfirmed (candidate-like)
  createMockKU({
    knowledge_id: 'KU_017',
    name: 'Self-Correction Realness',
    category: 'human_expression',
    knowledge_level: 'expression_principle',
    description: '说错话后自我纠正模拟真实思维过程',
    confidence: 'low',
    status: 'candidate',
    human_expression_verdict: 'unconfirmed',
    evidence: {
      items: [
        {
          evidence_id: 'EV_017_01',
          content_id: 'c10',
          quote: '说错了嘴一快',
          location: 'body',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
      ],
      unique_content_count: 1,
    },
  }),

  // 7. Validated ending with caution evidence
  createMockKU({
    knowledge_id: 'KU_022',
    name: 'Action Prompt Ending',
    category: 'ending',
    knowledge_level: 'surface_technique',
    description: '用行动号召结尾引导互动',
    confidence: 'medium',
    status: 'validated',
    evidence: {
      items: [
        {
          evidence_id: 'EV_022_01',
          content_id: 'c11',
          quote: '视频可能随时会被下架，最好把我设成特别关注',
          location: 'ending',
          validation: 'valid',
          evidence_quality: 'high',
          noise_risk: 'low',
          evidence_trust: 'trusted',
        },
        {
          evidence_id: 'EV_022_02',
          content_id: 'c12',
          quote: '你们可以艾一下豆包',
          location: 'ending',
          validation: 'weak',
          evidence_quality: 'medium',
          noise_risk: 'low',
          evidence_trust: 'caution',
        },
      ],
      unique_content_count: 2,
    },
  }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KnowledgeStore', () => {
  let store: KnowledgeStore;

  beforeEach(() => {
    store = new KnowledgeStore(mockUnits);
  });

  // ── Store Basics (4 tests) ─────────────────────────────────────────────

  it('should create store with correct size', () => {
    expect(store.size).toBe(7);
  });

  it('should get validated KUs only', () => {
    const validated = store.getValidated();
    expect(validated.length).toBe(4);
    expect(validated.every((u) => u.status === 'validated')).toBe(true);
  });

  it('should get candidate KUs only', () => {
    const candidates = store.getCandidates();
    expect(candidates.length).toBe(3);
    expect(candidates.every((u) => u.status === 'candidate')).toBe(true);
  });

  it('should get KU by ID', () => {
    const ku = store.getById('KU_010');
    expect(ku).toBeDefined();
    expect(ku?.name).toBe('Direct Address Empowerment');
  });

  // ── Filters: Status & Human Expression Safety (5 tests) ────────────────

  it('should exclude candidates by default in search', () => {
    const response = store.search({ topic: '争议' });
    const hasCandidate = response.results.some(
      (r) => r.status === 'candidate'
    );
    expect(hasCandidate).toBe(false);
  });

  it('should include candidates when include_candidates=true', () => {
    const response = store.search({
      topic: '争议',
      include_candidates: true,
    });
    const hasCandidate = response.results.some(
      (r) => r.status === 'candidate'
    );
    expect(hasCandidate).toBe(true);
  });

  it('should NEVER include suspect human_expression in default search', () => {
    const response = store.search({
      topic: '真实自然表达',
      include_candidates: true,
    });
    const hasSuspect = response.results.some(
      (r) => r.knowledge_id === 'KU_019'
    );
    expect(hasSuspect).toBe(false);
  });

  it('should exclude unconfirmed human_expression by default', () => {
    const response = store.search({
      topic: '自我修正',
      include_candidates: false,
    });
    const hasUnconfirmed = response.results.some(
      (r) => r.knowledge_id === 'KU_017'
    );
    expect(hasUnconfirmed).toBe(false);
  });

  it('should include confirmed human_expression by default', () => {
    const response = store.search({
      topic: '重复节奏',
      include_candidates: false,
    });
    const hasConfirmed = response.results.some(
      (r) => r.knowledge_id === 'KU_022' || r.knowledge_id === 'KU_020'
    );
    expect(hasConfirmed).toBe(true);
  });

  // ── Category & Level Filtering (3 tests) ────────────────────────────────

  it('should filter by category', () => {
    const response = store.search({
      topic: '测试',
      category: ['hook'],
      include_candidates: true,
    });
    expect(response.results.every((r) => r.category === 'hook')).toBe(true);
  });

  it('should filter by knowledge_level', () => {
    const response = store.search({
      topic: '测试',
      knowledge_level: ['strategic_pattern'],
      include_candidates: true,
    });
    expect(
      response.results.every((r) => r.knowledge_level === 'strategic_pattern')
    ).toBe(true);
  });

  it('should filter by confidence', () => {
    const response = store.search({
      topic: '测试',
      confidence: 'high',
      include_candidates: true,
    });
    expect(response.results.every((r) => r.confidence === 'high')).toBe(true);
  });

  // ── Keyword Matching (4 tests) ─────────────────────────────────────────

  it('should match KU by topic keywords in description', () => {
    const response = store.search({
      topic: '姐妹赋能',
    });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].knowledge_id).toBe('KU_010');
  });

  it('should match KU by cognitive reversal keywords', () => {
    const response = store.search({
      topic: '认知反转被爱',
    });
    const ku014Present = response.results.some(
      (r) => r.knowledge_id === 'KU_014'
    );
    expect(ku014Present).toBe(true);
  });

  it('should return empty results for irrelevant query', () => {
    const response = store.search({
      topic: '量子物理芯片',
    });
    expect(response.total).toBe(0);
    expect(response.results.length).toBe(0);
  });

  it('should return empty for empty topic', () => {
    const response = store.search({ topic: '' });
    expect(response.total).toBe(0);
  });

  // ── Ranking (3 tests) ──────────────────────────────────────────────────

  it('should rank results by score descending', () => {
    const response = store.search({
      topic: '姐妹赋能自我价值认知',
    });
    if (response.results.length >= 2) {
      for (let i = 0; i < response.results.length - 1; i++) {
        expect(response.results[i].score).toBeGreaterThanOrEqual(
          response.results[i + 1].score
        );
      }
    }
  });

  it('should include matched_terms and retrieval_reason', () => {
    const response = store.search({
      topic: '姐妹赋能',
    });
    if (response.results.length > 0) {
      const first = response.results[0];
      expect(first.matched_terms.length).toBeGreaterThan(0);
      expect(first.retrieval_reason.length).toBeGreaterThan(0);
    }
  });

  it('should respect the limit parameter', () => {
    const response = store.search({
      topic: '测试',
      include_candidates: true,
      limit: 3,
    });
    expect(response.results.length).toBeLessThanOrEqual(3);
  });

  // ── getByCategory & getByLevel (2 tests) ────────────────────────────────

  it('should get KUs by category', () => {
    const hooks = store.getByCategory('hook');
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((u) => u.category === 'hook')).toBe(true);
  });

  it('should get KUs by level', () => {
    const strategic = store.getByLevel('strategic_pattern');
    expect(strategic.length).toBeGreaterThan(0);
    expect(
      strategic.every((u) => u.knowledge_level === 'strategic_pattern')
    ).toBe(true);
  });

  // ── Evidence Trust Safety (2 tests) ─────────────────────────────────────

  it('should not include excluded evidence in search_text', () => {
    const index = store.getIndex();
    const suspectEntry = index.find((e) => e.knowledge_id === 'KU_019');
    if (suspectEntry) {
      // The excluded evidence quote should not appear in search_text
      expect(suspectEntry.search_text).not.toContain('ASR句子粘连');
    }
  });

  it('should rank KUs with higher trusted evidence higher', () => {
    const index = store.getIndex();
    const ku010 = index.find((e) => e.knowledge_id === 'KU_010');
    const ku002 = index.find((e) => e.knowledge_id === 'KU_002');

    // KU_010 has 3 trusted evidence from 3 unique contents → higher strength
    // KU_002 has 1 trusted evidence from 1 unique content → lower strength
    if (ku010 && ku002) {
      expect(ku010.trusted_evidence_count).toBeGreaterThan(
        ku002.trusted_evidence_count
      );
    }
  });

  // ── API Response Shape (1 test) ─────────────────────────────────────────

  it('should return properly shaped API response', () => {
    const response = store.search({ topic: '姐妹赋能' });
    expect(response).toHaveProperty('query');
    expect(response).toHaveProperty('results');
    expect(response).toHaveProperty('total');
    expect(typeof response.total).toBe('number');
    expect(Array.isArray(response.results)).toBe(true);

    if (response.results.length > 0) {
      const r = response.results[0];
      expect(r).toHaveProperty('knowledge_id');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('matched_terms');
      expect(r).toHaveProperty('knowledge_level');
      expect(r).toHaveProperty('category');
      expect(r).toHaveProperty('confidence');
      expect(r).toHaveProperty('status');
      expect(r).toHaveProperty('retrieval_reason');
    }
  });

  // ── Determinism (1 test) ───────────────────────────────────────────────

  it('should produce deterministic results for same input', () => {
    const response1 = store.search({ topic: '姐妹赋能自我价值' });
    const response2 = store.search({ topic: '姐妹赋能自我价值' });
    expect(response1.results).toEqual(response2.results);
  });
});
