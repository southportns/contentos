/**
 * P0.6.2 — Context Priority & Ranking
 *
 * Scores and ranks contexts based on multiple weighted factors.
 *
 * Architecture Position:
 *   Ranker takes the SELECTED contexts and assigns each a priority score.
 *   The score determines which contexts are most valuable for the assembly purpose.
 *
 * Priority Model:
 *   score = basePriority
 *         + purposeAdjustment
 *         + confidenceAdjustment
 *         + relevanceAdjustment
 *         + recencyAdjustment
 *
 * Design Principles:
 *   1. Explainable — every score has human-readable reasons
 *   2. Deterministic — same input always produces same score
 *   3. Non-destructive — ranking never removes contexts
 *   4. Required override — required contexts get a large boost
 *
 * Non-goals:
 *   - Not removing contexts (that is ContextBudgetManager)
 *   - Not deterministic dedup (that is ContextDeduplicator)
 */

import type { ContextObject } from '../context-object';
import type { ContextKind } from '../context-kind';
import type {
  AssemblyPurpose,
  ScoredContext,
} from './types';
import { PURPOSE_RELEVANT_KINDS } from './context-selector';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Base priority for each context kind.
 *
 * Higher = more important by default.
 * Identity and Intent are always most important because they frame the task.
 */
export const BASE_PRIORITY: Record<ContextKind, number> = {
  identity: 100,
  intent: 90,
  strategy: 80,
  knowledge: 70,
  content: 60,
  evaluation: 50,
  decision: 40,
  outcome: 30,
  memory: 20,
};

/**
 * Weight for purpose-based adjustment.
 * Contexts whose kind is highly relevant to the purpose get a boost.
 */
const PURPOSE_MATCH_WEIGHT = 25;

/**
 * Weight for confidence adjustment.
 * High-confidence contexts get a boost; unknown confidence is neutral.
 */
const CONFIDENCE_WEIGHT = 15;

/**
 * Weight for relevance adjustment (topic/project match).
 */
const RELEVANCE_WEIGHT = 20;

/**
 * Weight for recency adjustment.
 * Newer contexts get a boost; older contexts decay.
 */
const RECENCY_WEIGHT = 10;

/**
 * Score boost for required contexts.
 * Ensures required contexts rank above optional ones.
 */
const REQUIRED_BOOST = 1000;

/**
 * Default reference time for recency calculations.
 * Uses a fixed point so results are deterministic within a session.
 */
const DEFAULT_REFERENCE_TIME = Date.now();

// ═══════════════════════════════════════════════════════════════════════════════
// Ranking Options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Options for context ranking.
 */
export interface RankingOptions {
  /** The purpose of assembly (drives purpose matching) */
  purpose: AssemblyPurpose;

  /** Topic ID for relevance matching */
  topicId?: string;

  /** Project ID for relevance matching */
  projectId?: string;

  /** Query string for future semantic matching */
  query?: string;

  /** Kinds that are required (get a large boost) */
  requiredKinds?: ContextKind[];

  /** Reference timestamp for recency (defaults to now) */
  referenceTime?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Scoring Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate the base priority for a context based on its kind.
 */
export function getBasePriority(kind: ContextKind): number {
  return BASE_PRIORITY[kind] ?? 50;
}

/**
 * Calculate the purpose adjustment for a context.
 *
 * Contexts whose kind is directly relevant to the assembly purpose
 * receive a positive adjustment. Others get a smaller or zero adjustment.
 */
export function getPurposeAdjustment(
  kind: ContextKind,
  purpose: AssemblyPurpose
): number {
  const relevantKinds = PURPOSE_RELEVANT_KINDS[purpose];
  if (relevantKinds.includes(kind)) {
    // First kinds in the list are more relevant
    const index = relevantKinds.indexOf(kind);
    const positionBonus = (relevantKinds.length - index) * 5;
    return PURPOSE_MATCH_WEIGHT + positionBonus;
  }
  return 0;
}

/**
 * Calculate the confidence adjustment.
 *
 * - High confidence (0.8-1.0): full positive weight
 * - Medium confidence (0.5-0.8): partial weight
 * - Low confidence (0-0.5): small weight
 * - Unknown/null: neutral (not penalized)
 */
export function getConfidenceAdjustment(confidence: number | null | undefined): number {
  if (confidence === null || confidence === undefined) {
    // Unknown confidence — neutral
    return 0;
  }
  if (confidence >= 0.8) {
    return CONFIDENCE_WEIGHT;
  }
  if (confidence >= 0.5) {
    return CONFIDENCE_WEIGHT * 0.5;
  }
  if (confidence > 0) {
    return CONFIDENCE_WEIGHT * 0.2;
  }
  return 0;
}

/**
 * Calculate the relevance adjustment based on topic/project match.
 *
 * - Topic match: high boost
 * - Project match: medium boost
 * - No match: zero
 */
export function getRelevanceAdjustment(
  context: ContextObject,
  topicId?: string,
  projectId?: string
): number {
  let score = 0;
  const ctxTopicId = context.provenance.topicId;
  const ctxProjectId = context.provenance.projectId;

  if (topicId && ctxTopicId === topicId) {
    score += RELEVANCE_WEIGHT;
  }

  if (projectId && ctxProjectId === projectId) {
    score += RELEVANCE_WEIGHT * 0.5;
  }

  return score;
}

/**
 * Calculate the recency adjustment based on updatedAt.
 *
 * Uses exponential decay: newer contexts score higher.
 * Contexts older than 7 days get minimal recency bonus.
 *
 * This is a deterministic calculation based on the reference time.
 */
export function getRecencyAdjustment(
  updatedAt: string,
  referenceTime: number = DEFAULT_REFERENCE_TIME
): number {
  const updatedTime = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedTime)) {
    return 0;
  }

  const ageMs = referenceTime - updatedTime;
  if (ageMs < 0) {
    // Future-dated context — treat as very recent
    return RECENCY_WEIGHT;
  }

  // Decay half-life: 24 hours
  const halfLifeMs = 24 * 60 * 60 * 1000;
  const halfLives = ageMs / halfLifeMs;

  // Exponential decay: score * (0.5 ^ halfLives)
  return Math.round(RECENCY_WEIGHT * Math.pow(0.5, halfLives) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Ranking Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rank contexts by priority score.
 *
 * Returns a new sorted array (highest score first).
 * Each scored context includes explainable reasons.
 *
 * @param contexts - Contexts to rank (post-selection)
 * @param options - Ranking options (purpose, topic, project, required)
 * @return ScoredContext[] sorted by score descending
 */
export function rankContexts(
  contexts: ContextObject[],
  options: RankingOptions
): ScoredContext[] {
  const {
    purpose,
    topicId,
    projectId,
    requiredKinds,
    referenceTime = DEFAULT_REFERENCE_TIME,
  } = options;

  const scored: ScoredContext[] = contexts.map((ctx) => {
    const reasons: string[] = [];
    let score = 0;

    // Base priority
    const base = getBasePriority(ctx.kind);
    score += base;
    reasons.push(`base_priority:${ctx.kind}=${base}`);

    // Purpose adjustment
    const purposeAdj = getPurposeAdjustment(ctx.kind, purpose);
    score += purposeAdj;
    if (purposeAdj > 0) {
      reasons.push(`purpose_match:${purpose}=+${purposeAdj}`);
    }

    // Confidence adjustment
    const confAdj = getConfidenceAdjustment(ctx.confidence);
    score += confAdj;
    if (confAdj > 0) {
      reasons.push(`confidence:${ctx.confidence}=+${confAdj}`);
    }

    // Relevance adjustment
    const relAdj = getRelevanceAdjustment(ctx, topicId, projectId);
    score += relAdj;
    if (relAdj > 0) {
      if (topicId && ctx.provenance.topicId === topicId) {
        reasons.push(`topic_match:${topicId}=+${RELEVANCE_WEIGHT}`);
      }
      if (projectId && ctx.provenance.projectId === projectId) {
        reasons.push(`project_match:${projectId}=+${RELEVANCE_WEIGHT * 0.5}`);
      }
    }

    // Recency adjustment
    const recAdj = getRecencyAdjustment(ctx.updatedAt, referenceTime);
    score += recAdj;
    if (recAdj > 0) {
      reasons.push(`recency:+${recAdj}`);
    }

    // Required boost
    if (requiredKinds && requiredKinds.includes(ctx.kind)) {
      score += REQUIRED_BOOST;
      reasons.push(`required_kind:${ctx.kind}=+${REQUIRED_BOOST}`);
    }

    return {
      context: ctx,
      score: Math.round(score * 100) / 100,
      reasons,
    };
  });

  // Sort by score descending (highest priority first)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
