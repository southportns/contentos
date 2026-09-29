/**
 * P0.6.3.1 — Memory Kind Classification
 *
 * Defines the fundamental categories of memory in ContextOS.
 *
 * Architecture Position:
 *   MemoryKind classifies the nature/temporal stability of a memory:
 *   - static:   Long-term stable (persona, brand rules, user profile)
 *   - dynamic:  Recent working state (active draft, current topic)
 *   - episodic: Event memory ("what happened")
 *   - semantic: Abstracted reusable facts/knowledge
 *
 * Memory Layer defines MemoryKind independently from Context Layer,
 * then Context Layer imports it from here (single source of truth).
 */

/**
 * Memory kind classification.
 *
 * - static:   Long-term stable (user profiles, personas, brand rules)
 * - dynamic:  Recent working state (active draft, current topic status)
 * - episodic: Event memory ("what happened" — draft edits, AI runs)
 * - semantic: Abstracted reusable facts ("user prefers short sentences")
 */
export type MemoryKind = 'static' | 'dynamic' | 'episodic' | 'semantic';

/**
 * All valid MemoryKind values as a runtime array.
 */
export const MEMORY_KINDS: readonly MemoryKind[] = [
  'static',
  'dynamic',
  'episodic',
  'semantic',
] as const;

/**
 * Human-readable labels for each MemoryKind.
 */
export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  static: 'Static Memory',
  dynamic: 'Dynamic Memory',
  episodic: 'Episodic Memory',
  semantic: 'Semantic Memory',
};

/**
 * Short labels for compact display.
 */
export const MEMORY_KIND_SHORT_LABELS: Record<MemoryKind, string> = {
  static: 'STATIC',
  dynamic: 'DYNAMIC',
  episodic: 'EPISODIC',
  semantic: 'SEMANTIC',
};

/**
 * Convenience constant for static memory kind.
 */
export const STATIC: MemoryKind = 'static';

/**
 * Convenience constant for dynamic memory kind.
 */
export const DYNAMIC: MemoryKind = 'dynamic';

/**
 * Convenience constant for episodic memory kind.
 */
export const EPISODIC: MemoryKind = 'episodic';

/**
 * Convenience constant for semantic memory kind.
 */
export const SEMANTIC: MemoryKind = 'semantic';
