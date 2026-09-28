import { describe, it, expect } from 'vitest';
import { serializeContextPackage } from '../context-serializer';
import type { ContextPackage } from '../types';
import { createContextObject } from '../../context-factory';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

function makeEmptyPackage(): ContextPackage {
  return {
    knowledge: [],
    strategy: [],
    content: [],
    evaluation: [],
    decision: [],
    outcome: [],
    memory: [],
    metadata: {
      purpose: 'generic',
      tokenEstimate: 0,
      contextCount: 0,
      assembledAt: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContextSerializer', () => {
  describe('Empty Package', () => {
    it('should produce minimal output for empty package', () => {
      const pkg = makeEmptyPackage();
      const result = serializeContextPackage(pkg);
      expect(result).toBe('');
    });

    it('should include header when requested', () => {
      const pkg = makeEmptyPackage();
      const result = serializeContextPackage(pkg, { includeHeader: true });
      expect(result).toContain('Context Package');
      expect(result).toContain('generic');
    });

    it('should include empty sections when requested', () => {
      const pkg = makeEmptyPackage();
      const result = serializeContextPackage(pkg, { includeEmpty: true });
      expect(result).toContain('[Knowledge]');
      expect(result).toContain('[Strategy]');
    });
  });

  describe('Identity Serialization', () => {
    it('should serialize identity context', () => {
      const identityCtx = createContextObject({
        kind: 'identity',
        type: 'identity',
        payload: { userName: 'TestUser', projectName: 'TestProject' },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.identity = identityCtx;

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Identity]');
      expect(result).toContain('TestUser');
      expect(result).toContain('TestProject');
    });
  });

  describe('Intent Serialization', () => {
    it('should serialize intent context with goal', () => {
      const intentCtx = createContextObject({
        kind: 'intent',
        type: 'topic_intent',
        payload: {
          goal: 'Create viral content',
          constraints: ['No clickbait', 'Stay authentic'],
          audience: 'Gen Z',
        },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.intent = intentCtx;

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Intent]');
      expect(result).toContain('Create viral content');
      expect(result).toContain('No clickbait');
      expect(result).toContain('Gen Z');
    });

    it('should handle intent without constraints', () => {
      const intentCtx = createContextObject({
        kind: 'intent',
        type: 'topic_intent',
        payload: { goal: 'Simple goal' },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.intent = intentCtx;

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Intent]');
      expect(result).toContain('Simple goal');
      expect(result).not.toContain('Constraints:');
    });
  });

  describe('Strategy Serialization', () => {
    it('should serialize strategy context', () => {
      const strategyCtx = createContextObject({
        kind: 'strategy',
        type: 'content_strategy',
        payload: {
          coreThesis: 'Authentic storytelling drives engagement',
          targetEmotion: 'Empathy',
          platform: 'xiaohongshu',
          approvalStatus: 'approved',
        },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.strategy = [strategyCtx];

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Strategy]');
      expect(result).toContain('Authentic storytelling');
      expect(result).toContain('Empathy');
      expect(result).toContain('xiaohongshu');
      expect(result).toContain('approved');
    });
  });

  describe('Knowledge Serialization', () => {
    it('should serialize knowledge context with primary items', () => {
      const knowledgeCtx = createContextObject({
        kind: 'knowledge',
        type: 'knowledge_unit',
        payload: {
          primaryKnowledge: [
            { name: 'Hook technique', similarity: 0.85 },
            { name: 'Emotional arc', similarity: 0.72 },
          ],
        },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.knowledge = [knowledgeCtx];

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Knowledge]');
      expect(result).toContain('Hook technique');
      expect(result).toContain('Emotional arc');
      expect(result).toContain('0.85');
    });
  });

  describe('Content Serialization', () => {
    it('should serialize content context', () => {
      const contentCtx = createContextObject({
        kind: 'content',
        type: 'draft',
        payload: {
          title: 'My Viral Post',
          version: 3,
          status: 'DRAFT',
          changeType: 'MANUAL_EDIT',
        },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.content = [contentCtx];

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Content]');
      expect(result).toContain('My Viral Post');
      expect(result).toContain('Version: 3');
    });
  });

  describe('Evaluation Serialization', () => {
    it('should serialize evaluation context', () => {
      const evalCtx = createContextObject({
        kind: 'evaluation',
        type: 'evaluation',
        payload: {
          overallScore: 85,
          platformFit: 90,
          weaknesses: ['Too long', 'Weak CTA'],
        },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.evaluation = [evalCtx];

      const result = serializeContextPackage(pkg);
      expect(result).toContain('[Evaluation]');
      expect(result).toContain('85/100');
      expect(result).toContain('Too long');
    });
  });

  describe('Mixed Package', () => {
    it('should serialize a mixed package with multiple kinds', () => {
      const pkg = makeEmptyPackage();
      pkg.identity = createContextObject({
        kind: 'identity',
        type: 'identity',
        payload: { userName: 'Alice' },
        provenance: { source: 'test' },
      });
      pkg.intent = createContextObject({
        kind: 'intent',
        type: 'topic_intent',
        payload: { goal: 'Viral content' },
        provenance: { source: 'test' },
      });
      pkg.strategy = [createContextObject({
        kind: 'strategy',
        type: 'content_strategy',
        payload: { coreThesis: 'Authentic stories' },
        provenance: { source: 'test' },
      })];

      const result = serializeContextPackage(pkg);

      // All sections should be present
      expect(result).toContain('[Identity]');
      expect(result).toContain('[Intent]');
      expect(result).toContain('[Strategy]');
      expect(result).toContain('Alice');
      expect(result).toContain('Viral content');
      expect(result).toContain('Authentic stories');
    });

    it('should serialize in kind priority order', () => {
      const pkg = makeEmptyPackage();
      pkg.memory = [createContextObject({
        kind: 'memory',
        type: 'static',
        payload: { key: 'old' },
        provenance: { source: 'test' },
      })];
      pkg.identity = createContextObject({
        kind: 'identity',
        type: 'identity',
        payload: { userName: 'Bob' },
        provenance: { source: 'test' },
      });

      const result = serializeContextPackage(pkg);
      const identityIndex = result.indexOf('[Identity]');
      const memoryIndex = result.indexOf('[Memory]');

      // Identity should come before Memory
      expect(identityIndex).toBeLessThan(memoryIndex);
    });
  });

  describe('Truncation', () => {
    it('should truncate long contexts when maxCharsPerContext is set', () => {
      const longCtx = createContextObject({
        kind: 'strategy',
        type: 'content_strategy',
        payload: { coreThesis: 'a'.repeat(500) },
        provenance: { source: 'test' },
      });

      const pkg = makeEmptyPackage();
      pkg.strategy = [longCtx];

      const result = serializeContextPackage(pkg, { maxCharsPerContext: 100 });
      expect(result).toContain('[truncated]');
    });
  });

  describe('Determinism', () => {
    it('should produce same output for same input', () => {
      const pkg = makeEmptyPackage();
      pkg.intent = createContextObject({
        kind: 'intent',
        type: 'topic_intent',
        payload: { goal: 'Test' },
        provenance: { source: 'test' },
      });

      const result1 = serializeContextPackage(pkg);
      const result2 = serializeContextPackage(pkg);
      expect(result1).toBe(result2);
    });
  });
});
