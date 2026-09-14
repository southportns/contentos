/**
 * P0.3.7.4 — Knowledge Context Serializer Tests
 *
 * Tests the serialization pipeline:
 *   KnowledgeContext → Serializer → Prompt-ready text
 *
 * Covers:
 *   - Basic serialization (single validated item)
 *   - Multiple items
 *   - Candidate status preserved
 *   - Mixed validated + candidate ordering
 *   - wasTruncated true / false pass-through
 *   - Empty context
 *   - Nullish / empty fields
 *   - Input immutability
 *   - Determinism
 *   - Ordering preservation
 *   - Content fidelity (including long text)
 *   - Low-noise: no retrieval internals leaked
 *   - Primary / Supporting role distinction
 */

import { describe, it, expect } from 'vitest';
import type {
  KnowledgeContext,
  KnowledgeContextItem,
} from '../knowledge-context-types';
import { serializeKnowledgeContext } from '../knowledge-context-serializer';

// ─── Test Fixtures ─────────────────────────────────────────────────────────

function createMockItem(
  overrides: Partial<KnowledgeContextItem> = {}
): KnowledgeContextItem {
  return {
    knowledgeId: 'KU_TEST_001',
    name: '测试知识单元',
    text: '这是知识单元的原文内容，包含核心模式描述。',
    category: 'cognition',
    knowledgeLevel: 'strategic_pattern',
    confidence: 'high',
    status: 'validated',
    similarity: 0.91,
    retrievalReason: '语义相似度: 91.0%',
    evidenceCount: 4,
    ...overrides,
  };
}

function createMockContext(
  overrides: Partial<KnowledgeContext> = {}
): KnowledgeContext {
  const primaryKnowledge = overrides.primaryKnowledge ?? [createMockItem()];
  const supportingKnowledge = overrides.supportingKnowledge ?? [];
  return {
    query: '测试查询',
    retrieval: {
      method: 'semantic',
      threshold: 0.35,
      topK: 5,
      includeCandidates: false,
      retrievedCount: 1,
    },
    selectedCount: primaryKnowledge.length + supportingKnowledge.length,
    primaryKnowledge,
    supportingKnowledge,
    evidence: [],
    constraints: {
      hasCandidates: false,
      maxItems: 5,
      wasTruncated: false,
    },
    metadata: {
      version: '1.0.0',
      createdAt: '2026-09-14T00:00:00.000Z',
      source: 'p0.3.7',
    },
    ...overrides,
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─── TEST 01: Basic Serialization ─────────────────────────────────────────

describe('TEST 01: Basic serialization — single validated item', () => {
  it('serializes one validated item with all core fields', () => {
    const context = createMockContext();
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('## Knowledge Context');
    expect(output).toContain('### Primary Knowledge 1: 测试知识单元');
    expect(output).toContain('Status: validated');
    expect(output).toContain('Confidence: high');
    expect(output).toContain('Similarity: 0.91');
    expect(output).toContain('Evidence Count: 4');
    expect(output).toContain('Content:');
    expect(output).toContain('这是知识单元的原文内容，包含核心模式描述。');
  });
});

// ─── TEST 02: Multiple Items ──────────────────────────────────────────────

describe('TEST 02: Multiple items — all emitted in input order', () => {
  it('serializes all items without loss and preserves order', () => {
    const items = [
      createMockItem({ knowledgeId: 'KU_A', name: '知识A', similarity: 0.95 }),
      createMockItem({ knowledgeId: 'KU_B', name: '知识B', similarity: 0.88 }),
      createMockItem({ knowledgeId: 'KU_C', name: '知识C', similarity: 0.80 }),
    ];
    const context = createMockContext({ primaryKnowledge: items });
    const output = serializeKnowledgeContext(context);

    const idxA = output.indexOf('知识A');
    const idxB = output.indexOf('知识B');
    const idxC = output.indexOf('知识C');

    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(-1);
    expect(idxC).toBeGreaterThan(-1);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
    expect(output).toContain('### Primary Knowledge 3: 知识C');
  });
});

// ─── TEST 03: Candidate Status ────────────────────────────────────────────

describe('TEST 03: Candidate status preserved', () => {
  it('outputs Status: candidate without conversion', () => {
    const item = createMockItem({ status: 'candidate', confidence: 'medium' });
    const context = createMockContext({
      primaryKnowledge: [item],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: false },
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('Status: candidate');
    expect(output).not.toContain('Status: validated');
  });
});

// ─── TEST 04: Mixed Validated + Candidate ─────────────────────────────────

describe('TEST 04: Mixed validated + candidate', () => {
  it('keeps each item status correct and order unchanged', () => {
    const items = [
      createMockItem({ knowledgeId: 'KU_V1', name: '已验证一', status: 'validated' }),
      createMockItem({ knowledgeId: 'KU_C1', name: '候选一', status: 'candidate' }),
      createMockItem({ knowledgeId: 'KU_V2', name: '已验证二', status: 'validated' }),
    ];
    const context = createMockContext({
      primaryKnowledge: items,
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: false },
    });
    const output = serializeKnowledgeContext(context);

    const validatedCount = (output.match(/Status: validated/g) ?? []).length;
    const candidateCount = (output.match(/Status: candidate/g) ?? []).length;
    expect(validatedCount).toBe(2);
    expect(candidateCount).toBe(1);

    // Order: 已验证一 → 候选一 → 已验证二
    expect(output.indexOf('已验证一')).toBeLessThan(output.indexOf('候选一'));
    expect(output.indexOf('候选一')).toBeLessThan(output.indexOf('已验证二'));
  });
});

// ─── TEST 05: wasTruncated = true ─────────────────────────────────────────

describe('TEST 05: wasTruncated = true pass-through', () => {
  it('explicitly outputs Was Truncated: true with stable note', () => {
    const context = createMockContext({
      constraints: { hasCandidates: false, maxItems: 3, wasTruncated: true },
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('Was Truncated: true');
    expect(output).toContain(
      'Note: Retrieval results were truncated according to maxItems.'
    );
  });

  it('does not recompute wasTruncated from item counts', () => {
    // 5 items, maxItems 5 — if serializer recomputed, it would say false.
    // Contract says true → must output true.
    const items = Array.from({ length: 5 }, (_, i) =>
      createMockItem({ knowledgeId: `KU_${i}`, name: `知识${i}` })
    );
    const context = createMockContext({
      primaryKnowledge: items,
      constraints: { hasCandidates: false, maxItems: 5, wasTruncated: true },
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('Was Truncated: true');
  });
});

// ─── TEST 06: wasTruncated = false ────────────────────────────────────────

describe('TEST 06: wasTruncated = false pass-through', () => {
  it('outputs Was Truncated: false and no truncation note', () => {
    const context = createMockContext();
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('Was Truncated: false');
    expect(output).not.toContain('truncated according to maxItems');
  });
});

// ─── TEST 07: Empty Context ───────────────────────────────────────────────

describe('TEST 07: Empty context', () => {
  it('returns stable placeholder without exception', () => {
    const context = createMockContext({
      primaryKnowledge: [],
      supportingKnowledge: [],
      selectedCount: 0,
    });

    let output = '';
    expect(() => {
      output = serializeKnowledgeContext(context);
    }).not.toThrow();

    expect(output).toContain('## Knowledge Context');
    expect(output).toContain('No relevant knowledge was retrieved.');
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('null');
  });

  it('empty context output is deterministic', () => {
    const context = createMockContext({
      primaryKnowledge: [],
      supportingKnowledge: [],
      selectedCount: 0,
    });
    expect(serializeKnowledgeContext(context)).toBe(
      serializeKnowledgeContext(context)
    );
  });
});

// ─── TEST 08: Nullish / Empty Fields ──────────────────────────────────────

describe('TEST 08: Nullish and empty fields do not pollute output', () => {
  it('omits empty-string fields and never prints undefined/null', () => {
    const item = createMockItem({
      name: '',
      text: '',
    });
    // Simulate boundary data with missing optional-ish values via cast
    const boundaryItem = {
      ...item,
      similarity: Number.NaN,
      evidenceCount: Number.NaN,
    } as KnowledgeContextItem;

    const context = createMockContext({ primaryKnowledge: [boundaryItem] });
    const output = serializeKnowledgeContext(context);

    expect(output).not.toContain('undefined');
    expect(output).not.toContain('null');
    expect(output).not.toContain('NaN');
    expect(output).not.toContain('Similarity:');
    expect(output).not.toContain('Evidence Count:');
    // Empty name → heading without trailing colon/name
    expect(output).toContain('### Primary Knowledge 1\n');
    // Empty text → Content section omitted
    expect(output).not.toContain('Content:');
    // Status/confidence/category still present
    expect(output).toContain('Status: validated');
  });
});

// ─── TEST 09: Input Immutability ──────────────────────────────────────────

describe('TEST 09: Input immutability', () => {
  it('does not mutate the input context', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ knowledgeId: 'KU_B', name: 'B', similarity: 0.7 }),
        createMockItem({ knowledgeId: 'KU_A', name: 'A', similarity: 0.9 }),
      ],
      supportingKnowledge: [
        createMockItem({ knowledgeId: 'KU_C', name: 'C', status: 'candidate' }),
      ],
    });
    const before = deepClone(context);

    serializeKnowledgeContext(context);

    expect(context).toEqual(before);
  });
});

// ─── TEST 10: Determinism ─────────────────────────────────────────────────

describe('TEST 10: Determinism', () => {
  it('identical input produces identical output across calls', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ knowledgeId: 'KU_1', name: '一' }),
        createMockItem({ knowledgeId: 'KU_2', name: '二', status: 'candidate' }),
      ],
      supportingKnowledge: [createMockItem({ knowledgeId: 'KU_3', name: '三' })],
      constraints: { hasCandidates: true, maxItems: 5, wasTruncated: true },
    });

    const output1 = serializeKnowledgeContext(context);
    const output2 = serializeKnowledgeContext(context);

    expect(output1).toBe(output2);
  });
});

// ─── TEST 11: Ordering Preservation ───────────────────────────────────────

describe('TEST 11: Ordering preservation — no re-sorting', () => {
  it('keeps Builder order even when similarity is ascending', () => {
    // Builder order intentionally has lower similarity first.
    // Serializer must NOT re-sort by similarity.
    const items = [
      createMockItem({ knowledgeId: 'KU_LOW', name: '低相似度', similarity: 0.40 }),
      createMockItem({ knowledgeId: 'KU_HIGH', name: '高相似度', similarity: 0.99 }),
    ];
    const context = createMockContext({ primaryKnowledge: items });
    const output = serializeKnowledgeContext(context);

    expect(output.indexOf('低相似度')).toBeLessThan(output.indexOf('高相似度'));
  });

  it('serializes primary group before supporting group', () => {
    const context = createMockContext({
      primaryKnowledge: [createMockItem({ name: '主知识' })],
      supportingKnowledge: [
        createMockItem({ name: '辅助知识', status: 'candidate' }),
      ],
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('### Primary Knowledge 1: 主知识');
    expect(output).toContain('### Supporting Knowledge 1: 辅助知识');
    expect(output.indexOf('主知识')).toBeLessThan(output.indexOf('辅助知识'));
  });
});

// ─── TEST 12: Content Fidelity ────────────────────────────────────────────

describe('TEST 12: Content fidelity', () => {
  it('preserves knowledge text verbatim, including long text', () => {
    const longText =
      '这是一个非常长的知识内容。'.repeat(200) +
      '\n包含换行、特殊字符 <>&"\' 以及中文标点，。！？';
    const item = createMockItem({ text: longText });
    const context = createMockContext({ primaryKnowledge: [item] });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain(longText);
  });

  it('does not truncate or rewrite content', () => {
    const text = '开头内容 中间内容 结尾内容';
    const context = createMockContext({
      primaryKnowledge: [createMockItem({ text })],
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain(text);
  });
});

// ─── TEST 13: Low-Noise — No Retrieval Internals ──────────────────────────

describe('TEST 13: Low-noise output — no retrieval internals leaked', () => {
  it('does not expose internal IDs, timestamps, or retrieval parameters', () => {
    const context = createMockContext();
    const output = serializeKnowledgeContext(context);

    // Traceability/internal identifiers are not prompt content
    expect(output).not.toContain('KU_TEST_001');
    // Retrieval metadata internals
    expect(output).not.toContain('threshold');
    expect(output).not.toContain('topK');
    expect(output).not.toContain('0.35');
    // Contract metadata
    expect(output).not.toContain('1.0.0');
    expect(output).not.toContain('2026-09-14');
    expect(output).not.toContain('p0.3.7');
    // Retrieval reason (retrieval debug detail)
    expect(output).not.toContain('语义相似度');
  });
});

// ─── TEST 14: Retrieval Metadata Block ────────────────────────────────────

describe('TEST 14: Retrieval metadata block', () => {
  it('outputs Items / Max Items / Was Truncated', () => {
    const context = createMockContext({
      primaryKnowledge: [
        createMockItem({ knowledgeId: 'KU_1' }),
        createMockItem({ knowledgeId: 'KU_2' }),
      ],
      selectedCount: 2,
      constraints: { hasCandidates: false, maxItems: 5, wasTruncated: false },
    });
    const output = serializeKnowledgeContext(context);

    expect(output).toContain('### Retrieval Metadata');
    expect(output).toContain('Items: 2');
    expect(output).toContain('Max Items: 5');
    expect(output).toContain('Was Truncated: false');
  });
});
