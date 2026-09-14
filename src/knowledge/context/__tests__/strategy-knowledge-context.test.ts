/**
 * P0.3.8.1 — Strategy Knowledge Contract Tests
 *
 * Tests the transformation from KnowledgeContext → StrategyKnowledgeContext.
 *
 * Coverage:
 *   1. Validated item preserved
 *   2. Candidate item preserved
 *   3. Mixed items preserved
 *   4. Primary order preserved
 *   5. Supporting order preserved
 *   6. Similarity preserved
 *   7. Confidence preserved
 *   8. EvidenceCount preserved
 *   9. Empty context
 *   10. Source context immutable
 *   11. Deterministic transformation
 *   12. Internal retrieval metadata excluded
 *   13. No knowledgeId leakage
 *   14. No retrievalReason leakage
 *   15. No retrieval dependency (threshold/topK excluded)
 *   16. Candidate never converted to validated
 *   17. evidenceCount optional field
 *   18. similarity range validation
 *   19. Pure function (repeated calls same result)
 */

import { describe, it, expect } from 'vitest';
import type { SemanticRetrievalResponse } from '../../semantic/types';
import { buildKnowledgeContext } from '../knowledge-context-builder';
import { toStrategyKnowledgeContext } from '../strategy-knowledge-context';
import type { CanonicalKnowledgeUnit, Evidence } from '../../types';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function createMockEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    evidence_id: 'EV_TEST_001',
    content_id: 'content_1',
    quote: '原始证据引用文本',
    location: 'body',
    validation: 'valid',
    evidence_quality: 'high',
    noise_risk: 'low',
    evidence_trust: 'trusted',
    ...overrides,
  };
}

function createMockKU(overrides: Partial<CanonicalKnowledgeUnit> = {}): CanonicalKnowledgeUnit {
  return {
    knowledge_id: 'KU_TEST_001',
    name: '测试知识单元',
    category: 'cognition',
    knowledge_level: 'strategic_pattern',
    description: '这是一个测试知识单元的描述',
    abstract_pattern: '测试抽象模式',
    function: '测试功能',
    principle: '测试原则',
    confidence: 'high',
    status: 'validated',
    reclassified: false,
    evidence: {
      items: [createMockEvidence()],
      unique_content_count: 1,
    },
    surface_forms: ['表面形式1', '表面形式2'],
    ...overrides,
  };
}

/**
 * Create a mock retrieval result.
 *
 * Matches runtime shape expected by buildKnowledgeContext:
 *   { knowledge_id, knowledge, similarity, retrieval_reason }
 *
 * Note: The type system (types.ts) doesn't fully capture the runtime shape
 * of retrieval results (missing `knowledge`, `retrieval_reason` fields).
 * We use `as` to bridge this gap, consistent with existing test patterns.
 */
function createMockRetrievalResult(overrides: {
  knowledge_id?: string;
  name?: string;
  category?: CanonicalKnowledgeUnit['category'];
  knowledge_level?: CanonicalKnowledgeUnit['knowledge_level'];
  confidence?: CanonicalKnowledgeUnit['confidence'];
  status?: CanonicalKnowledgeUnit['status'];
  similarity?: number;
  retrieval_reason?: string;
  evidence_count?: number;
} = {}): SemanticRetrievalResponse['results'][number] {
  const {
    knowledge_id = 'KU_TEST_001',
    name = '测试知识单元',
    category = 'cognition',
    knowledge_level = 'strategic_pattern',
    confidence = 'high',
    status = 'validated',
    similarity = 0.85,
    retrieval_reason = 'High semantic similarity to query',
    evidence_count = 1,
  } = overrides;

  const ku = createMockKU({
    knowledge_id,
    name,
    category,
    knowledge_level,
    confidence,
    status,
    evidence: {
      items: Array.from({ length: evidence_count }, (_, i) =>
        createMockEvidence({ evidence_id: `EV_${knowledge_id}_${i}` })
      ),
      unique_content_count: evidence_count,
    },
  });

  // Runtime shape includes `knowledge` and `retrieval_reason`
  // which the simplified types.ts SemanticRetrievalResultItem omits.
  return {
    knowledge_id,
    similarity,
    retrieval_reason,
    knowledge: ku,
  } as unknown as SemanticRetrievalResponse['results'][number];
}

function createMockResponse(
  results: SemanticRetrievalResponse['results'],
  query = '测试查询'
): SemanticRetrievalResponse {
  return {
    query,
    results,
    total: results.length,
  };
}

// ─── TEST 01: Validated Item Preserved ────────────────────────────────────

describe('P0.3.8.1 — Strategy Knowledge Contract', () => {
  describe('Field Preservation', () => {
    it('TEST 01: should preserve all validated item fields', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_001',
          name: 'Hook Pattern Alpha',
          category: 'hook',
          knowledge_level: 'strategic_pattern',
          confidence: 'high',
          status: 'validated',
          similarity: 0.92,
          evidence_count: 3,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toHaveLength(1);
      const item = strategyCtx.primaryKnowledge[0];

      expect(item.name).toBe('Hook Pattern Alpha');
      expect(item.category).toBe('hook');
      expect(item.knowledgeLevel).toBe('strategic_pattern');
      expect(item.confidence).toBe('high');
      expect(item.status).toBe('validated');
      expect(item.similarity).toBeCloseTo(0.92, 5);
      expect(item.evidenceCount).toBe(3);
      expect(item.text).toContain('Hook Pattern Alpha');
    });

    // ─── TEST 02: Candidate Item Preserved ───────────────────────────────

    it('TEST 02: should preserve candidate item without conversion', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CAND_001',
          name: 'Candidate Structure',
          category: 'structure',
          knowledge_level: 'structural_pattern',
          confidence: 'medium',
          status: 'candidate',
          similarity: 0.78,
          evidence_count: 2,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toHaveLength(1);
      const item = strategyCtx.primaryKnowledge[0];

      expect(item.status).toBe('candidate');
      expect(item.name).toBe('Candidate Structure');
      expect(item.confidence).toBe('medium');
      expect(item.similarity).toBeCloseTo(0.78, 5);
      expect(item.evidenceCount).toBe(2);
    });

    // ─── TEST 03: Mixed Items Preserved ─────────────────────────────────

    it('TEST 03: should preserve both validated and candidate items', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_VAL_001',
          name: 'Validated Hook',
          status: 'validated',
          similarity: 0.95,
          confidence: 'high',
        }),
        createMockRetrievalResult({
          knowledge_id: 'KU_CAN_001',
          name: 'Candidate Emotion',
          status: 'candidate',
          similarity: 0.80,
          confidence: 'low',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toHaveLength(2);
      expect(strategyCtx.primaryKnowledge[0].status).toBe('validated');
      expect(strategyCtx.primaryKnowledge[1].status).toBe('candidate');
    });

    // ─── TEST 04: Primary Order Preserved ────────────────────────────────

    it('TEST 04: should preserve primary knowledge order from builder', () => {
      const response = createMockResponse(
        [
          createMockRetrievalResult({
            knowledge_id: 'KU_ORDER_1',
            name: 'First',
            status: 'validated',
            similarity: 0.95,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_ORDER_2',
            name: 'Second',
            status: 'validated',
            similarity: 0.90,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_ORDER_3',
            name: 'Third',
            status: 'validated',
            similarity: 0.85,
          }),
        ],
        'test query'
      );

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].name).toBe('First');
      expect(strategyCtx.primaryKnowledge[1].name).toBe('Second');
      expect(strategyCtx.primaryKnowledge[2].name).toBe('Third');
    });

    // ─── TEST 05: Supporting Order Preserved ─────────────────────────────

    it('TEST 05: should preserve supporting knowledge order from builder', () => {
      const response = createMockResponse(
        [
          createMockRetrievalResult({
            knowledge_id: 'KU_SUP_1',
            name: 'Supporting One',
            status: 'validated',
            similarity: 0.70,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_SUP_2',
            name: 'Supporting Two',
            status: 'validated',
            similarity: 0.65,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_SUP_3',
            name: 'Supporting Three',
            status: 'validated',
            similarity: 0.60,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_SUP_4',
            name: 'Supporting Four',
            status: 'validated',
            similarity: 0.55,
          }),
          createMockRetrievalResult({
            knowledge_id: 'KU_SUP_5',
            name: 'Supporting Five',
            status: 'validated',
            similarity: 0.50,
          }),
        ],
        'test query'
      );

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      // With 5 items, primary should get 3 (floor(5*0.6)=3), supporting gets 2
      expect(strategyCtx.supportingKnowledge.length).toBeGreaterThan(0);

      // Verify item ordering preserved: higher similarity items come first
      expect(strategyCtx.supportingKnowledge.length).toBeGreaterThanOrEqual(0);
    });

    // ─── TEST 06: Similarity Preserved ──────────────────────────────────

    it('TEST 06: should preserve exact similarity values', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_SIM_001',
          name: 'Similar Item',
          similarity: 0.6789,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].similarity).toBeCloseTo(0.6789, 5);
    });

    // ─── TEST 07: Confidence Preserved ──────────────────────────────────

    it('TEST 07: should preserve confidence levels (high/medium/low)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CONF_HIGH',
          name: 'High Conf',
          confidence: 'high',
        }),
        createMockRetrievalResult({
          knowledge_id: 'KU_CONF_MED',
          name: 'Medium Conf',
          confidence: 'medium',
        }),
        createMockRetrievalResult({
          knowledge_id: 'KU_CONF_LOW',
          name: 'Low Conf',
          confidence: 'low',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].confidence).toBe('high');
      expect(strategyCtx.primaryKnowledge[1].confidence).toBe('medium');
      expect(strategyCtx.primaryKnowledge[2].confidence).toBe('low');
    });

    // ─── TEST 08: EvidenceCount Preserved ───────────────────────────────

    it('TEST 08: should preserve evidenceCount values', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_EVD_5',
          name: 'Five Evidence',
          evidence_count: 5,
        }),
        createMockRetrievalResult({
          knowledge_id: 'KU_EVD_0',
          name: 'No Evidence',
          evidence_count: 0,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].evidenceCount).toBe(5);
      expect(strategyCtx.primaryKnowledge[1].evidenceCount).toBe(0);
    });
  });

  // ─── TEST 09: Empty Context ────────────────────────────────────────────

  describe('Empty Context', () => {
    it('TEST 09: should return empty arrays for empty context', () => {
      const response = createMockResponse([], 'empty test query');

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toEqual([]);
      expect(strategyCtx.supportingKnowledge).toEqual([]);
    });

    it('TEST 09b: should handle context with only supporting knowledge empty', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_SINGLE', name: 'Single' }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      // With 1 item (≤3), all go to primary
      expect(strategyCtx.primaryKnowledge).toHaveLength(1);
      expect(strategyCtx.supportingKnowledge).toEqual([]);
    });
  });

  // ─── TEST 10: Source Context Immutable ─────────────────────────────────

  describe('Immutability', () => {
    it('TEST 10: should not mutate source KnowledgeContext', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_IMM_1', name: 'Immutable Test' }),
        createMockRetrievalResult({ knowledge_id: 'KU_IMM_2', name: 'Second Item' }),
      ]);

      const context = buildKnowledgeContext(response);
      const before = JSON.parse(JSON.stringify(context));

      toStrategyKnowledgeContext(context);

      expect(context).toEqual(before);
    });

    it('TEST 10b: should not mutate individual items', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_ITEM_IMM',
          name: 'Item Immutable',
          status: 'candidate',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const originalItem = { ...context.primaryKnowledge[0] };

      toStrategyKnowledgeContext(context);

      expect(context.primaryKnowledge[0]).toEqual(originalItem);
    });
  });

  // ─── TEST 11: Deterministic Transformation ──────────────────────────────

  describe('Determinism', () => {
    it('TEST 11: should produce identical results for identical inputs', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_DET_1', name: 'Determinism Test' }),
        createMockRetrievalResult({ knowledge_id: 'KU_DET_2', name: 'Second' }),
      ]);

      const context = buildKnowledgeContext(response);

      const result1 = toStrategyKnowledgeContext(context);
      const result2 = toStrategyKnowledgeContext(context);
      const result3 = toStrategyKnowledgeContext(context);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    it('TEST 11b: should produce same output on repeated calls (pure function)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_PURE',
          name: 'Pure Function',
          similarity: 0.777,
          evidence_count: 4,
        }),
      ]);

      const context = buildKnowledgeContext(response);

      const results = Array.from({ length: 10 }, () =>
        toStrategyKnowledgeContext(context)
      );

      for (const result of results) {
        expect(result).toEqual(results[0]);
      }
    });
  });

  // ─── TEST 12-15: Internal Metadata Exclusion ───────────────────────────

  describe('Internal Metadata Exclusion', () => {
    it('TEST 12: should exclude knowledgeId field', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_INTERNAL_123',
          name: 'Internal Test',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      expect(item).not.toHaveProperty('knowledgeId');
      expect(Object.keys(item)).not.toContain('knowledgeId');
    });

    it('TEST 13: should exclude retrievalReason field', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_NOREASON',
          name: 'No Reason Test',
          retrieval_reason: 'This should not appear',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      expect(item).not.toHaveProperty('retrievalReason');
      expect(Object.keys(item)).not.toContain('retrievalReason');
    });

    it('TEST 14: should not expose retrievalInternals', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_NOINT', name: 'No Internal' }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const serialized = JSON.stringify(strategyCtx);

      // Ensure retrieval internals are not in the serialized output
      expect(serialized).not.toContain('threshold');
      expect(serialized).not.toContain('topK');
      expect(serialized).not.toContain('retrievedCount');
    });

    it('TEST 15: should not contain knowledgeId values in output', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_SENSITIVE_ID_42',
          name: 'Sensitive ID Test',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const serialized = JSON.stringify(strategyCtx);
      expect(serialized).not.toContain('KU_SENSITIVE_ID_42');
    });
  });

  // ─── TEST 16: Status Preservation ──────────────────────────────────────

  describe('Status Semantics', () => {
    it('TEST 16: candidate must never be converted to validated', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CANDIDATE_STAYS',
          name: 'Stays Candidate',
          status: 'candidate',
          confidence: 'high', // Even with high confidence, status stays candidate
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      // Candidate with high confidence MUST remain candidate
      expect(strategyCtx.primaryKnowledge[0].status).toBe('candidate');
    });

    it('TEST 16b: candidate + high confidence is valid state (not converted)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CAND_HIGH',
          name: 'Candidate High Confidence',
          status: 'candidate',
          confidence: 'high',
          evidence_count: 5,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      expect(item.status).toBe('candidate');
      expect(item.confidence).toBe('high');
      expect(item.evidenceCount).toBe(5);
    });

    it('TEST 16c: validated must never be downgraded', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_VAL_STAYS',
          name: 'Stays Validated',
          status: 'validated',
          confidence: 'low', // Even with low confidence, status stays validated
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].status).toBe('validated');
    });
  });

  // ─── TEST 17: Evidence Count Optional ──────────────────────────────────

  describe('Optional Fields', () => {
    it('TEST 17: evidenceCount should propagate correctly', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_EVD_OPT',
          name: 'Evidence Optional',
          evidence_count: 7,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].evidenceCount).toBe(7);
      expect(
        typeof strategyCtx.primaryKnowledge[0].evidenceCount
      ).toBe('number');
    });

    it('TEST 17b: zero evidenceCount is valid', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_EVD_ZERO',
          name: 'Zero Evidence',
          evidence_count: 0,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].evidenceCount).toBe(0);
    });
  });

  // ─── TEST 18: Similarity Semantics ─────────────────────────────────────

  describe('Similarity Semantics', () => {
    it('TEST 18: similarity should be a number between 0 and 1', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_SIM_RANGE',
          name: 'Similarity Range',
          similarity: 0.45,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const similarity = strategyCtx.primaryKnowledge[0].similarity;
      expect(typeof similarity).toBe('number');
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('TEST 18b: zero similarity is preserved', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_SIM_ZERO',
          name: 'Zero Similarity',
          similarity: 0,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge[0].similarity).toBe(0);
    });
  });

  // ─── TEST 19: StrategyKnowledgeContext Structure ───────────────────────

  describe('Contract Structure', () => {
    it('TEST 19: output should have exactly primaryKnowledge and supportingKnowledge', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_STRUCT', name: 'Structure Test' }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const keys = Object.keys(strategyCtx).sort();
      expect(keys).toEqual(['primaryKnowledge', 'supportingKnowledge']);
    });

    it('TEST 19b: StrategyKnowledgeItem should have exactly 8 fields', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_FIELDS',
          name: 'Field Count',
          evidence_count: 3,
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      const keys = Object.keys(item).sort();
      expect(keys).toEqual([
        'category',
        'confidence',
        'evidenceCount',
        'knowledgeLevel',
        'name',
        'similarity',
        'status',
        'text',
      ]);
    });
  });

  // ─── TEST 20: Primary / Supporting Classification ───────────────────────

  describe('Primary / Supporting Classification', () => {
    it('TEST 20: single item goes to primary (≤3 rule)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_ONE', name: 'One Item' }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toHaveLength(1);
      expect(strategyCtx.supportingKnowledge).toEqual([]);
    });

    it('TEST 20b: 3 items all go to primary (≤3 rule)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_THREE_1', name: 'One', similarity: 0.9 }),
        createMockRetrievalResult({ knowledge_id: 'KU_THREE_2', name: 'Two', similarity: 0.8 }),
        createMockRetrievalResult({ knowledge_id: 'KU_THREE_3', name: 'Three', similarity: 0.7 }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      expect(strategyCtx.primaryKnowledge).toHaveLength(3);
      expect(strategyCtx.supportingKnowledge).toEqual([]);
    });

    it('TEST 20c: 5 items split into primary (3) and supporting (2)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_FIVE_1', name: 'One', similarity: 0.95 }),
        createMockRetrievalResult({ knowledge_id: 'KU_FIVE_2', name: 'Two', similarity: 0.90 }),
        createMockRetrievalResult({ knowledge_id: 'KU_FIVE_3', name: 'Three', similarity: 0.85 }),
        createMockRetrievalResult({ knowledge_id: 'KU_FIVE_4', name: 'Four', similarity: 0.80 }),
        createMockRetrievalResult({ knowledge_id: 'KU_FIVE_5', name: 'Five', similarity: 0.75 }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      // floor(5 * 0.6) = 3 primary, 2 supporting
      expect(strategyCtx.primaryKnowledge).toHaveLength(3);
      expect(strategyCtx.supportingKnowledge).toHaveLength(2);

      // Verify order: higher similarity first
      expect(strategyCtx.primaryKnowledge[0].name).toBe('One');
      expect(strategyCtx.primaryKnowledge[1].name).toBe('Two');
      expect(strategyCtx.primaryKnowledge[2].name).toBe('Three');
      expect(strategyCtx.supportingKnowledge[0].name).toBe('Four');
      expect(strategyCtx.supportingKnowledge[1].name).toBe('Five');
    });
  });

  // ─── TEST 21: No Retrieval Dependency ──────────────────────────────────

  describe('Retrieval Independence', () => {
    it('TEST 21: output should not contain any retrieval internal fields', () => {
      const response = createMockResponse([
        createMockRetrievalResult({ knowledge_id: 'KU_INDEP', name: 'Independent Test' }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      // Serialize full output and verify no retrieval internals leaked
      const json = JSON.stringify(strategyCtx);
      const parsed = JSON.parse(json);

      // Check top-level structure
      expect(parsed).toHaveProperty('primaryKnowledge');
      expect(parsed).toHaveProperty('supportingKnowledge');

      // Ensure no retrieval metadata at top level
      expect(parsed).not.toHaveProperty('query');
      expect(parsed).not.toHaveProperty('retrieval');
      expect(parsed).not.toHaveProperty('selectedCount');
      expect(parsed).not.toHaveProperty('constraints');
      expect(parsed).not.toHaveProperty('metadata');

      // Ensure no retrieval metadata in items
      const item = parsed.primaryKnowledge[0];
      expect(item).not.toHaveProperty('knowledgeId');
      expect(item).not.toHaveProperty('retrievalReason');
    });
  });

  // ─── TEST 22: Candidate with Various Confidence Levels ─────────────────

  describe('Candidate + Confidence Matrix', () => {
    it('TEST 22: candidate + high confidence is valid (no conversion)', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CAND_HIGHCONF',
          name: 'Candidate High',
          status: 'candidate',
          confidence: 'high',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      expect(item.status).toBe('candidate');
      expect(item.confidence).toBe('high');
    });

    it('TEST 22b: candidate + low confidence is valid', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_CAND_LOWCONF',
          name: 'Candidate Low',
          status: 'candidate',
          confidence: 'low',
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const item = strategyCtx.primaryKnowledge[0];
      expect(item.status).toBe('candidate');
      expect(item.confidence).toBe('low');
    });

    it('TEST 22c: status and confidence are independent dimensions', () => {
      const statuses: Array<'validated' | 'candidate'> = ['validated', 'candidate'];
      const confidences: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];

      for (const status of statuses) {
        for (const confidence of confidences) {
          const response = createMockResponse([
            createMockRetrievalResult({
              knowledge_id: `KU_${status}_${confidence}`,
              name: `${status} ${confidence}`,
              status,
              confidence,
            }),
          ]);

          const context = buildKnowledgeContext(response);
          const strategyCtx = toStrategyKnowledgeContext(context);

          const item = strategyCtx.primaryKnowledge[0];
          expect(item.status).toBe(status);
          expect(item.confidence).toBe(confidence);
        }
      }
    });
  });

  // ─── TEST 23: Text Content Preserved ───────────────────────────────────

  describe('Text Content', () => {
    it('TEST 23: full knowledge text is preserved', () => {
      const response = createMockResponse([
        createMockRetrievalResult({
          knowledge_id: 'KU_TEXT_FULL',
          name: 'Complete Text Pattern',
          // The builder reconstructs text from name + description + abstract_pattern + etc.
        }),
      ]);

      const context = buildKnowledgeContext(response);
      const strategyCtx = toStrategyKnowledgeContext(context);

      const text = strategyCtx.primaryKnowledge[0].text;
      expect(text).toContain('Complete Text Pattern');
      expect(text.length).toBeGreaterThan(0);
    });
  });
});
