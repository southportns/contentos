/**
 * P0.6.1 — Context Sub-Types
 *
 * Defines strongly-typed context payloads for each ContextKind.
 *
 * Architecture Position:
 *   These interfaces extend ContextObject<T> with kind-specific payload types.
 *   They do NOT redefine existing domain types — they WRAP existing types
 *   to provide the unified ContextObject interface.
 *
 * Design Principle:
 *   ContextObject<ExistingDomainType> — REUSE, don't REDEFINE
 */

import type { ContextObject } from './context-object';

// ═══════════════════════════════════════════════════════════════════════════════
// Identity Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface IdentityContextPayload {
  userId?: string | null;
  projectId?: string | null;
  personaId?: string | null;
  userName?: string | null;
  projectName?: string | null;
}

export type IdentityContext = ContextObject<IdentityContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Intent Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface IntentContextPayload {
  goal?: string | null;
  task?: string | null;
  constraints?: string[] | null;
  contentType?: string | null;
  audience?: string | null;
  businessObjective?: string | null;
}

export type IntentContext = ContextObject<IntentContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Knowledge Context
// ═══════════════════════════════════════════════════════════════════════════════

import type { KnowledgeContext } from '@/knowledge/context/knowledge-context-types';

export type KnowledgeContextObject = ContextObject<KnowledgeContext>;

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface StrategyContextPayload {
  topicId?: string | null;
  topicName?: string | null;
  coreThesis?: string | null;
  angleTitle?: string | null;
  targetEmotion?: string | null;
  platform?: string | null;
  approvalStatus?: string | null;
  personaName?: string | null;
}

export type StrategyContext = ContextObject<StrategyContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Content Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContentContextPayload {
  draftId?: string | null;
  version?: number | null;
  title?: string | null;
  wordCount?: number | null;
  status?: string | null;
  changeType?: string | null;
  parentDraftId?: string | null;
}

export type ContentContext = ContextObject<ContentContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Evaluation Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvaluationContextPayload {
  evaluationId?: string | null;
  draftId?: string | null;
  overallScore?: number | null;
  platformFit?: number | null;
  strategyConsistency?: number | null;
  aiStyleRisk?: number | null;
  authenticityScore?: number | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  suggestionCount?: number | null;
  emotionalArcAchieved?: boolean | null;
}

export type EvaluationContext = ContextObject<EvaluationContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Decision Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface DecisionContextPayload {
  decisionType: string;
  actor?: string | null;
  selected?: string | null;
  rejected?: string[] | null;
  reason?: string | null;
  alternatives?: string[] | null;
}

export type DecisionContext = ContextObject<DecisionContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Outcome Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface OutcomeContextPayload {
  outcomeType: string;
  value?: unknown;
  source?: string | null;
  observedAt?: string | null;
}

export type OutcomeContext = ContextObject<OutcomeContextPayload>;

// ═══════════════════════════════════════════════════════════════════════════════
// Memory Context
// ═══════════════════════════════════════════════════════════════════════════════

import type { MemoryContextPayload } from '@/memory/memory-types';

export type MemoryContext = ContextObject<MemoryContextPayload>;
