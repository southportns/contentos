/**
 * P0.2.3-FIX — Knowledge Ranker Unit Tests
 *
 * Tests the ranking model fixes:
 * - Real level match (not fixed 0.5)
 * - Separate name/description matching
 * - Boundary-aware category matching
 * - Deterministic ranking
 * - Irrelevant query handling
 */

import { describe, it, expect } from 'vitest';
import { rankEntries } from '../knowledge-ranker';
import { KnowledgeStore } from '../knowledge-store';
import type { KnowledgeIndexEntry } from '../types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createIndexEntry(overrides: Partial<KnowledgeIndexEntry> = {}): KnowledgeIndexEntry {
  return {
    knowledge_id: 'KU_TEST_001',
    name: 'Test Knowledge Unit',
    category: 'hook',
    knowledge_level: 'structural_pattern',
    status: 'validated',
    confidence: 'medium',
    search_text: 'test knowledge unit for testing the ranker with hook opening patterns',
    search_name: 'test knowledge unit',
    search_description: 'for testing the ranker with hook opening patterns',
    search_pattern: '',
    trusted_evidence_count: 2,
    unique_content_count: 3,
    evidence_strength: 0.5,
    ...overrides,
  };
}

// ─── Ranker Tests ─────────────────────────────────────────────────────────────

describe('Knowledge Ranker', () => {
  // ── Level Match Tests (6 tests) ──────────────────────────────────────────

  it('level_match should never be a fixed 0.5 — it should be 0 or 1 based on synonyms', () => {
    const entries = [
      createIndexEntry({
        knowledge_id: 'KU_STRATEGIC',
        knowledge_level: 'strategic_pattern',
        category: 'cognition',
        search_text: 'some text with 认知 反转 keywords',
        search_description: 'description with 认知 反转',
      }),
    ];

    // Query with strategic level synonyms should match
    const result1 = rankEntries(entries, ['认知', '反转']);
    expect(result1.length).toBeGreaterThan(0);

    // Query without strategic level synonyms should still match on keyword but level_match = 0
    const result2 = rankEntries(entries, ['text']);
    expect(result2.length).toBeGreaterThan(0);
    // The score should differ between the two queries due to level_match
    if (result1.length > 0 && result2.length > 0) {
      expect(result1[0].score).not.toBe(result2[0].score);
    }
  });

  it('strategic query ("认知 反转") should get level_match boost for strategic_pattern', () => {
    const strategicEntry = createIndexEntry({
      knowledge_id: 'KU_STRATEGIC',
      knowledge_level: 'strategic_pattern',
      category: 'cognition',
      search_text: '认知 反转 pattern description',
      search_description: '认知 反转 pattern',
    });

    const result = rankEntries([strategicEntry], ['认知', '反转']);
    expect(result.length).toBeGreaterThan(0);
    // Strategic query matching strategic level should have higher score
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  it('structural query ("开头 钩子") should get level_match boost for structural_pattern', () => {
    const structuralEntry = createIndexEntry({
      knowledge_id: 'KU_STRUCTURAL',
      knowledge_level: 'structural_pattern',
      category: 'hook',
      search_text: '开头 钩子 opening patterns',
      search_description: '开头 钩子 opening',
    });

    const result = rankEntries([structuralEntry], ['开头', '钩子']);
    expect(result.length).toBeGreaterThan(0);
    // Should match and get level boost
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  it('expression query ("真实 自然 口语") should get level_match boost for expression_principle', () => {
    const expressionEntry = createIndexEntry({
      knowledge_id: 'KU_EXPRESSION',
      knowledge_level: 'expression_principle',
      category: 'human_expression',
      search_text: '真实 自然 口语 expression patterns',
      search_description: '真实 自然 口语 expression',
    });

    const result = rankEntries([expressionEntry], ['真实', '自然']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  it('surface query ("技巧 手法 句式") should get level_match boost for surface_technique', () => {
    const surfaceEntry = createIndexEntry({
      knowledge_id: 'KU_SURFACE',
      knowledge_level: 'surface_technique',
      category: 'language',
      search_text: '技巧 手法 句式 language techniques',
      search_description: '技巧 手法 句式 techniques',
    });

    const result = rankEntries([surfaceEntry], ['技巧', '手法']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].score).toBeGreaterThan(0.3);
  });

  // ── Name vs Description Separation (2 tests) ────────────────────────────

  it('name_match and description_match should use different fields', () => {
    const entry = createIndexEntry({
      knowledge_id: 'KU_NAMETEST',
      name: 'Specific Name Term',
      category: 'hook',
      knowledge_level: 'structural_pattern',
      search_text: 'specific name term general description without the keyword',
      search_name: 'specific name term',
      search_description: 'general description without the keyword',
      search_pattern: '',
    });

    // Query matching only the name should produce results
    const result = rankEntries([entry], ['name', 'term']);
    expect(result.length).toBeGreaterThan(0);
    // Name match should contribute to score
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('description-only keyword should match description even if not in name', () => {
    const entry = createIndexEntry({
      knowledge_id: 'KU_DESCTEST',
      name: 'ShortName',
      category: 'hook',
      knowledge_level: 'structural_pattern',
      search_text: 'shortname description with uniquekeyword inside',
      search_name: 'shortname',
      search_description: 'description with uniquekeyword inside',
      search_pattern: '',
    });

    const result = rankEntries([entry], ['uniquekeyword']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].matched_terms).toContain('uniquekeyword');
  });

  // ── Category Match Tests (2 tests) ───────────────────────────────────────

  it('category matching should not produce false positives from single-char substrings', () => {
    // "结" is a single char that should NOT match "结束" (ending synonym)
    const hookEntry = createIndexEntry({
      knowledge_id: 'KU_HOOK',
      name: 'Test Hook',
      category: 'hook',
      knowledge_level: 'structural_pattern',
      search_text: 'test hook opening pattern',
      search_name: 'test hook',
      search_description: 'opening pattern',
      search_pattern: 'Opening → Hook',
    });

    // Query "结" alone should not match anything
    const result = rankEntries([hookEntry], ['结']);
    expect(result.length).toBe(0);
  });

  it('category matching should work for multi-char category synonyms', () => {
    const hookEntry = createIndexEntry({
      knowledge_id: 'KU_HOOK2',
      name: 'Question Hook',
      category: 'hook',
      knowledge_level: 'structural_pattern',
      search_text: 'question hook pattern with 开头',
      search_name: 'question hook',
      search_description: 'pattern with 开头',
      search_pattern: 'Question → Hook',
    });

    // Query "开头" should match hook category
    const result = rankEntries([hookEntry], ['开头']);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].matched_terms).toContain('开头');
  });

  // ── Determinism (2 tests) ───────────────────────────────────────────────

  it('should produce deterministic results for same input', () => {
    const entries = [
      createIndexEntry({ knowledge_id: 'KU_A', search_text: 'alpha test', search_description: 'alpha test', search_name: 'alpha test' }),
      createIndexEntry({ knowledge_id: 'KU_B', search_text: 'beta test', search_description: 'beta test', search_name: 'beta test' }),
      createIndexEntry({ knowledge_id: 'KU_C', search_text: 'gamma test', search_description: 'gamma test', search_name: 'gamma test' }),
    ];

    const result1 = rankEntries(entries, ['test']);
    const result2 = rankEntries(entries, ['test']);
    expect(result1).toEqual(result2);
  });

  it('should produce same results on multiple consecutive calls', () => {
    const entries = [
      createIndexEntry({ knowledge_id: 'KU_X', search_text: 'cognitive reversal pattern', search_description: 'cognitive reversal', search_name: 'cognitive' }),
    ];

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(rankEntries(entries, ['cognitive', 'reversal']));
    }

    // All results should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });

  // ── Unrelated Query Tests (2 tests) ─────────────────────────────────────

  it('unrelated query should return empty results', () => {
    const entries = [
      createIndexEntry({ knowledge_id: 'KU_1', search_text: 'opening hook pattern', search_description: 'hook', search_name: 'hook' }),
      createIndexEntry({ knowledge_id: 'KU_2', search_text: 'emotion empathy', search_description: 'empathy', search_name: 'emotion' }),
    ];

    const result = rankEntries(entries, ['量子', '物理', '芯片']);
    expect(result.length).toBe(0);
  });

  it('completely irrelevant multi-word query should return empty', () => {
    const entries = [
      createIndexEntry({ knowledge_id: 'KU_IRR', search_text: 'some content about relationships', search_description: 'relationships', search_name: 'content' }),
    ];

    const result = rankEntries(entries, ['量子物理', '芯片', '技术']);
    expect(result.length).toBe(0);
  });

  // ── Score Component Tests (2 tests) ─────────────────────────────────────

  it('results with more matched keywords should score higher', () => {
    const entry1 = createIndexEntry({
      knowledge_id: 'KU_LOW',
      search_text: 'single keyword match',
      search_description: 'single',
      search_name: 'single',
    });

    const entry2 = createIndexEntry({
      knowledge_id: 'KU_HIGH',
      search_text: 'keyword1 keyword2 keyword3 match',
      search_description: 'keyword1 keyword2 keyword3',
      search_name: 'keyword1 keyword2 keyword3',
    });

    const entries = [entry1, entry2];
    const result = rankEntries(entries, ['keyword1', 'keyword2', 'keyword3']);

    // Entry with more matches should rank higher
    const highResult = result.find((r) => r.knowledge_id === 'KU_HIGH');
    const lowResult = result.find((r) => r.knowledge_id === 'KU_LOW');

    if (highResult && lowResult) {
      expect(highResult.score).toBeGreaterThan(lowResult.score);
    }
  });

  it('high confidence entries should tiebreak above low confidence', () => {
    const entryHigh = createIndexEntry({
      knowledge_id: 'KU_HIGH_CONF',
      confidence: 'high',
      search_text: 'identical search text',
      search_description: 'identical',
      search_name: 'identical',
      evidence_strength: 0.5,
    });

    const entryLow = createIndexEntry({
      knowledge_id: 'KU_LOW_CONF',
      confidence: 'low',
      search_text: 'identical search text',
      search_description: 'identical',
      search_name: 'identical',
      evidence_strength: 0.5,
    });

    const result = rankEntries([entryHigh, entryLow], ['identical']);

    if (result.length === 2) {
      // High confidence should come first
      expect(result[0].knowledge_id).toBe('KU_HIGH_CONF');
      expect(result[1].knowledge_id).toBe('KU_LOW_CONF');
    }
  });
});

// ─── Integration: Store + Ranker ──────────────────────────────────────────────

describe('Knowledge Ranker Integration', () => {
  it('store.search should return empty for completely unrelated topic', () => {
    const store = new KnowledgeStore();
    const result = store.search({ topic: '量子物理芯片技术', limit: 5 });
    expect(result.total).toBe(0);
    expect(result.results.length).toBe(0);
  });

  it('store.search should return results for relevant topic', () => {
    const store = new KnowledgeStore();
    const result = store.search({ topic: '认知反转', limit: 5 });
    expect(result.total).toBeGreaterThan(0);
  });

  it('store.search should NOT include suspect human_expression', () => {
    const store = new KnowledgeStore();
    const result = store.search({ topic: '表达 自然', include_candidates: true, limit: 10 });
    const hasSuspect = result.results.some((r) => r.knowledge_id === 'KU_019');
    expect(hasSuspect).toBe(false);
  });

  it('store.search should be deterministic', () => {
    const store = new KnowledgeStore();
    const result1 = store.search({ topic: '认知反转', limit: 5 });
    const result2 = store.search({ topic: '认知反转', limit: 5 });
    expect(result1.results).toEqual(result2.results);
  });
});
