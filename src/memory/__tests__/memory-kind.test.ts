/**
 * P0.6.3.1 — Memory Kind Tests
 *
 * Tests for MemoryKind classification.
 */

import { describe, it, expect } from 'vitest';
import {
  MEMORY_KINDS,
  MEMORY_KIND_LABELS,
  MEMORY_KIND_SHORT_LABELS,
  STATIC,
  DYNAMIC,
  EPISODIC,
  SEMANTIC,
} from '../memory-kind';

describe('Memory Kind', () => {
  describe('Classification', () => {
    it('should have exactly 4 kinds', () => {
      expect(MEMORY_KINDS).toHaveLength(4);
    });

    it('should include static', () => {
      expect(MEMORY_KINDS).toContain('static');
      expect(STATIC).toBe('static');
    });

    it('should include dynamic', () => {
      expect(MEMORY_KINDS).toContain('dynamic');
      expect(DYNAMIC).toBe('dynamic');
    });

    it('should include episodic', () => {
      expect(MEMORY_KINDS).toContain('episodic');
      expect(EPISODIC).toBe('episodic');
    });

    it('should include semantic', () => {
      expect(MEMORY_KINDS).toContain('semantic');
      expect(SEMANTIC).toBe('semantic');
    });
  });

  describe('Labels', () => {
    it('should have labels for all kinds', () => {
      for (const kind of MEMORY_KINDS) {
        expect(MEMORY_KIND_LABELS[kind]).toBeDefined();
      }
    });

    it('should have short labels for all kinds', () => {
      for (const kind of MEMORY_KINDS) {
        expect(MEMORY_KIND_SHORT_LABELS[kind]).toBeDefined();
      }
    });
  });
});
