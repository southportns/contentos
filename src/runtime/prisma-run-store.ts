/**
 * P0.7.4 — Prisma Adapter for ContextOS Run Store
 *
 * Implements ContextOSRunStore by mapping ContextOSRun → AgentRun Prisma model.
 *
 * Schema Strategy (backward-compatible extension):
 *   - Reuses existing AgentRun model (id, topicId, skillId, input, output, status, etc.)
 *   - New fields: ownerId, projectId, purpose, contextIds, decisionIds, outcomeIds
 *   - All new fields are NULLABLE — existing AgentRun records remain valid
 *   - New indexes: ownerId, (ownerId, status), (ownerId, projectId), (ownerId, topicId)
 *
 * Mapping Rules:
 *   id          → AgentRun.id (deterministic string, NOT cuid)
 *   ownerId     → AgentRun.ownerId (required for new ContextOS runs)
 *   projectId   → AgentRun.projectId
 *   topicId     → AgentRun.topicId
 *   purpose     → AgentRun.purpose
 *   input       → AgentRun.input (JSON)
 *   output      → AgentRun.output (JSON)
 *   status      → AgentRun.status (string: started|running|completed|failed)
 *   startedAt   → AgentRun.startedAt (ISO string → DateTime)
 *   completedAt → AgentRun.completedAt (ISO string → DateTime)
 *   contextIds  → AgentRun.contextIds (JSON array)
 *   decisionIds → AgentRun.decisionIds (JSON array)
 *   outcomeIds  → AgentRun.outcomeIds (JSON array)
 *
 * Fields NOT persisted (Agent-system-only, out of scope for P0.7.4):
 *   skillId, model, tokens, latency, error
 */

import { Prisma } from '@/generated/prisma';
import type { ContextOSRun, ContextOSRunStatus } from './runtime-types';
import {
  ContextOSRunStore,
  ContextOSRunQuery,
  ContextOSRunListResult,
  RunConflictError,
  RunNotFoundError,
  RunPersistenceError,
  DEFAULT_RUN_LIMIT,
  MAX_RUN_LIMIT,
} from './run-store';

// ═══════════════════════════════════════════════════════════════════════════════
// Prisma Client Access
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Lazy-import prisma to avoid build-time initialization.
 * The Prisma client is only accessed when a store method is called.
 */
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map a ContextOSRun to Prisma AgentRun create input.
 */
function toPrismaCreate(run: ContextOSRun): Prisma.AgentRunCreateInput {
  return {
    id: run.id,
    ownerId: run.ownerId,
    projectId: run.projectId ?? null,
    topicId: run.topicId ?? null,
    purpose: run.purpose ?? null,
    input: run.input === undefined ? Prisma.JsonNull : (run.input as Prisma.InputJsonValue),
    output: run.output === undefined ? null : (run.output as Prisma.InputJsonValue),
    status: run.status,
    startedAt: run.startedAt ? new Date(run.startedAt) : null,
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
    contextIds: run.contextIds.length > 0
      ? (run.contextIds as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    decisionIds: run.decisionIds.length > 0
      ? (run.decisionIds as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    outcomeIds: run.outcomeIds.length > 0
      ? (run.outcomeIds as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  };
}

/**
 * Map a Prisma AgentRun row to a ContextOSRun.
 */
function fromPrisma(row: Prisma.AgentRunOutputType): ContextOSRun {
  return {
    id: row.id,
    ownerId: row.ownerId ?? '',
    projectId: row.projectId ?? undefined,
    topicId: row.topicId ?? undefined,
    purpose: row.purpose ?? '',
    input: row.input ?? undefined,
    output: row.output ?? undefined,
    status: row.status as ContextOSRunStatus,
    startedAt: row.startedAt?.toISOString() ?? '',
    completedAt: row.completedAt?.toISOString() ?? undefined,
    contextIds: parseJsonArray(row.contextIds),
    decisionIds: parseJsonArray(row.decisionIds),
    outcomeIds: parseJsonArray(row.outcomeIds),
  };
}

/**
 * Safely parse a JSON column as string[]. Returns [] for null/invalid.
 */
function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cursor Encoding/Decryption
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Encode a cursor from (createdAt, id) for deterministic pagination.
 * Cursor format: base64(JSON({ createdAt: string, id: string }))
 */
function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64');
}

/**
 * Decode a cursor string. Returns null for invalid input.
 */
function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    if (typeof decoded.createdAt === 'string' && typeof decoded.id === 'string') {
      return { createdAt: new Date(decoded.createdAt), id: decoded.id };
    }
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PrismaContextOSRunStore Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prisma-backed implementation of ContextOSRunStore.
 *
 * Wraps the AgentRun model. Enforces owner isolation on every operation.
 */
export class PrismaContextOSRunStore implements ContextOSRunStore {
  /**
   * Create a new Run. Rejects duplicate IDs.
   */
  async create(run: ContextOSRun): Promise<ContextOSRun> {
    const prisma = await getPrisma();

    try {
      const row = await prisma.agentRun.create({
        data: toPrismaCreate(run),
      });
      return fromPrisma(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new RunConflictError(
          `Run with id "${run.id}" already exists`,
          run.id,
        );
      }
      throw new RunPersistenceError(
        `Failed to create run: ${error instanceof Error ? error.message : String(error)}`,
        run.id,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an existing Run. Verifies ownerId matches.
   */
  async update(run: ContextOSRun): Promise<ContextOSRun> {
    const prisma = await getPrisma();

    try {
      // First verify ownership — prevents silent cross-owner updates
      const existing = await prisma.agentRun.findUnique({
        where: { id: run.id },
      });

      if (!existing || existing.ownerId !== run.ownerId) {
        throw new RunNotFoundError(
          `Run "${run.id}" not found for owner "${run.ownerId}"`,
          run.id,
        );
      }

      const row = await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: run.status,
          completedAt: run.completedAt ? new Date(run.completedAt) : null,
          contextIds: run.contextIds.length > 0
            ? (run.contextIds as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          decisionIds: run.decisionIds.length > 0
            ? (run.decisionIds as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          outcomeIds: run.outcomeIds.length > 0
            ? (run.outcomeIds as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          output: run.output === undefined ? null : (run.output as Prisma.InputJsonValue),
        },
      });

      return fromPrisma(row);
    } catch (error) {
      // Re-throw our own errors
      if (error instanceof RunNotFoundError) throw error;

      throw new RunPersistenceError(
        `Failed to update run: ${error instanceof Error ? error.message : String(error)}`,
        run.id,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a single Run by ownerId + runId.
   * Returns null if not found or not owned by the caller.
   */
  async getById(ownerId: string, runId: string): Promise<ContextOSRun | null> {
    const prisma = await getPrisma();

    try {
      const row = await prisma.agentRun.findUnique({
        where: { id: runId },
      });

      if (!row || row.ownerId !== ownerId) {
        return null;
      }

      return fromPrisma(row);
    } catch (error) {
      throw new RunPersistenceError(
        `Failed to get run: ${error instanceof Error ? error.message : String(error)}`,
        runId,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * List Runs for an owner with filters and cursor-based pagination.
   *
   * Deterministic ordering: createdAt ASC, id ASC (tie-breaker).
   * When ownerId is null (legacy records), those are NOT included in any
   * owner-scoped query — we explicitly filter ownerId = query.ownerId.
   */
  async list(query: ContextOSRunQuery): Promise<ContextOSRunListResult> {
    const prisma = await getPrisma();
    const limit = Math.min(query.limit ?? DEFAULT_RUN_LIMIT, MAX_RUN_LIMIT);

    // Build base WHERE: owner isolation + optional filters
    const baseAnd: Prisma.AgentRunWhereInput[] = [
      { ownerId: query.ownerId },
    ];
    if (query.projectId !== undefined) baseAnd.push({ projectId: query.projectId });
    if (query.topicId !== undefined) baseAnd.push({ topicId: query.topicId });
    if (query.status !== undefined) baseAnd.push({ status: query.status });

    // Cursor: encode last-seen (createdAt, id) for composite-key pagination
    const cursorData = query.cursor ? decodeCursor(query.cursor) : null;

    // WHERE = base filters AND (createdAt > cursor OR (createdAt == cursor AND id > cursor))
    const where: Prisma.AgentRunWhereInput = cursorData
      ? {
          AND: [
            ...baseAnd,
            {
              OR: [
                { createdAt: { gt: cursorData.createdAt } },
                {
                  createdAt: { equals: cursorData.createdAt },
                  id: { gt: cursorData.id },
                },
              ],
            },
          ],
        }
      : { AND: baseAnd };

    try {
      const rows = await prisma.agentRun.findMany({
        where,
        orderBy: [
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: limit + 1, // fetch one extra to detect hasMore
      });

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      // Compute nextCursor from the last row of the current page
      const nextCursor = hasMore && pageRows.length > 0
        ? encodeCursor(
            pageRows[pageRows.length - 1].createdAt,
            pageRows[pageRows.length - 1].id,
          )
        : null;

      return {
        runs: pageRows.map(fromPrisma),
        nextCursor,
        totalCount: -1, // omitted for performance; computing exact count requires separate query
      };
    } catch (error) {
      throw new RunPersistenceError(
        `Failed to list runs: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Prisma-backed Run Store.
 * Lazy — Prisma client is only touched when a method is called.
 */
export function createPrismaRunStore(): ContextOSRunStore {
  return new PrismaContextOSRunStore();
}
