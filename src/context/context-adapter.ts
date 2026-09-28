/**
 * P0.6.1 — Context Adapter
 *
 * Converts Prisma Entities into ContextObjects.
 *
 * Architecture Position:
 *
 *   Prisma Entity
 *     ↓ (Adapter)
 *   ContextObject
 *
 * Adapters are the bridge between the database layer and the Context Layer.
 * They ensure entities are presented consistently as ContextObjects
 * regardless of which entity they came from.
 *
 * Design Principles:
 *   1. Adapters are READ-ONLY — they never modify source entities
 *   2. Adapters carry only CONTEXT-RELEVANT fields — not full entity data
 *   3. Each adapter is independent — no inter-adapter dependencies
 *   4. Adapters set appropriate provenance automatically
 *
 * Non-goals:
 *   - Not mutation (adapters don't change entities)
 *   - Not full entity serialization (only context-relevant fields)
 *   - Not validation (validation happens in the source layer)
 */

import type { ContextObject } from './context-object';
import type { ContextProvenance } from './context-provenance';
import { createContextObject } from './context-factory';

// ═══════════════════════════════════════════════════════════════════════════════
// Adapter Interface
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContextAdapter<TEntity, TContext> {
  readonly sourceType: string;
  adapt(entity: TEntity, options?: AdapterOptions): ContextObject<TContext>;
}

export interface AdapterOptions {
  ownerId?: string | null;
  projectId?: string | null;
  topicId?: string | null;
  provenance?: ContextProvenance;
  lifecycleStage?: Parameters<typeof createContextObject>[0]['lifecycleStage'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Topic Adapter
// ═══════════════════════════════════════════════════════════════════════════════

import type { IntentContextPayload } from './context-types';
import type { StrategyContextPayload } from './context-types';

export interface TopicInput {
  id: string;
  topic: string;
  category?: string | null;
  platform?: string | null;
  audience?: string | null;
  contentType?: string | null;
  goal?: string | null;
  tone?: string | null;
  constraints?: string | null;
  status?: string | null;
  projectId: string;
  personaId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const topicAdapter: ContextAdapter<TopicInput, IntentContextPayload> = {
  sourceType: 'topic',

  adapt(entity: TopicInput, options?: AdapterOptions): ContextObject<IntentContextPayload> {
    const provenance: ContextProvenance = {
      source: `topic:${entity.id}`,
      sourceType: 'database',
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? entity.projectId,
      topicId: options?.topicId ?? entity.id,
      ...options?.provenance,
    };

    const payload: IntentContextPayload = {
      goal: entity.goal,
      constraints: entity.constraints ? [entity.constraints] : null,
      contentType: entity.contentType,
      audience: entity.audience,
      task: entity.topic,
    };

    return createContextObject({
      id: `ctx_topic_${entity.id}`,
      kind: 'intent',
      type: 'topic_intent',
      payload,
      provenance,
      lifecycleStage: options?.lifecycleStage ?? 'retrieved',
    });
  },
};

export function adaptTopicToStrategy(
  entity: TopicInput,
  options?: AdapterOptions
): ContextObject<StrategyContextPayload> {
  const provenance: ContextProvenance = {
    source: `topic:${entity.id}`,
    sourceType: 'database',
    ownerId: options?.ownerId ?? null,
    projectId: options?.projectId ?? entity.projectId,
    topicId: options?.topicId ?? entity.id,
    ...options?.provenance,
  };

  const payload: StrategyContextPayload = {
    topicId: entity.id,
    topicName: entity.topic,
    platform: entity.platform,
  };

  return createContextObject({
    id: `ctx_topic_strategy_${entity.id}`,
    kind: 'strategy',
    type: 'topic_strategy',
    payload,
    provenance,
    lifecycleStage: options?.lifecycleStage ?? 'retrieved',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Strategy Adapter
// ═══════════════════════════════════════════════════════════════════════════════

import type { ContentStrategy } from '@prisma/client';

export const strategyAdapter: ContextAdapter<ContentStrategy, StrategyContextPayload> = {
  sourceType: 'content_strategy',

  adapt(entity: ContentStrategy, options?: AdapterOptions): ContextObject<StrategyContextPayload> {
    const provenance: ContextProvenance = {
      source: `strategy:${entity.id}`,
      sourceType: 'database',
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? entity.topicId,
      ...options?.provenance,
    };

    const payload: StrategyContextPayload = {
      topicId: entity.topicId,
      coreThesis: entity.coreThesis,
      targetEmotion: entity.targetEmotion,
      approvalStatus: entity.approvalStatus,
    };

    return createContextObject({
      id: `ctx_strategy_${entity.id}`,
      kind: 'strategy',
      type: 'content_strategy',
      payload,
      provenance,
      lifecycleStage: options?.lifecycleStage ?? 'retrieved',
      confidence: entity.approvalStatus === 'approved' ? 0.9 : 0.5,
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Draft Adapter
// ═══════════════════════════════════════════════════════════════════════════════

import type { ContentContextPayload } from './context-types';
import type { Draft } from '@prisma/client';

export const draftAdapter: ContextAdapter<Draft, ContentContextPayload> = {
  sourceType: 'draft',

  adapt(entity: Draft, options?: AdapterOptions): ContextObject<ContentContextPayload> {
    const provenance: ContextProvenance = {
      source: `draft:${entity.id}`,
      sourceType: 'database',
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? entity.topicId,
      derivedFrom: entity.parentDraftId ? [entity.parentDraftId] : undefined,
      ...options?.provenance,
    };

    const payload: ContentContextPayload = {
      draftId: entity.id,
      version: entity.version,
      title: entity.title,
      wordCount: entity.wordCount,
      status: entity.status,
      changeType: entity.changeType,
      parentDraftId: entity.parentDraftId,
    };

    return createContextObject({
      id: `ctx_draft_${entity.id}`,
      kind: 'content',
      type: 'draft',
      payload,
      provenance,
      lifecycleStage: options?.lifecycleStage ?? 'retrieved',
    });
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Evaluation Adapter
// ═══════════════════════════════════════════════════════════════════════════════

import type { Evaluation } from '@prisma/client';
import type { EvaluationContextPayload } from './context-types';

export const evaluationAdapter: ContextAdapter<Evaluation, EvaluationContextPayload> = {
  sourceType: 'evaluation',

  adapt(entity: Evaluation, options?: AdapterOptions): ContextObject<EvaluationContextPayload> {
    const provenance: ContextProvenance = {
      source: `evaluation:${entity.id}`,
      sourceType: 'database',
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? entity.topicId,
      ...options?.provenance,
    };

    let emotionalArcAchieved: boolean | null = null;
    if (entity.emotionalArcAnalysis && typeof entity.emotionalArcAnalysis === 'object') {
      const arc = entity.emotionalArcAnalysis as { achieved?: boolean };
      emotionalArcAchieved = arc.achieved ?? null;
    }

    const payload: EvaluationContextPayload = {
      evaluationId: entity.id,
      draftId: entity.draftId,
      overallScore: entity.overallScore,
      platformFit: entity.platformFitScore,
      strengths: Array.isArray(entity.strengths) ? (entity.strengths as string[]) : null,
      weaknesses: Array.isArray(entity.issues) ? (entity.issues as string[]) : null,
      suggestionCount: Array.isArray(entity.suggestions) ? (entity.suggestions as unknown[]).length : null,
      emotionalArcAchieved,
    };

    const confidence = entity.overallScore != null ? entity.overallScore / 100 : null;

    return createContextObject({
      id: `ctx_eval_${entity.id}`,
      kind: 'evaluation',
      type: 'evaluation',
      payload,
      provenance,
      lifecycleStage: options?.lifecycleStage ?? 'evaluated',
      confidence,
    });
  },
};