/**
 * P0.3.7.3 — Knowledge Context Builder Tests
 *
 * Tests the full builder pipeline:
 *   Retrieval Response → Builder → KnowledgeContext
 *
 * Covers:
 *   - Normal flow
 *   - Empty context
 *   - Candidate handling (includeCandidates true/false)
 *   - Validated priority over candidate
 *   - Primary / Supporting classification
 *   - maxItems
 *   - wasTruncated
 *   - selectedCount correctness
 *   - Evidence traceability
 *   - Evidence deduplication
 *   - Knowledge text preservation
 *   - Similarity preservation
 *   - Confidence preservation
 *   - Status preservation
 *   - retrievalReason preservation
 *   - Deterministic ordering
 *   - Tie-breaker
 *   - No exception on empty knowledge
 *   - Candidate not converted to validated
 *   - P0.3.7.3.1: wasTruncated semantics (5 boundary tests)
 */

import { describe, it, expect } from 'vitest';
import type {
  CanonicalKnowledgeUnit,
  Evidence,
} from '../../types';
import type { SemanticRetrievalResponse, SemanticRetrievalResult } from '../../semantic/types';
import { buildKnowledgeContext } from '../knowledge-context-builder';

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
    abstract_pattern: '抽象模式',
    function: '功能说明',
    confidence: 'high',
    status: 'validated',
    reclassified: false,
    evidence: {
      items: [createMockEvidence()],
      unique_content_count: 1,
    },
    ...overrides,
  };
}

function createMockResult(
  ku: CanonicalKnowledgeUnit,
  similarity: number,
  retrievalReason = '语义相似度: 85.0% | 知识等级: 战略模式 | 分类: 认知模式'
): SemanticRetrievalResult {
  return {
    knowledge_id: ku.knowledge_id,
    similarity,
    knowledge: ku,
    retrieval_method: 'semantic',
    retrieval_reason: retrievalReason,
  };
}

function createMockResponse(
  results: SemanticRetrievalResult[],
  query = '测试查询'
): SemanticRetrievalResponse {
  return {
    query,
    results,
    total: results.length,
    retrieval_method: 'semantic',
  };
}

// ─── TEST 01: Normal Flow ─────────────────────────────────────────────────

describe('TEST 01: Normal Retrieval → KnowledgeContext', () => {
  it('builds context from valid retrieval response', () => {
    const ku = createMockKU({ knowledge_id: 'KU_001' });
    const result = createMockResult(ku, 0.85);
    const response = createMockResponse([result]);

    const context = buildKnowledgeContext(response);

    expect(context.query).toBe('测试查询');
    expect(context.selectedCount).toBe(1);
    expect(context.primaryKnowledge).toHaveLength(1);
    expect(context.supportingKnowledge).toHaveLength(0);
    expect(context.primaryKnowledge[0].knowledgeId).toBe('KU_001');
  });
});

// ─── TEST 02: Empty Context ────────────────────────────────────────────────

describe('TEST 02: Empty Retrieval → Empty Context', () => {
  it('returns valid empty context when no results', () => {
    const response = createMockResponse([]);

    const context = buildKnowledgeContext(response);

    expect(context.selectedCount).toBe(0);
    expect(context.primaryKnowledge).toEqual([]);
    expect(context.supportingKnowledge).toEqual([]);
    expect(context.evidence).toEqual([]);
    expect(context.constraints.hasCandidates).toBe(false);
    expect(context.constraints.wasTruncated).toBe(false);
    expect(context.metadata.version).toBe('1.0.0');
    expect(context.metadata.source).toBe('p0.3.7');
  });
});

// ─── TEST 03: Candidate + includeCandidates=false ──────────────────────────

describe('TEST 03: Candidate excluded when not in response', () => {
  it('handles response with only validated KUs (normal case)', () => {
    const ku = createMockKU({ knowledge_id: 'KU_V', status: 'validated' });
    const result = createMockResult(ku, 0.8);
    const response = createMockResponse([result]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge).toHaveLength(1);
    expect(context.primaryKnowledge[0].status).toBe('validated');
    expect(context.constraints.hasCandidates).toBe(false);
  });
});

// ─── TEST 04: Candidate + includeCandidates=true ──────────────────────────

describe('TEST 04: Candidate included when present in response', () => {
  it('keeps candidate KUs when present in retrieval results', () => {
    const ku = createMockKU({
      knowledge_id: 'KU_CAND_001',
      status: 'candidate',
      confidence: 'medium',
    });
    const result = createMockResult(ku, 0.6);
    const response = createMockResponse([result]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge).toHaveLength(1);
    expect(context.primaryKnowledge[0].status).toBe('candidate');
    expect(context.constraints.hasCandidates).toBe(true);
  });
});

// ─── TEST 05: Validated priority over candidate ────────────────────────────

describe('TEST 05: Validated prioritized over candidate', () => {
  it('sorts validated before candidate when both present', () => {
    const kuCandidate = createMockKU({
      knowledge_id: 'KU_C',
      status: 'candidate',
      confidence: 'high',
    });
    const kuValidated = createMockKU({
      knowledge_id: 'KU_V',
      status: 'validated',
      confidence: 'medium',
    });

    // Candidate has higher similarity but validated should come first
    const resultCandidate = createMockResult(kuCandidate, 0.9);
    const resultValidated = createMockResult(kuValidated, 0.7);

    const response = createMockResponse([resultCandidate, resultValidated]);
    const context = buildKnowledgeContext(response);

    // Validated should be first despite lower similarity
    expect(context.primaryKnowledge[0].knowledgeId).toBe('KU_V');
    expect(context.primaryKnowledge[0].status).toBe('validated');
  });
});

// ─── TEST 06: Primary / Supporting Classification ──────────────────────────

describe('TEST 06: Primary / Supporting classification', () => {
  it('classifies 2 items as all primary', () => {
    const ku1 = createMockKU({ knowledge_id: 'KU_001' });
    const ku2 = createMockKU({ knowledge_id: 'KU_002' });
    const response = createMockResponse([
      createMockResult(ku1, 0.9),
      createMockResult(ku2, 0.8),
    ]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge).toHaveLength(2);
    expect(context.supportingKnowledge).toHaveLength(0);
  });

  it('classifies 5 items as 3 primary + 2 supporting', () => {
    const kus = Array.from({ length: 5 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_00${i + 1}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.9 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response);

    // 5 items → floor(5 * 0.6) = 3 primary, 2 supporting
    expect(context.primaryKnowledge).toHaveLength(3);
    expect(context.supportingKnowledge).toHaveLength(2);
    expect(context.selectedCount).toBe(5);
  });

  it('classifies 4 items as 2 primary + 2 supporting', () => {
    const kus = Array.from({ length: 4 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_00${i + 1}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.9 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response);

    // 4 items → floor(4 * 0.6) = 2 primary, 2 supporting
    expect(context.primaryKnowledge).toHaveLength(2);
    expect(context.supportingKnowledge).toHaveLength(2);
  });
});

// ─── TEST 07: maxItems ─────────────────────────────────────────────────────

describe('TEST 07: maxItems limit', () => {
  it('limits context to maxItems', () => {
    const kus = Array.from({ length: 10 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_0${String(i + 1).padStart(2, '0')}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.95 - i * 0.01));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 3 });

    expect(context.selectedCount).toBe(3);
    expect(context.primaryKnowledge.length + context.supportingKnowledge.length).toBe(3);
    expect(context.constraints.maxItems).toBe(3);
  });

  it('does not truncate when results <= maxItems', () => {
    const kus = Array.from({ length: 3 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_00${i + 1}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.9 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 5 });

    expect(context.selectedCount).toBe(3);
    expect(context.constraints.wasTruncated).toBe(false);
  });
});

// ─── TEST 08: wasTruncated ─────────────────────────────────────────────────

describe('TEST 08: wasTruncated flag', () => {
  it('sets wasTruncated when results exceed maxItems', () => {
    const kus = Array.from({ length: 8 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_0${String(i + 1).padStart(2, '0')}` })
    );
    const results = kus.map((ku) => createMockResult(ku, 0.8));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 3 });

    expect(context.constraints.wasTruncated).toBe(true);
    expect(context.selectedCount).toBe(3);
  });

  it('wasTruncated is false when results fit within maxItems', () => {
    const kus = Array.from({ length: 2 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_00${i + 1}` })
    );
    const results = kus.map((ku) => createMockResult(ku, 0.8));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 5 });

    expect(context.constraints.wasTruncated).toBe(false);
  });
});

// ─── TEST 09: selectedCount correctness ────────────────────────────────────

describe('TEST 09: selectedCount matches actual selection', () => {
  it('selectedCount = primary.length + supporting.length', () => {
    const kus = Array.from({ length: 6 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_0${String(i + 1).padStart(2, '0')}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.9 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 4 });

    const actualCount = context.primaryKnowledge.length + context.supportingKnowledge.length;
    expect(context.selectedCount).toBe(actualCount);
  });
});

// ─── TEST 10: Evidence Traceability ────────────────────────────────────────

describe('TEST 10: Evidence traceability', () => {
  it('builds evidence references for selected knowledge', () => {
    const ku = createMockKU({
      knowledge_id: 'KU_EV_001',
      evidence: {
        items: [
          createMockEvidence({ evidence_id: 'EV_001', content_id: 'C_001', quote: '证据A' }),
          createMockEvidence({ evidence_id: 'EV_002', content_id: 'C_002', quote: '证据B' }),
        ],
        unique_content_count: 2,
      },
    });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    expect(context.evidence).toHaveLength(2);
    expect(context.evidence[0].knowledgeId).toBe('KU_EV_001');
    expect(context.evidence[0].evidenceId).toBe('EV_001');
    expect(context.evidence[0].contentId).toBe('C_001');
  });
});

// ─── TEST 11: Evidence Deduplication ───────────────────────────────────────

describe('TEST 11: Evidence deduplication', () => {
  it('deduplicates evidence by evidenceId', () => {
    const ku1 = createMockKU({
      knowledge_id: 'KU_DUP_001',
      evidence: {
        items: [
          createMockEvidence({ evidence_id: 'EV_SHARED', content_id: 'C_001', quote: '共享证据' }),
        ],
        unique_content_count: 1,
      },
    });
    const ku2 = createMockKU({
      knowledge_id: 'KU_DUP_002',
      evidence: {
        items: [
          createMockEvidence({ evidence_id: 'EV_SHARED', content_id: 'C_001', quote: '共享证据' }),
        ],
        unique_content_count: 1,
      },
    });
    const response = createMockResponse([
      createMockResult(ku1, 0.9),
      createMockResult(ku2, 0.8),
    ]);

    const context = buildKnowledgeContext(response);

    // Only one evidence entry for shared evidenceId
    expect(context.evidence).toHaveLength(1);
    expect(context.evidence[0].evidenceId).toBe('EV_SHARED');
  });
});

// ─── TEST 12: Knowledge text preservation ──────────────────────────────────

describe('TEST 12: Knowledge text not modified', () => {
  it('preserves original knowledge text from description', () => {
    const originalDescription = '这是原始知识描述，不应被修改或总结';
    const ku = createMockKU({
      knowledge_id: 'KU_TEXT_001',
      description: originalDescription,
      name: '知识名称',
    });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    // Text should contain the original description
    expect(context.primaryKnowledge[0].text).toContain(originalDescription);
  });
});

// ─── TEST 13: Similarity preservation ──────────────────────────────────────

describe('TEST 13: Similarity not recalculated', () => {
  it('preserves similarity from retrieval result', () => {
    const ku = createMockKU({ knowledge_id: 'KU_SIM_001' });
    const response = createMockResponse([createMockResult(ku, 0.7777)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].similarity).toBe(0.7777);
  });
});

// ─── TEST 14: Confidence preservation ──────────────────────────────────────

describe('TEST 14: Confidence not recalculated', () => {
  it('preserves confidence from source KU', () => {
    const ku = createMockKU({ knowledge_id: 'KU_CONF_001', confidence: 'low' });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].confidence).toBe('low');
  });
});

// ─── TEST 15: Status preservation ──────────────────────────────────────────

describe('TEST 15: Status not modified', () => {
  it('preserves candidate status', () => {
    const ku = createMockKU({ knowledge_id: 'KU_STAT_001', status: 'candidate' });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].status).toBe('candidate');
  });

  it('preserves validated status', () => {
    const ku = createMockKU({ knowledge_id: 'KU_STAT_002', status: 'validated' });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].status).toBe('validated');
  });
});

// ─── TEST 16: retrievalReason preservation ─────────────────────────────────

describe('TEST 16: retrievalReason preserved', () => {
  it('preserves retrieval reason from retrieval result', () => {
    const reason = '语义相似度: 90.0% | 知识等级: 战略模式 | 高可信度';
    const ku = createMockKU({ knowledge_id: 'KU_REASON_001' });
    const response = createMockResponse([createMockResult(ku, 0.9, reason)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].retrievalReason).toBe(reason);
  });
});

// ─── TEST 17: Deterministic Ordering ───────────────────────────────────────

describe('TEST 17: Deterministic ordering', () => {
  it('produces same output for same input on multiple calls', () => {
    const ku1 = createMockKU({ knowledge_id: 'KU_DET_001' });
    const ku2 = createMockKU({ knowledge_id: 'KU_DET_002' });
    const response = createMockResponse([
      createMockResult(ku1, 0.85),
      createMockResult(ku2, 0.75),
    ]);

    const context1 = buildKnowledgeContext(response);
    const context2 = buildKnowledgeContext(response);

    expect(context1.primaryKnowledge[0].knowledgeId).toBe(context2.primaryKnowledge[0].knowledgeId);
    expect(context1.primaryKnowledge[1].knowledgeId).toBe(context2.primaryKnowledge[1].knowledgeId);
    expect(context1.selectedCount).toBe(context2.selectedCount);
  });

  it('does not use random logic', () => {
    const ku = createMockKU({ knowledge_id: 'KU_RND_001' });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    // Run 10 times — should be identical (except timestamps)
    const results = Array.from({ length: 10 }, () => buildKnowledgeContext(response));

    for (let i = 1; i < results.length; i++) {
      expect(results[i].selectedCount).toBe(results[0].selectedCount);
      expect(results[i].primaryKnowledge[0].knowledgeId).toBe(
        results[0].primaryKnowledge[0].knowledgeId
      );
      expect(results[i].primaryKnowledge[0].similarity).toBe(
        results[0].primaryKnowledge[0].similarity
      );
    }
  });
});

// ─── TEST 18: Tie-breaker ──────────────────────────────────────────────────

describe('TEST 18: Tie-breaker for identical scores', () => {
  it('uses knowledgeId as tie-breaker when all scores equal', () => {
    const ku1 = createMockKU({ knowledge_id: 'KU_B' });
    const ku2 = createMockKU({ knowledge_id: 'KU_A' });

    const result1 = createMockResult(ku1, 0.8);
    const result2 = createMockResult(ku2, 0.8);

    const response = createMockResponse([result1, result2]);

    const context = buildKnowledgeContext(response);

    // KU_A should come first (alphabetical)
    expect(context.primaryKnowledge[0].knowledgeId).toBe('KU_A');
    expect(context.primaryKnowledge[1].knowledgeId).toBe('KU_B');
  });
});

// ─── TEST 19: No exception on empty results ────────────────────────────────

describe('TEST 19: No exception on empty results', () => {
  it('does not throw when results is empty', () => {
    const response = createMockResponse([]);

    expect(() => buildKnowledgeContext(response)).not.toThrow();
  });
});

// ─── TEST 20: Candidate not converted to validated ────────────────────────

describe('TEST 20: Candidate never becomes validated', () => {
  it('candidate status is preserved through builder', () => {
    const ku = createMockKU({
      knowledge_id: 'KU_CONV_001',
      status: 'candidate',
      confidence: 'high',
    });
    const response = createMockResponse([createMockResult(ku, 0.95)]);

    const context = buildKnowledgeContext(response);

    // Status must remain candidate
    expect(context.primaryKnowledge[0].status).toBe('candidate');
    expect(context.constraints.hasCandidates).toBe(true);
  });
});

// ─── Additional Tests ──────────────────────────────────────────────────────

describe('Additional: Retrieval metadata preservation', () => {
  it('preserves query', () => {
    const ku = createMockKU();
    const response = createMockResponse([createMockResult(ku, 0.8)], '自定义查询');

    const context = buildKnowledgeContext(response);

    expect(context.query).toBe('自定义查询');
  });

  it('records retrievedCount', () => {
    const kus = Array.from({ length: 5 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_RC_${i}` })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.9 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 3 });

    expect(context.retrieval.retrievedCount).toBe(5);
  });

  it('uses default maxItems from DEFAULT_TOP_K', () => {
    const kus = Array.from({ length: 10 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_DEF_${i}` })
    );
    const results = kus.map((ku) => createMockResult(ku, 0.8));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response);

    expect(context.constraints.maxItems).toBe(5); // DEFAULT_TOP_K
    expect(context.selectedCount).toBe(5);
  });
});

describe('Additional: evidenceCount mapping', () => {
  it('maps evidence items count', () => {
    const ku = createMockKU({
      knowledge_id: 'KU_EVC_001',
      evidence: {
        items: [
          createMockEvidence({ evidence_id: 'EV_001' }),
          createMockEvidence({ evidence_id: 'EV_002' }),
          createMockEvidence({ evidence_id: 'EV_003' }),
        ],
        unique_content_count: 3,
      },
    });
    const response = createMockResponse([createMockResult(ku, 0.85)]);

    const context = buildKnowledgeContext(response);

    expect(context.primaryKnowledge[0].evidenceCount).toBe(3);
  });
});

describe('Additional: Metadata format', () => {
  it('createdAt is valid ISO 8601', () => {
    const ku = createMockKU();
    const response = createMockResponse([createMockResult(ku, 0.8)]);

    const context = buildKnowledgeContext(response);

    expect(context.metadata.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(context.metadata.version).toBe('1.0.0');
    expect(context.metadata.source).toBe('p0.3.7');
  });
});

// ─── P0.3.7.3.1: wasTruncated Boundary Tests ─────────────────────────────────

describe('P0.3.7.3.1 Fix: wasTruncated semantics', () => {
  // Case A: Normal maxItems truncation
  it('Case A: wasTruncated=true when maxItems truncates eligible items', () => {
    const kus = Array.from({ length: 5 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_A_${String(i + 1).padStart(2, '0')}` })
    );
    const results = kus.map((ku) => createMockResult(ku, 0.8));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 3 });

    // 5 validated eligible items, maxItems=3
    // filteredItems=5, selectedCount=3 → wasTruncated=true
    expect(context.selectedCount).toBe(3);
    expect(context.constraints.wasTruncated).toBe(true);
  });

  // Case B: Candidate presence should NOT cause wasTruncated
  it('Case B: candidate presence does not cause wasTruncated when maxItems not exceeded', () => {
    const kuValidated1 = createMockKU({ knowledge_id: 'KU_V_01', status: 'validated' });
    const kuValidated2 = createMockKU({ knowledge_id: 'KU_V_02', status: 'validated' });
    const kuValidated3 = createMockKU({ knowledge_id: 'KU_V_03', status: 'validated' });
    const kuCandidate1 = createMockKU({ knowledge_id: 'KU_C_01', status: 'candidate', confidence: 'medium' });
    const kuCandidate2 = createMockKU({ knowledge_id: 'KU_C_02', status: 'candidate', confidence: 'medium' });

    const response = createMockResponse([
      createMockResult(kuValidated1, 0.95),
      createMockResult(kuValidated2, 0.9),
      createMockResult(kuValidated3, 0.85),
      createMockResult(kuCandidate1, 0.8),
      createMockResult(kuCandidate2, 0.75),
    ]);

    const context = buildKnowledgeContext(response, { maxItems: 5 });

    // All 5 items fit (includeCandidates=true since candidates present)
    // filteredItems=5, selectedCount=5 → wasTruncated=FALSE
    expect(context.selectedCount).toBe(5);
    expect(context.constraints.wasTruncated).toBe(false);
    expect(context.constraints.hasCandidates).toBe(true);
  });

  // Case B-variant: Mixed with truncation only from maxItems
  it('Case B-variant: wasTruncated=true only when maxItems causes truncation, not candidate presence', () => {
    const kus = Array.from({ length: 7 }, (_, i) =>
      createMockKU({
        knowledge_id: `KU_MIX_${String(i + 1).padStart(2, '0')}`,
        status: i < 3 ? 'candidate' as const : 'validated' as const,
        confidence: i < 3 ? 'medium' as const : 'high' as const,
      })
    );
    const results = kus.map((ku, i) => createMockResult(ku, 0.95 - i * 0.05));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response, { maxItems: 4 });

    // 7 total (3 candidate + 4 validated), includeCandidates=true → filteredItems=7
    // maxItems=4 → selectedCount=4
    // wasTruncated=true because maxItems truncated, NOT because of candidates
    expect(context.selectedCount).toBe(4);
    expect(context.constraints.wasTruncated).toBe(true);
  });

  // Case C: No truncation when all eligible items fit within maxItems
  it('Case C: wasTruncated=false when all eligible items fit within maxItems', () => {
    const ku1 = createMockKU({ knowledge_id: 'KU_C_01' });
    const ku2 = createMockKU({ knowledge_id: 'KU_C_02' });
    const ku3 = createMockKU({ knowledge_id: 'KU_C_03' });

    const response = createMockResponse([
      createMockResult(ku1, 0.9),
      createMockResult(ku2, 0.85),
      createMockResult(ku3, 0.8),
    ]);

    const context = buildKnowledgeContext(response, { maxItems: 5 });

    // 3 eligible items, maxItems=5
    // filteredItems=3, selectedCount=3 → wasTruncated=FALSE
    expect(context.selectedCount).toBe(3);
    expect(context.constraints.wasTruncated).toBe(false);
  });

  // Regression: Full results, no filtering, maxItems = default (5), results = 10
  it('Regression: 10 validated + default maxItems(5) → wasTruncated=true', () => {
    const kus = Array.from({ length: 10 }, (_, i) =>
      createMockKU({ knowledge_id: `KU_REG_${String(i + 1).padStart(2, '0')}` })
    );
    const results = kus.map((ku) => createMockResult(ku, 0.8));
    const response = createMockResponse(results);

    const context = buildKnowledgeContext(response);

    // 10 validated, default maxItems=5
    // filteredItems=10, selectedCount=5 → wasTruncated=true
    expect(context.selectedCount).toBe(5);
    expect(context.constraints.wasTruncated).toBe(true);
    expect(context.constraints.maxItems).toBe(5);
  });
});
