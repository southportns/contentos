/**
 * P0.6.5.5-R2 — Decision Memory Retrieval Tests (Exact ID)
 *
 * Tests for getDecisionById() using MemoryRetriever exact-id lookup.
 *
 * Test Categories:
 *   ID. Exact ID Retrieval
 *   R-ID. Generic Retriever ID (InMemoryRetriever)
 */

import { describe, it, expect, vi } from 'vitest';
import { InMemoryRetriever } from '../memory-retriever';
import { createDecisionMemory } from '../decision-memory-factory';
import type { DecisionMemory } from '../decision-memory';
import type { MemoryRetriever } from '../memory-retriever';
import type { MemoryRetrievalRequest } from '../memory-retriever';
import {
  getDecisionById,
} from '../decision-memory-retrieval';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createTestDecision(opts: {
  id: string;
  ownerId: string;
  decisionStatus?: 'proposed' | 'active' | 'superseded' | 'reversed';
  projectId?: string | null;
  topicId?: string | null;
}): DecisionMemory {
  return createDecisionMemory({
    id: opts.id,
    ownerId: opts.ownerId,
    decision: `Test decision ${opts.id}`,
    decisionStatus: opts.decisionStatus ?? 'active',
    projectId: opts.projectId ?? null,
    topicId: opts.topicId ?? null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ID. Exact ID Retrieval
// ═══════════════════════════════════════════════════════════════════════════════

describe('ID. Exact ID Retrieval', () => {
  // ID-1: Multiple decisions, getDecisionById returns only the target
  it('ID-1: should return only the target decision when multiple exist', async () => {
    const d1 = createTestDecision({ id: 'D1', ownerId: 'user-1' });
    const d2 = createTestDecision({ id: 'D2', ownerId: 'user-1' });
    const d3 = createTestDecision({ id: 'D3', ownerId: 'user-1' });

    const retriever = new InMemoryRetriever([d1, d2, d3]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'D2',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('D2');
  });

  // ID-2: maxResults=1 — verify mock retriever receives request with maxResults=1
  it('ID-2: should pass maxResults=1 in the retrieval request', async () => {
    const mockRetrieve = vi.fn().mockResolvedValue([]);
    const mockRetriever: MemoryRetriever = { retrieve: mockRetrieve };

    await getDecisionById(mockRetriever, {
      ownerId: 'user-1',
      decisionId: 'dec-target',
    });

    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    const request = mockRetrieve.mock.calls[0][0] as MemoryRetrievalRequest;
    expect(request.policy?.maxResults).toBe(1);
  });

  // ID-3: request contains id and types=['decision']
  it('ID-3: should pass id and types=[decision] in the request', async () => {
    const mockRetrieve = vi.fn().mockResolvedValue([]);
    const mockRetriever: MemoryRetriever = { retrieve: mockRetrieve };

    await getDecisionById(mockRetriever, {
      ownerId: 'user-1',
      decisionId: 'dec-specific-id',
    });

    const request = mockRetrieve.mock.calls[0][0] as MemoryRetrievalRequest;
    expect(request.id).toBe('dec-specific-id');
    expect(request.policy?.types).toEqual(['decision']);
  });

  // ID-4: Wrong owner returns null
  it('ID-4: should return null when decision belongs to different owner', async () => {
    const d1 = createTestDecision({ id: 'dec-1', ownerId: 'user-2' });
    const retriever = new InMemoryRetriever([d1]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
    });

    expect(result).toBeNull();
  });

  // ID-5: Superseded decision can be retrieved by ID
  it('ID-5: should retrieve a superseded decision', async () => {
    const d1 = createTestDecision({ id: 'dec-sup', ownerId: 'user-1', decisionStatus: 'superseded' });
    const retriever = new InMemoryRetriever([d1]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-sup',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('dec-sup');
    expect(result!.payload.decisionStatus).toBe('superseded');
  });

  // ID-6: Reversed decision can be retrieved by ID
  it('ID-6: should retrieve a reversed decision', async () => {
    const d1 = createTestDecision({ id: 'dec-rev', ownerId: 'user-1', decisionStatus: 'reversed' });
    const retriever = new InMemoryRetriever([d1]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-rev',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('dec-rev');
    expect(result!.payload.decisionStatus).toBe('reversed');
  });

  // ID-7: Project mismatch returns null
  it('ID-7: should return null when projectId does not match decision project', async () => {
    const d1 = createTestDecision({ id: 'dec-1', ownerId: 'user-1', projectId: 'proj-A' });
    const retriever = new InMemoryRetriever([d1]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-B',
    });

    expect(result).toBeNull();
  });

  // ID-8: Topic mismatch returns null
  it('ID-8: should return null when topicId does not match decision topic', async () => {
    const d1 = createTestDecision({
      id: 'dec-1',
      ownerId: 'user-1',
      projectId: 'proj-A',
      topicId: 'topic-X',
    });
    const retriever = new InMemoryRetriever([d1]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'dec-1',
      projectId: 'proj-A',
      topicId: 'topic-Y',
    });

    expect(result).toBeNull();
  });

  // ID-9: Large dataset — exact-id query still efficient (target found among 1000+ records)
  it('ID-9: should find target decision among 1000+ unrelated records', async () => {
    const target = createTestDecision({ id: 'TARGET', ownerId: 'user-1' });

    // Generate 1000 unrelated decision records
    const unrelated: DecisionMemory[] = [];
    for (let i = 0; i < 1000; i++) {
      unrelated.push(createTestDecision({
        id: `dec-noise-${i}`,
        ownerId: 'user-1',
      }));
    }

    const retriever = new InMemoryRetriever([target, ...unrelated]);

    const result = await getDecisionById(retriever, {
      ownerId: 'user-1',
      decisionId: 'TARGET',
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('TARGET');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// R-ID. Generic Retriever ID (InMemoryRetriever)
// ═══════════════════════════════════════════════════════════════════════════════

describe('R-ID. Generic Retriever ID', () => {
  // R-ID-1: exact ID match
  it('R-ID-1: should return only the record matching the exact ID', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({ id: 'd1', ownerId: 'user-1' }),
      createTestDecision({ id: 'd2', ownerId: 'user-1' }),
      createTestDecision({ id: 'd3', ownerId: 'user-1' }),
    ]);

    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'd2',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d2');
  });

  // R-ID-2: wrong ID returns empty
  it('R-ID-2: should return empty when ID does not exist', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({ id: 'd1', ownerId: 'user-1' }),
    ]);

    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'nonexistent',
    });

    expect(result).toHaveLength(0);
  });

  // R-ID-3: ID + owner isolation
  it('R-ID-3: should respect owner isolation even when ID exists for other owner', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({ id: 'dec-1', ownerId: 'user-2' }),
    ]);

    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-1',
    });

    expect(result).toHaveLength(0);
  });

  // R-ID-4: ID + project scope
  it('R-ID-4: should filter by ID and project scope together', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({ id: 'dec-1', ownerId: 'user-1', projectId: 'proj-A' }),
      createTestDecision({ id: 'dec-2', ownerId: 'user-1', projectId: 'proj-B' }),
    ]);

    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-1',
      projectId: 'proj-A',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dec-1');
  });

  // R-ID-5: ID + topic scope
  it('R-ID-5: should filter by ID and topic scope together', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({
        id: 'dec-1',
        ownerId: 'user-1',
        projectId: 'proj-A',
        topicId: 'topic-X',
      }),
    ]);

    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-1',
      projectId: 'proj-A',
      topicId: 'topic-Y',
    });

    // Should be empty (topic mismatch)
    expect(result).toHaveLength(0);
  });

  // R-ID-6: ID + type filtering
  it('R-ID-6: should filter by ID and type together', async () => {
    const retriever = new InMemoryRetriever();
    // Add a decision
    retriever.addRecords([
      createTestDecision({ id: 'dec-1', ownerId: 'user-1' }),
    ]);

    // Request with id + types that doesn't include 'decision'
    const result = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-1',
      policy: {
        types: ['outcome'],
      },
    });

    // Should be empty because type filter excludes 'decision'
    expect(result).toHaveLength(0);
  });

  // R-ID-7: ID + historical status (superseded/reversed accessible)
  it('R-ID-7: should return decisions with historical status (superseded)', async () => {
    const retriever = new InMemoryRetriever();
    retriever.addRecords([
      createTestDecision({ id: 'dec-sup', ownerId: 'user-1', decisionStatus: 'superseded' }),
    ]);

    // Default policy (no includeSuperseded)
    const resultDefault = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-sup',
    });
    // Default excludes superseded
    expect(resultDefault).toHaveLength(0);

    // With includeSuperseded
    const resultHistorical = await retriever.retrieve({
      ownerId: 'user-1',
      id: 'dec-sup',
      policy: {
        includeSuperseded: true,
        includeArchived: true,
      },
    });
    expect(resultHistorical).toHaveLength(1);
    expect(resultHistorical[0].id).toBe('dec-sup');
  });
});
