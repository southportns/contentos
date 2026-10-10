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
 *
 * Validation Policy (P0.7.4-R1):
 *   - limit: values > MAX_RUN_LIMIT clamp to MAX_RUN_LIMIT; 0, negative, NaN,
 *     Infinity, and non-integer fractions throw RunValidationError.
 *   - cursor: malformed base64, malformed JSON, invalid timestamps, missing
 *     fields, or wrong shape throw RunValidationError.
 *   - ownerId: empty/blank string throws RunValidationError before DB access.
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
  RunValidationError,
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
 * Canonical ISO 8601 timestamp format produced by encodeCursor().
 * Matches Date.toISOString(): YYYY-MM-DDTHH:mm:ss.sssZ
 */
const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Standard Base64 alphabet (with padding). Used to reject non-canonical
 * encodings before decoding, since Node Buffer.from(value, 'base64') silently
 * ignores invalid characters.
 */
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Validate that a string is canonical Base64 (no invalid characters,
 * correct padding) and that decoding then re-encoding produces the same
 * string. This guards against permissive decoding of malformed cursors.
 */
function validateCanonicalBase64(value: string): void {
  // Must be non-empty
  if (value.length === 0) {
    throw new RunValidationError('Cursor must be a non-empty string');
  }

  // Must only contain standard Base64 characters
  if (!BASE64_REGEX.test(value)) {
    throw new RunValidationError('Cursor contains invalid Base64 characters');
  }

  // Padding rules: length must be a multiple of 4
  if (value.length % 4 !== 0) {
    throw new RunValidationError('Cursor has invalid Base64 padding');
  }

  // Canonical check: decode → re-encode must match original
  const decoded = Buffer.from(value, 'base64');
  const reEncoded = decoded.toString('base64');
  if (reEncoded !== value) {
    throw new RunValidationError('Cursor is not canonical Base64');
  }
}

/**
 * Strict cursor validation.
 *
 * A valid cursor MUST:
 *   - be a non-empty, non-whitespace string
 *   - be canonical Base64 (valid alphabet, correct padding, no silent truncation)
 *   - decode to a valid JSON object (not array, not primitive, not null)
 *   - contain a valid ISO 8601 timestamp in createdAt (matching Date.toISOString() format)
 *   - contain a non-empty, non-whitespace string in id
 *
 * @throws RunValidationError for any malformed cursor
 */
function parseCursor(cursor: string): { createdAt: Date; id: string } {
  if (typeof cursor !== 'string' || cursor.trim() === '') {
    throw new RunValidationError('Cursor must be a non-empty string');
  }

  // Validate Base64 canonically BEFORE attempting decode
  validateCanonicalBase64(cursor);

  // Now decode — at this point we know the Base64 is well-formed
  const jsonStr = Buffer.from(cursor, 'base64').toString('utf-8');

  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonStr);
  } catch {
    throw new RunValidationError('Cursor is malformed: invalid JSON');
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new RunValidationError('Cursor is malformed: expected an object');
  }

  const obj = decoded as Record<string, unknown>;

  if (typeof obj.createdAt !== 'string' || obj.createdAt.trim() === '') {
    throw new RunValidationError('Cursor is malformed: createdAt must be a non-empty string');
  }

  if (typeof obj.id !== 'string' || obj.id.trim() === '') {
    throw new RunValidationError('Cursor is malformed: id must be a non-empty string');
  }

  // Validate strict ISO 8601 format (must match Date.toISOString() output)
  if (!ISO_TIMESTAMP_REGEX.test(obj.createdAt)) {
    throw new RunValidationError('Cursor is malformed: createdAt must be a valid ISO 8601 timestamp');
  }

  const date = new Date(obj.createdAt);
  if (isNaN(date.getTime())) {
    throw new RunValidationError('Cursor is malformed: createdAt is not a valid date');
  }

  return { createdAt: date, id: obj.id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input Validation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate and normalize the limit parameter.
 *
 * Policy:
 *   - Missing/undefined → DEFAULT_RUN_LIMIT
 *   - Values > MAX_RUN_LIMIT → clamped to MAX_RUN_LIMIT
 *   - 0, negative, NaN, Infinity, non-integer, non-finite → RunValidationError
 */
function validateLimit(limit: unknown): number {
  if (limit === undefined || limit === null) {
    return DEFAULT_RUN_LIMIT;
  }

  if (typeof limit !== 'number') {
    throw new RunValidationError(`Limit must be a number, received ${typeof limit}`);
  }

  if (!Number.isFinite(limit)) {
    throw new RunValidationError('Limit must be a finite number');
  }

  if (!Number.isInteger(limit)) {
    throw new RunValidationError('Limit must be an integer');
  }

  if (limit <= 0) {
    throw new RunValidationError('Limit must be a positive integer');
  }

  if (limit > MAX_RUN_LIMIT) {
    return MAX_RUN_LIMIT;
  }

  return limit;
}

/**
 * Validate ownerId before any database access.
 *
 * @throws RunValidationError for empty/blank ownerId
 */
function validateOwnerId(ownerId: string): void {
  if (!ownerId || typeof ownerId !== 'string' || ownerId.trim() === '') {
    throw new RunValidationError('ownerId is required and must be a non-empty string');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PrismaContextOSRunStore Implementation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Prisma-backed implementation of ContextOSRunStore.
 *
 * Wraps the AgentRun model. Enforces owner isolation on every operation.
 *
 * Owner isolation is enforced at the database query level (atomic) rather than
 * in application code, preventing TOCTOU race conditions.
 */
export class PrismaContextOSRunStore implements ContextOSRunStore {
  /**
   * Create a new Run. Rejects duplicate IDs.
   */
  async create(run: ContextOSRun): Promise<ContextOSRun> {
    // Validate ownerId BEFORE acquiring Prisma client — fail fast, no DB write
    validateOwnerId(run.ownerId);

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
   * Update an existing Run. Atomically scoped to ownerId + id.
   *
   * Uses updateMany with a compound WHERE (id + ownerId) to ensure
   * the update only affects a Run owned by the caller. Then reads
   * back the persisted result with a scoped query.
   */
  async update(run: ContextOSRun): Promise<ContextOSRun> {
    const prisma = await getPrisma();

    // Validate inputs before hitting the database
    validateOwnerId(run.ownerId);

    try {
      // Atomic owner-scoped update: WHERE id = run.id AND ownerId = run.ownerId
      const result = await prisma.agentRun.updateMany({
        where: {
          id: run.id,
          ownerId: run.ownerId,
        },
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

      // If no row matched both id and ownerId, the run doesn't exist
      // (or belongs to a different owner — same error either way)
      if (result.count === 0) {
        throw new RunNotFoundError(
          `Run "${run.id}" not found for owner "${run.ownerId}"`,
          run.id,
        );
      }

      // Read back the persisted result (scoped to owner)
      const persisted = await prisma.agentRun.findFirst({
        where: {
          id: run.id,
          ownerId: run.ownerId,
        },
      });

      // Should not happen: row existed for update but vanished on read.
      // Treat as a persistence error rather than silent null.
      if (!persisted) {
        throw new RunPersistenceError(
          `Run "${run.id}" was updated but could not be read back`,
          run.id,
        );
      }

      return fromPrisma(persisted);
    } catch (error) {
      // Re-throw our own errors (validation/not-found are already specific)
      if (error instanceof RunNotFoundError) throw error;
      if (error instanceof RunValidationError) throw error;

      throw new RunPersistenceError(
        `Failed to update run: ${error instanceof Error ? error.message : String(error)}`,
        run.id,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a single Run by ownerId + runId.
   *
   * Uses findFirst with compound WHERE (id + ownerId) for atomic
   * owner-scoped lookup. Returns null if not found or not owned
   * by the caller — same response either way.
   */
  async getById(ownerId: string, runId: string): Promise<ContextOSRun | null> {
    const prisma = await getPrisma();

    // Validate ownerId before hitting the database
    validateOwnerId(ownerId);

    try {
      const row = await prisma.agentRun.findFirst({
        where: {
          id: runId,
          ownerId,
        },
      });

      if (!row) {
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
   *
   * Validation:
   *   - ownerId: must be non-empty (throws RunValidationError)
   *   - limit: clamped to MAX_RUN_LIMIT if > max; throws for 0/negative/NaN/fractions
   *   - cursor: strict validation, throws on malformed input
   */
  async list(query: ContextOSRunQuery): Promise<ContextOSRunListResult> {
    const prisma = await getPrisma();

    // Validate before any database access
    validateOwnerId(query.ownerId);
    const limit = validateLimit(query.limit);

    // Build base WHERE: owner isolation + optional filters
    const baseAnd: Prisma.AgentRunWhereInput[] = [
      { ownerId: query.ownerId },
    ];
    if (query.projectId !== undefined) baseAnd.push({ projectId: query.projectId });
    if (query.topicId !== undefined) baseAnd.push({ topicId: query.topicId });
    if (query.status !== undefined) baseAnd.push({ status: query.status });

    // Cursor: explicit presence check — only undefined means "first page".
    // Any supplied cursor (including empty/whitespace strings) is validated
    // and will throw RunValidationError if malformed. Never silently restarts.
    const cursorData = query.cursor !== undefined ? parseCursor(query.cursor) : null;

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
      // Re-throw validation errors as-is (already thrown before DB access,
      // but guard in case Prisma wraps them)
      if (error instanceof RunValidationError) throw error;

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
