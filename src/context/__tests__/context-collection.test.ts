/**
 * P0.6.1 — Context Collection Tests
 *
 * Tests for Multi-Context Composition.
 */

import { describe, it, expect } from 'vitest';
import {
  createIdentityContext,
  createIntentContext,
  createStrategyContext,
  createContentContext,
  createEvaluationContext,
} from '../context-factory';
import {
  ContextCollectionBuilder,
  createContextCollection,
  filterByKind,
  filterByType,
  findByKind,
  findByType,
  hasKind,
  hasType,
  getKinds,
  getTypes,
} from '../context-collection';
import { isContextOfKind } from '../context-utils';
import type { ContextObject } from '../context-object';

describe('Context Collection', () => {
  let identityCtx: ContextObject;
  let intentCtx: ContextObject;
  let strategyCtx: ContextObject;
  let contentCtx: ContextObject;
  let evaluationCtx: ContextObject;

  beforeEach(() => {
    identityCtx = createIdentityContext({
      userId: 'user-1',
      projectId: 'proj-1',
    });
    intentCtx = createIntentContext({
      goal: '创作爆款',
      contentType: 'emotional',
    });
    strategyCtx = createStrategyContext({
      topicId: 'topic-1',
      coreThesis: '核心论点',
      approvalStatus: 'approved',
    });
    contentCtx = createContentContext({
      draftId: 'draft-1',
      version: 1,
      status: 'DRAFT',
    });
    evaluationCtx = createEvaluationContext({
      evaluationId: 'eval-1',
      overallScore: 85,
    });
  });

  describe('ContextCollectionBuilder', () => {
    it('should build empty collection', () => {
      const collection = new ContextCollectionBuilder().build();

      expect(collection.size).toBe(0);
      expect(collection.isEmpty).toBe(true);
      expect(collection.contexts).toEqual([]);
    });

    it('should add single context', () => {
      const collection = new ContextCollectionBuilder().add(identityCtx).build();

      expect(collection.size).toBe(1);
      expect(collection.isEmpty).toBe(false);
      expect(collection.contexts[0].id).toBe(identityCtx.id);
    });

    it('should add multiple contexts via addMany', () => {
      const collection = new ContextCollectionBuilder()
        .addMany([identityCtx, intentCtx, strategyCtx])
        .build();

      expect(collection.size).toBe(3);
    });

    it('should preserve insertion order', () => {
      const collection = new ContextCollectionBuilder()
        .add(identityCtx)
        .add(intentCtx)
        .add(strategyCtx)
        .build();

      expect(collection.contexts[0].kind).toBe('identity');
      expect(collection.contexts[1].kind).toBe('intent');
      expect(collection.contexts[2].kind).toBe('strategy');
    });

    it('should support fluent adding', () => {
      const collection = new ContextCollectionBuilder()
        .add(identityCtx)
        .add(intentCtx)
        .add(strategyCtx)
        .add(contentCtx)
        .add(evaluationCtx)
        .build();

      expect(collection.size).toBe(5);
    });
  });

  describe('createContextCollection helper', () => {
    it('should create collection from array', () => {
      const collection = createContextCollection([
        identityCtx,
        intentCtx,
      ]);

      expect(collection.size).toBe(2);
      expect(collection.isEmpty).toBe(false);
    });

    it('should create empty collection from empty array', () => {
      const collection = createContextCollection([]);

      expect(collection.size).toBe(0);
      expect(collection.isEmpty).toBe(true);
    });
  });

  describe('Filtering', () => {
    let collection: ReturnType<typeof createContextCollection>;

    beforeEach(() => {
      collection = createContextCollection([
        identityCtx,
        intentCtx,
        strategyCtx,
        contentCtx,
        evaluationCtx,
      ]);
    });

    it('filterByKind should return contexts of specific kind', () => {
      const results = filterByKind(collection, 'identity');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(identityCtx.id);
    });

    it('filterByKind should return empty when no match', () => {
      const results = filterByKind(collection, 'memory');
      expect(results).toEqual([]);
    });

    it('filterByType should return contexts of specific type', () => {
      const results = filterByType(collection, 'evaluation');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(evaluationCtx.id);
    });

    it('filterByType should return empty when no match', () => {
      const results = filterByType(collection, 'nonexistent');
      expect(results).toEqual([]);
    });

    it('findByKind should return first match', () => {
      const result = findByKind(collection, 'strategy');
      expect(result).toBeDefined();
      expect(result?.id).toBe(strategyCtx.id);
    });

    it('findByKind should return undefined when no match', () => {
      const result = findByKind(collection, 'memory');
      expect(result).toBeUndefined();
    });

    it('findByType should return first match', () => {
      const result = findByType(collection, 'content');
      expect(result).toBeDefined();
      expect(result?.id).toBe(contentCtx.id);
    });

    it('findByType should return undefined when no match', () => {
      const result = findByType(collection, 'nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('Existence Checks', () => {
    let collection: ReturnType<typeof createContextCollection>;

    beforeEach(() => {
      collection = createContextCollection([
        identityCtx,
        intentCtx,
        strategyCtx,
      ]);
    });

    it('hasKind should return true for existing kind', () => {
      expect(hasKind(collection, 'identity')).toBe(true);
      expect(hasKind(collection, 'intent')).toBe(true);
      expect(hasKind(collection, 'strategy')).toBe(true);
    });

    it('hasKind should return false for missing kind', () => {
      expect(hasKind(collection, 'memory')).toBe(false);
      expect(hasKind(collection, 'outcome')).toBe(false);
    });

    it('hasType should return true for existing type', () => {
      expect(hasType(collection, 'identity')).toBe(true);
      expect(hasType(collection, 'intent')).toBe(true);
      expect(hasType(collection, 'strategy')).toBe(true);
    });

    it('hasType should return false for missing type', () => {
      expect(hasType(collection, 'draft')).toBe(false);
      expect(hasType(collection, 'evaluation')).toBe(false);
    });
  });

  describe('Aggregation', () => {
    let collection: ReturnType<typeof createContextCollection>;

    beforeEach(() => {
      collection = createContextCollection([
        identityCtx,
        intentCtx,
        strategyCtx,
        contentCtx,
        evaluationCtx,
      ]);
    });

    it('getKinds should return unique kinds', () => {
      const kinds = getKinds(collection);
      expect(kinds).toContain('identity');
      expect(kinds).toContain('intent');
      expect(kinds).toContain('strategy');
      expect(kinds).toContain('content');
      expect(kinds).toContain('evaluation');
      expect(kinds).toHaveLength(5);
    });

    it('getTypes should return unique types', () => {
      const types = getTypes(collection);
      expect(types).toContain('identity');
      expect(types).toContain('intent');
      expect(types).toContain('strategy');
      expect(types).toContain('content');
      expect(types).toContain('evaluation');
      expect(types).toHaveLength(5);
    });

    it('getKinds should not duplicate', () => {
      const collectionWithDupes = createContextCollection([
        strategyCtx,
        createStrategyContext({ topicId: 't2', coreThesis: 'another' }),
      ]);
      const kinds = getKinds(collectionWithDupes);
      expect(kinds).toHaveLength(1);
      expect(kinds[0]).toBe('strategy');
    });
  });

  describe('Type Narrowing Integration', () => {
    it('isContextOfKind should narrow type correctly', () => {
      const collection = createContextCollection([
        identityCtx,
        strategyCtx,
      ]);

      const strategyCollection = filterByKind(collection, 'strategy');
      expect(strategyCollection).toHaveLength(1);

      const ctx = strategyCollection[0];
      if (isContextOfKind(ctx, 'strategy')) {
        expect(ctx.payload.coreThesis).toBe('核心论点');
      }
    });
  });
});