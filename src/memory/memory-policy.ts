/**
 * P0.6.3.1 — Memory Policy
 *
 * Defines filtering/retrieval policies for Memory records.
 *
 * Architecture Position:
 *   MemoryPolicy controls WHICH memories are selected and how many.
 *   It is applied during retrieval, not during creation.
 *
 * Design Principles:
 *   1. Policy is applied at RETRIEVAL time, not storage time
 *   2. Confidence and Importance are separate filtering dimensions
 *   3. Default policy is conservative (excludes expired/superseded)
 */

import type { MemoryKind } from './memory-kind';
import type { MemoryScope } from './memory-scope';

/**
 * Policy for filtering and limiting memory retrieval.
 */
export interface MemoryPolicy {
  /** Minimum confidence threshold (0.0 - 1.0). Memories below are excluded. */
  minConfidence?: number;

  /** Minimum importance threshold (0.0 - 1.0). Memories below are excluded. */
  minImportance?: number;

  /** Maximum age in days. Memories older than this are excluded. */
  maxAgeDays?: number;

  /** Maximum number of results to return. */
  maxResults?: number;

  /** Only these memory kinds will be included. */
  allowedKinds?: MemoryKind[];

  /** These memory kinds will be excluded. */
  excludedKinds?: MemoryKind[];

  /** Only these scopes will be included. */
  allowedScopes?: MemoryScope[];

  /** Whether to include expired memories. Default false. */
  includeExpired?: boolean;

  /** Whether to include superseded memories. Default false. */
  includeSuperseded?: boolean;
}

/**
 * Default memory retrieval policy.
 *
 * Conservative defaults:
 * - Excludes low-confidence memories (< 0.3)
 * - No minimum importance (all importance levels allowed)
 * - Limits to 20 results
 * - Excludes expired and superseded memories
 */
export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  minConfidence: 0.3,
  minImportance: 0,
  maxResults: 20,
  includeExpired: false,
  includeSuperseded: false,
};

/**
 * Merge a partial policy with the default policy.
 *
 * @param overrides - Partial policy to merge over defaults
 * @return Complete policy with defaults for unspecified fields
 */
export function resolveMemoryPolicy(
  overrides?: MemoryPolicy
): Required<Pick<MemoryPolicy, 'minConfidence' | 'minImportance' | 'maxResults' | 'includeExpired' | 'includeSuperseded'>> & MemoryPolicy {
  return {
    ...DEFAULT_MEMORY_POLICY,
    ...overrides,
  };
}
