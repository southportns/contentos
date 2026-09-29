/**
 * P0.6.3.1 — Persona Adapter
 *
 * Adapts Persona → MemoryRecord<static>
 *
 * Default:
 *   kind = static (long stable, cross-project)
 *   scope = global
 *
 * Future: brand/project Persona could be project-scoped.
 *
 * Source: prisma/schema.prisma — Persona model
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryAdapter, MemoryAdapterOptions } from '../memory-adapter';
import { createStaticMemory } from '../memory-factory';

/**
 * Minimal input type for the adapter.
 * Compatible with Prisma Persona shape.
 */
export interface PersonaInput {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Extracted payload from a persona.
 */
export interface PersonaPayload {
  name: string;
  description?: string | null;
  isActive: boolean;
}

/**
 * Normalize a Date or string to ISO string.
 */
function toISOString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Adapter: Persona → MemoryRecord<PersonaPayload>
 *
 * Maps:
 *   kind     = static
 *   scope    = global (user-level)
 *   type     = 'persona'
 *   source   = 'persona'
 */
export const personaAdapter: MemoryAdapter<PersonaInput, PersonaPayload> = {
  sourceType: 'persona',

  adapt(entity: PersonaInput, options?: MemoryAdapterOptions): MemoryRecord<PersonaPayload> {
    const payload: PersonaPayload = {
      name: entity.name,
      description: entity.description,
      isActive: entity.isActive,
    };

    return createStaticMemory({
      id: `mem_persona_${entity.id}`,
      type: 'persona',
      payload,
      scope: options?.scope ?? 'global',
      ownerId: options?.ownerId ?? entity.userId,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? null,
      source: `persona:${entity.id}`,
      sourceType: 'persona',
      confidence: options?.confidence ?? 0.9,
      importance: options?.importance ?? 0.7,
      createdAt: toISOString(entity.createdAt),
      updatedAt: toISOString(entity.updatedAt),
      version: 1,
    });
  },
};
