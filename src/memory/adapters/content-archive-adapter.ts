/**
 * P0.6.3.1 — User Content Archive Adapter
 *
 * Adapts UserContentArchive → MemoryRecord<episodic>
 *
 * Default:
 *   kind = episodic ("what happened" — past content events)
 *   scope = global (user-level event history, cross-project)
 *
 * Source: prisma/schema.prisma — UserContentArchive model
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryAdapter, MemoryAdapterOptions } from '../memory-adapter';
import { createEpisodicMemory } from '../memory-factory';

/**
 * Minimal input type for the adapter.
 * Compatible with Prisma UserContentArchive shape.
 */
export interface ContentArchiveInput {
  id: string;
  userId: string;
  topic: string;
  platform?: string | null;
  finalTitle: string;
  finalContent: string;
  finalHook?: string | null;
  refineChanges?: unknown;
  refineData?: unknown;
  humanizationData?: unknown;
  humanizationAdopted?: boolean | null;
  resolvedIssues?: unknown;
  unresolvedIssues?: unknown;
  preservedElements?: unknown;
  draftVersion?: number | null;
  refineVersion?: number | null;
  selectedAngleTitle?: string | null;
  strategyTone?: string | null;
  wordCount?: number | null;
  createdAt: Date | string;
}

/**
 * Extracted payload from a content archive.
 */
export interface ContentArchivePayload {
  topic: string;
  platform?: string | null;
  finalTitle: string;
  finalHook?: string | null;
  humanizationAdopted?: boolean | null;
  draftVersion?: number | null;
  refineVersion?: number | null;
  selectedAngleTitle?: string | null;
  strategyTone?: string | null;
  wordCount?: number | null;
}

/**
 * Normalize a Date or string to ISO string.
 */
function toISOString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Adapter: UserContentArchive → MemoryRecord<ContentArchivePayload>
 *
 * Maps:
 *   kind     = episodic (past content generation events)
 *   scope    = global (user event history)
 *   type     = 'content_archive'
 *   source   = 'user_content_archive'
 */
export const contentArchiveAdapter: MemoryAdapter<ContentArchiveInput, ContentArchivePayload> = {
  sourceType: 'user_content_archive',

  adapt(entity: ContentArchiveInput, options?: MemoryAdapterOptions): MemoryRecord<ContentArchivePayload> {
    const payload: ContentArchivePayload = {
      topic: entity.topic,
      platform: entity.platform,
      finalTitle: entity.finalTitle,
      finalHook: entity.finalHook,
      humanizationAdopted: entity.humanizationAdopted,
      draftVersion: entity.draftVersion,
      refineVersion: entity.refineVersion,
      selectedAngleTitle: entity.selectedAngleTitle,
      strategyTone: entity.strategyTone,
      wordCount: entity.wordCount,
    };

    return createEpisodicMemory({
      id: `mem_ca_${entity.id}`,
      type: 'content_archive',
      payload,
      scope: options?.scope ?? 'global',
      ownerId: options?.ownerId ?? entity.userId,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? null,
      source: `user_content_archive:${entity.id}`,
      sourceType: 'user_content_archive',
      confidence: options?.confidence ?? 0.8,
      importance: options?.importance ?? 0.5,
      createdAt: toISOString(entity.createdAt),
      updatedAt: toISOString(entity.createdAt), // Archive has no updatedAt by default
      version: 1,
    });
  },
};
