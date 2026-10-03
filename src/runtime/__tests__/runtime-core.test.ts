/**
 * P0.7.1 — Runtime Core Unit Tests
 *
 * Tests for runContextOS() orchestrator and helper functions.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runContextOS,
  createRuntimeRunId,
} from '../runtime-core';
import type { ContextOSRuntimeFullDependencies } from '../runtime-core';
import {
  ContextOSRuntimeError,
  RuntimeValidationError,
} from '../runtime-types';
import type { ContextOSRuntimeRequest } from '../runtime-types';
import type { ContextObject } from '@/context/context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const FIXED_TIMESTAMP = '2026-10-03T12:00:00.000Z';

function createMockContext(id: string, kind: string = 'memory'): ContextObject {
  return {
    id,
    kind: kind as ContextObject['kind'],
    type: 'static' as ContextObject['type'],
    content: { text: `Context ${id}` },
    confidence: 0.8,
    importance: 0.5,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    provenance: {
      source: 'test',
      sourceType: 'memory',
      ownerId: 'user_1',
    },
  };
}

function createMockDependencies(
  contexts: ContextObject[] = [],
  options: { failRetrieve?: boolean; failAssembly?: boolean } = {}
): ContextOSRuntimeFullDependencies {
  return {
    retrieveContext: vi.fn().mockImplementation(async () => {
      if (options.failRetrieve) throw new Error('Retrieval failed');
      return contexts;
    }),
    assembleContext: vi.fn().mockImplementation(async (ctxs) => {
      if (options.failAssembly) throw new Error('Assembly failed');
      return {
        contexts: ctxs,
        serialized: 'serialized context package',
        tokenEstimate: 100,
        contextIds: ctxs.map((c) => c.id),
        provenance: ctxs.map((c) => c.provenance),
        generatedAt: FIXED_TIMESTAMP,
      };
    }),
    now: () => FIXED_TIMESTAMP,
  };
}

function createMinimalRequest(overrides: Partial<ContextOSRuntimeRequest> = {}): ContextOSRuntimeRequest {
  return {
    ownerId: 'user_1',
    purpose: 'test_purpose',
    input: { query: 'test' },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Category A: runContextOS — Successful Execution
// ═══════════════════════════════════════════════════════════════════════════════

describe('runContextOS', () => {
  describe('A: Successful Execution', () => {
    it('A1: should create run and return result with completed status', async () => {
      const deps = createMockDependencies([createMockContext('ctx_1')]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);

      expect(result.run.status).toBe('completed');
      expect(result.contextPackage.contexts).toHaveLength(1);
      expect(result.contextPackage.contextIds).toEqual(['ctx_1']);
    });

    it('A2: should set correct run ID format', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);

      expect(result.run.id).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
    });

    it('A3: should propagate owner/project/topic from request to run', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest({
        ownerId: 'owner_abc',
        projectId: 'proj_xyz',
        topicId: 'topic_123',
      });

      const result = await runContextOS(request, deps);

      expect(result.run.ownerId).toBe('owner_abc');
      expect(result.run.projectId).toBe('proj_xyz');
      expect(result.run.topicId).toBe('topic_123');
    });

    it('A4: should set startedAt and completedAt timestamps', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);

      expect(result.run.startedAt).toBe(FIXED_TIMESTAMP);
      expect(result.run.completedAt).toBe(FIXED_TIMESTAMP);
    });

    it('A5: should return contexts and serialized package', async () => {
      const ctx1 = createMockContext('ctx_1', 'knowledge');
      const ctx2 = createMockContext('ctx_2', 'memory');
      const deps = createMockDependencies([ctx1, ctx2]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);

      expect(result.contextPackage.contexts).toHaveLength(2);
      expect(result.contextPackage.serialized).toBe('serialized context package');
      expect(result.contextPackage.tokenEstimate).toBe(100);
    });

    it('A6: should handle empty context list gracefully', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest();

      const result = await runContextOS(request, deps);

      expect(result.run.status).toBe('completed');
      expect(result.contextPackage.contexts).toHaveLength(0);
      expect(result.contextPackage.contextIds).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category B: runContextOS — Validation Errors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('B: Validation Errors', () => {
    it('B1: should throw RuntimeValidationError when ownerId is empty', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest({ ownerId: '' });

      await expect(runContextOS(request, deps)).rejects.toThrow(RuntimeValidationError);
      await expect(runContextOS(request, deps)).rejects.toThrow('ownerId is required');
    });

    it('B2: should throw RuntimeValidationError when purpose is missing', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest({ purpose: '' });

      await expect(runContextOS(request, deps)).rejects.toThrow(RuntimeValidationError);
      await expect(runContextOS(request, deps)).rejects.toThrow('purpose is required');
    });

    it('B3: should throw RuntimeValidationError when ownerId is whitespace', async () => {
      const deps = createMockDependencies([]);
      const request = createMinimalRequest({ ownerId: '   ' });

      await expect(runContextOS(request, deps)).rejects.toThrow(RuntimeValidationError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category C: runContextOS — Error Handling
  // ═══════════════════════════════════════════════════════════════════════════

  describe('C: Error Handling', () => {
    it('C1: should throw ContextOSRuntimeError when retrieval fails', async () => {
      const deps = createMockDependencies([], { failRetrieve: true });
      const request = createMinimalRequest();

      await expect(runContextOS(request, deps)).rejects.toThrow(ContextOSRuntimeError);
    });

    it('C2: should include run ID in error when assembly fails', async () => {
      const deps = createMockDependencies([createMockContext('ctx_1')], {
        failAssembly: true,
      });
      const request = createMinimalRequest();

      let caughtError: ContextOSRuntimeError | undefined;
      try {
        await runContextOS(request, deps);
      } catch (e) {
        caughtError = e as ContextOSRuntimeError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError!.requestId).toBe(`run_user_1_${FIXED_TIMESTAMP}`);
    });

    it('C3: should use error message from underlying error', async () => {
      const deps = createMockDependencies([], { failRetrieve: true });
      const request = createMinimalRequest();

      await expect(runContextOS(request, deps)).rejects.toThrow('Retrieval failed');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Category D: Dependency Delegation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('D: Dependency Delegation', () => {
    it('D1: should call retrieveContext with the request', async () => {
      const deps = createMockDependencies([createMockContext('ctx_1')]);
      const request = createMinimalRequest({ ownerId: 'user_special' });

      await runContextOS(request, deps);

      expect(deps.retrieveContext).toHaveBeenCalledWith(request);
    });

    it('D2: should call assembleContext with contexts, policy, and purpose', async () => {
      const ctx = createMockContext('ctx_1');
      const deps = createMockDependencies([ctx]);
      const request = createMinimalRequest({
        purpose: 'writing_content',
        contextPolicy: { maxTokens: 4000, maxContexts: 20 },
      });

      await runContextOS(request, deps);

      expect(deps.assembleContext).toHaveBeenCalledWith(
        [ctx],
        { maxTokens: 4000, maxContexts: 20 },
        'writing_content'
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Category E: createRuntimeRunId
// ═══════════════════════════════════════════════════════════════════════════════

describe('createRuntimeRunId', () => {
  it('E1: should produce deterministic IDs', () => {
    const id1 = createRuntimeRunId('user_1', '2026-10-03T00:00:00Z');
    const id2 = createRuntimeRunId('user_1', '2026-10-03T00:00:00Z');
    expect(id1).toBe(id2);
  });

  it('E2: should include ownerId and timestamp', () => {
    const id = createRuntimeRunId('owner_xyz', '2026-10-03T00:00:00Z');
    expect(id).toBe('run_owner_xyz_2026-10-03T00:00:00Z');
  });

  it('E3: should produce different IDs for different owners', () => {
    const id1 = createRuntimeRunId('user_a', '2026-10-03T00:00:00Z');
    const id2 = createRuntimeRunId('user_b', '2026-10-03T00:00:00Z');
    expect(id1).not.toBe(id2);
  });

  it('E4: should not contain UUID or random components', () => {
    const id = createRuntimeRunId('user_1', '2026-10-03T00:00:00Z');
    expect(id).toMatch(/^run_user_1_2026-10-03T00:00:00Z$/);
  });
});
