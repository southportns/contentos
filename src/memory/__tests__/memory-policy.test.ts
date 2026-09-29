/**
 * P0.6.3.1 — Memory Policy Tests
 *
 * Tests for MemoryPolicy and resolveMemoryPolicy().
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MEMORY_POLICY, resolveMemoryPolicy } from '../memory-policy';

describe('Memory Policy', () => {
  describe('DEFAULT_MEMORY_POLICY', () => {
    it('should have minConfidence of 0.3', () => {
      expect(DEFAULT_MEMORY_POLICY.minConfidence).toBe(0.3);
    });

    it('should have minImportance of 0', () => {
      expect(DEFAULT_MEMORY_POLICY.minImportance).toBe(0);
    });

    it('should have maxResults of 20', () => {
      expect(DEFAULT_MEMORY_POLICY.maxResults).toBe(20);
    });

    it('should exclude expired memories by default', () => {
      expect(DEFAULT_MEMORY_POLICY.includeExpired).toBe(false);
    });

    it('should exclude superseded memories by default', () => {
      expect(DEFAULT_MEMORY_POLICY.includeSuperseded).toBe(false);
    });
  });

  describe('resolveMemoryPolicy', () => {
    it('should return defaults when no overrides', () => {
      const policy = resolveMemoryPolicy();
      expect(policy.minConfidence).toBe(0.3);
      expect(policy.maxResults).toBe(20);
      expect(policy.includeExpired).toBe(false);
      expect(policy.includeSuperseded).toBe(false);
    });

    it('should override specified fields', () => {
      const policy = resolveMemoryPolicy({
        minConfidence: 0.5,
        maxResults: 50,
      });
      expect(policy.minConfidence).toBe(0.5);
      expect(policy.maxResults).toBe(50);
      // Others remain at default
      expect(policy.includeExpired).toBe(false);
      expect(policy.includeSuperseded).toBe(false);
    });

    it('should allow enabling expired/superseded inclusion', () => {
      const policy = resolveMemoryPolicy({
        includeExpired: true,
        includeSuperseded: true,
      });
      expect(policy.includeExpired).toBe(true);
      expect(policy.includeSuperseded).toBe(true);
    });
  });
});
