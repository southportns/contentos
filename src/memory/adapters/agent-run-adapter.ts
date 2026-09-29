/**
 * P0.6.3.1 — Agent Run Adapter
 *
 * Adapts AgentRun → MemoryRecord<episodic>
 *
 * Default:
 *   kind = episodic (event memory of AI execution)
 *   scope = derived (topicId → projectId → global)
 *
 * Source: prisma/schema.prisma — AgentRun model
 */

import type { MemoryRecord } from '../memory-record';
import type { MemoryAdapter, MemoryAdapterOptions } from '../memory-adapter';
import { createEpisodicMemory } from '../memory-factory';
import { resolveMemoryScope } from '../memory-scope';

/**
 * Minimal input type for the adapter.
 * Compatible with Prisma AgentRun shape.
 */
export interface AgentRunInput {
  id: string;
  topicId?: string | null;
  skillId?: string | null;
  status: string;
  model?: string | null;
  tokens?: number | null;
  latency?: number | null;
  error?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
}

/**
 * Extracted payload from an agent run.
 */
export interface AgentRunPayload {
  skillId?: string | null;
  status: string;
  model?: string | null;
  tokens?: number | null;
  latency?: number | null;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

/**
 * Normalize a Date or string to ISO string.
 */
function toISOString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Adapter: AgentRun → MemoryRecord<AgentRunPayload>
 *
 * Maps:
 *   kind     = episodic (execution events)
 *   scope    = derived (topicId → projectId → global)
 *   type     = 'agent_run'
 *   source   = 'agent_run'
 */
export const agentRunAdapter: MemoryAdapter<AgentRunInput, AgentRunPayload> = {
  sourceType: 'agent_run',

  adapt(entity: AgentRunInput, options?: MemoryAdapterOptions): MemoryRecord<AgentRunPayload> {
    const payload: AgentRunPayload = {
      skillId: entity.skillId,
      status: entity.status,
      model: entity.model,
      tokens: entity.tokens,
      latency: entity.latency,
      error: entity.error,
      startedAt: toISOString(entity.startedAt),
      completedAt: toISOString(entity.completedAt),
    };

    return createEpisodicMemory({
      id: `mem_ar_${entity.id}`,
      type: 'agent_run',
      payload,
      scope: options?.scope ?? resolveMemoryScope({
        topicId: entity.topicId ?? null,
        projectId: options?.projectId ?? null,
      }),
      ownerId: options?.ownerId ?? null,
      projectId: options?.projectId ?? null,
      topicId: options?.topicId ?? entity.topicId ?? null,
      source: `agent_run:${entity.id}`,
      sourceType: 'agent_run',
      confidence: options?.confidence ?? (entity.status === 'completed' ? 0.9 : 0.5),
      importance: options?.importance ?? 0.4,
      createdAt: toISOString(entity.createdAt) ?? new Date().toISOString(),
      updatedAt: toISOString(entity.completedAt) ?? toISOString(entity.createdAt) ?? new Date().toISOString(),
      version: 1,
    });
  },
};
