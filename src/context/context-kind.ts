/**
 * P0.6.1 — Context Kind Classification
 *
 * Defines the fundamental categories of Context in ContextOS.
 *
 * Architecture Position:
 *   ContextKind is the top-level discriminator for all Context Objects.
 *   Every ContextObject MUST have exactly one kind.
 *
 * Design Principles:
 *   1. Each kind maps to a distinct architectural concern
 *   2. Kinds are stable — do not add/remove without architectural review
 *   3. Kinds are NOT database entities — they are context classifications
 *
 * Non-goals:
 *   - Not a replacement for domain-specific types
 *   - Not a lifecycle state (see ContextLifecycleStage)
 *   - Not a skill category
 */

export type ContextKind =
  | 'identity'
  | 'intent'
  | 'knowledge'
  | 'strategy'
  | 'content'
  | 'evaluation'
  | 'decision'
  | 'outcome'
  | 'memory';

export const CONTEXT_KINDS: readonly ContextKind[] = [
  'identity',
  'intent',
  'knowledge',
  'strategy',
  'content',
  'evaluation',
  'decision',
  'outcome',
  'memory',
] as const;

export const CONTEXT_KIND_LABELS: Record<ContextKind, string> = {
  identity: 'Identity',
  intent: 'Intent',
  knowledge: 'Knowledge',
  strategy: 'Strategy',
  content: 'Content',
  evaluation: 'Evaluation',
  decision: 'Decision',
  outcome: 'Outcome',
  memory: 'Memory',
};