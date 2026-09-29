/**
 * P0.6.3.1 — User Writing Profile Adapter
 *
 * Adapts UserWritingProfile → MemoryRecord<static>
 *
 * Default:
 *   kind = static
 *   scope = global (user-level, cross-project)
 *
 * Source: prisma/schema.prisma — UserWritingProfile model
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryAdapter, MemoryAdapterOptions } from '../memory-adapter';
import { createStaticMemory } from '../memory-factory';

/**
 * Minimal input type for the adapter.
 * Compatible with Prisma UserWritingProfile shape.
 */
export interface WritingProfileInput {
  id: string;
  userId: string;
  toneProfile?: unknown;
  personality?: unknown;
  languagePatterns?: unknown;
  preferredTopics?: unknown;
  preferredStructures?: unknown;
  hookStyles?: unknown;
  emotionalTendencies?: unknown;
  summary?: string | null;
  version: number;
  lastDistillAt?: Date | string | null;
  distillSampleCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Extracted payload from a writing profile.
 */
export interface WritingProfilePayload {
  toneProfile?: unknown;
  personality?: unknown;
  languagePatterns?: unknown;
  preferredTopics?: unknown;
  preferredStructures?: unknown;
  hookStyles?: unknown;
  emotionalTendencies?: unknown;
  summary?: string | null;
  distillSampleCount: number;
}

/**
 * Normalize a Date or string to ISO string.
 */
function toISOString(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

/**
 * Adapter: UserWritingProfile → MemoryRecord<WritingProfilePayload>
 *
 * Maps:
 *   kind     = static
 *   scope    = global (user-level, cross-project)
 *   type     = 'writing_profile'
 *   source   = 'user_writing_profile'
 */
export const writingProfileAdapter: MemoryAdapter<WritingProfileInput, WritingProfilePayload> = {
  sourceType: 'user_writing_profile',

  adapt(entity: WritingProfileInput, options?: MemoryAdapterOptions): MemoryRecord<WritingProfilePayload> {
    const payload: WritingProfilePayload = {
      toneProfile: entity.toneProfile,
      personality: entity.personality,
      languagePatterns: entity.languagePatterns,
      preferredTopics: entity.preferredTopics,
      preferredStructures: entity.preferredStructures,
      hookStyles: entity.hookStyles,
      emotionalTendencies: entity.emotionalTendencies,
      summary: entity.summary,
      distillSampleCount: entity.distillSampleCount,
    };

    return createStaticMemory({
      id: `mem_wp_${entity.id}`,
      type: 'writing_profile',
      payload,
      scope: options?.scope ?? 'global',
      ownerId: options?.ownerId ?? entity.userId,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? null,
      source: `user_writing_profile:${entity.id}`,
      sourceType: 'user_writing_profile',
      confidence: options?.confidence ?? 0.7,
      importance: options?.importance ?? 0.6,
      createdAt: toISOString(entity.createdAt),
      updatedAt: toISOString(entity.updatedAt),
      version: entity.version,
    });
  },
};
