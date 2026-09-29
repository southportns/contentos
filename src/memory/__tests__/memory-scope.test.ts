/**
 * P0.6.3.1 — Memory Scope Tests
 *
 * Tests for MemoryScope classification and resolveMemoryScope().
 */

import { describe, it, expect } from 'vitest';
import { MEMORY_SCOPES, resolveMemoryScope } from '../memory-scope';

describe('Memory Scope', () => {
  describe('Classification', () => {
    it('should have exactly 4 scopes', () => {
      expect(MEMORY_SCOPES).toHaveLength(4);
    });

    it('should include global, project, topic, session', () => {
      expect(MEMORY_SCOPES).toContain('global');
      expect(MEMORY_SCOPES).toContain('project');
      expect(MEMORY_SCOPES).toContain('topic');
      expect(MEMORY_SCOPES).toContain('session');
    });
  });

  describe('resolveMemoryScope', () => {
    it('should return explicit scope when provided', () => {
      expect(resolveMemoryScope({ scope: 'session' })).toBe('session');
      expect(resolveMemoryScope({ scope: 'topic', topicId: 't1' })).toBe('topic');
      expect(resolveMemoryScope({ scope: 'project', projectId: 'p1' })).toBe('project');
    });

    it('should derive topic scope from topicId', () => {
      expect(resolveMemoryScope({ topicId: 'topic-1' })).toBe('topic');
    });

    it('should derive project scope from projectId when no topicId', () => {
      expect(resolveMemoryScope({ projectId: 'project-1' })).toBe('project');
    });

    it('should default to global when no signals', () => {
      expect(resolveMemoryScope({})).toBe('global');
    });

    it('should prefer topicId over projectId', () => {
      expect(resolveMemoryScope({
        topicId: 'topic-1',
        projectId: 'project-1',
      })).toBe('topic');
    });

    it('should handle null topicId/projectId', () => {
      expect(resolveMemoryScope({ topicId: null, projectId: null })).toBe('global');
    });

    it('should handle undefined topicId/projectId', () => {
      expect(resolveMemoryScope({ topicId: undefined, projectId: undefined })).toBe('global');
    });

    it('should prefer explicit scope even when IDs present', () => {
      expect(resolveMemoryScope({
        scope: 'global',
        topicId: 'topic-1',
        projectId: 'project-1',
      })).toBe('global');
    });
  });
});
