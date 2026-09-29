/**
 * P0.6.3.1 — Draft Adapter
 *
 * Adapts Draft → MemoryRecord<dynamic>
 *
 * Default:
 *   kind = dynamic (recent, mutable working state)
 *   scope = topic (falls back: project → global)
 *
 * Scope derivation:
 *   - topicId exists → 'topic'
 *   - no topicId, projectId → 'project'
 *   - neither → 'global'
 *
 * Source: prisma/schema.prisma — Draft model
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryAdapter, MemoryAdapterOptions } from '../memory-adapter';
import { createDynamicMemory } from '../memory-factory';
import { resolveMemoryScope } from '../memory-scope';

/**
 * Minimal input type for the adapter.
 * Compatible with Prisma Draft shape.
 */
export interface DraftInput {
  id: string;
  topicId?: string | null;
  projectId?: string | null;
  version: number;
  parentDraftId?: string | null;
  changeType: string;
  changeReason?: string | null;
  title?: string | null;
  content: string;
  status: string;
  wordCount?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Extracted payload from a draft.
 */
export interface DraftPayload {
  title?: string | null;
  wordCount?: number | null;
  status: string;
  changeType: string;
  changeReason?: string | null;
  version: number;
  parentDraftId?: string | null;
}

/**
 * Normalize a Date or string to ISO string.
 */
function toISOString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Adapter: Draft → MemoryRecord<DraftPayload>
 *
 * Maps:
 *   kind     = dynamic (mutable working state)
 *   scope    = topic (drafts belong to topics)
 *   type     = 'draft'
 *   source   = 'draft'
 */
export const draftAdapter: MemoryAdapter<DraftInput, DraftPayload> = {
  sourceType: 'draft',

  adapt(entity: DraftInput, options?: MemoryAdapterOptions): MemoryRecord<DraftPayload> {
    const payload: DraftPayload = {
      title: entity.title,
      wordCount: entity.wordCount,
      status: entity.status,
      changeType: entity.changeType,
      changeReason: entity.changeReason,
      version: entity.version,
      parentDraftId: entity.parentDraftId,
    };

    const resolvedScope = resolveMemoryScope({
      topicId: options?.topicId ?? entity.topicId ?? null,
      projectId: options?.projectId ?? entity.projectId ?? null,
      scope: options?.scope,
    });

    return createDynamicMemory({
      id: `mem_draft_${entity.id}`,
      type: 'draft',
      payload,
      scope: resolvedScope,
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? entity.projectId ?? null,
      topicId: options?.topicId ?? entity.topicId ?? null,
      source: `draft:${entity.id}`,
      sourceType: 'draft',
      confidence: options?.confidence ?? 0.7,
      importance: options?.importance ?? 0.8,
      createdAt: toISOString(entity.createdAt),
      updatedAt: toISOString(entity.updatedAt),
      derivedFrom: entity.parentDraftId ? [entity.parentDraftId] : undefined,
      version: entity.version,
    });
  },
};
