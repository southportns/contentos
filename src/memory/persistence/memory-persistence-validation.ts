/**
 * P0.6.3.2.1 — Memory Persistence Validation
 *
 * Validates MemoryRecord data before writing to the database.
 * Prevents invalid data from being persisted.
 *
 * Architecture Position:
 *   Validation runs BEFORE Prisma writes. It is the last line of defense
 *   against invalid data entering the persistence layer.
 *
 * Design Principles:
 *   1. Validate all required fields are present
 *   2. Validate numeric ranges (confidence, importance ∈ [0,1])
 *   3. Validate enum fields (kind, scope, status)
 *   4. Validate version and accessCount are non-negative
 */

import type { MemoryRecord } from '../memory-record';
import { MEMORY_KINDS } from '../memory-kind';
import { MEMORY_SCOPES } from '../memory-scope';
import { MEMORY_STATUSES } from '../memory-record';
import { MemoryValidationError } from './memory-persistence-types';

/**
 * Validate a MemoryRecord before persistence.
 *
 * Checks:
 * - id is non-empty string
 * - kind is a valid MemoryKind
 * - type is non-empty string
 * - scope is a valid MemoryScope
 * - ownerId is non-empty string
 * - source is non-empty string
 * - sourceType is non-empty string
 * - confidence ∈ [0, 1]
 * - importance ∈ [0, 1]
 * - version >= 1
 * - accessCount >= 0
 * - status is a valid MemoryStatus
 *
 * @param record - MemoryRecord to validate
 * @throws MemoryValidationError if validation fails
 */
export function validateMemoryRecord(record: MemoryRecord): void {
  // id: non-empty string
  if (!record.id || typeof record.id !== 'string') {
    throw new MemoryValidationError(
      'MemoryRecord.id must be a non-empty string',
    );
  }

  // kind: valid MemoryKind
  if (!MEMORY_KINDS.includes(record.kind)) {
    throw new MemoryValidationError(
      `MemoryRecord.kind must be one of: ${MEMORY_KINDS.join(', ')}. Got: ${record.kind}`,
    );
  }

  // type: non-empty string
  if (!record.type || typeof record.type !== 'string') {
    throw new MemoryValidationError(
      'MemoryRecord.type must be a non-empty string',
    );
  }

  // scope: valid MemoryScope
  if (!MEMORY_SCOPES.includes(record.scope)) {
    throw new MemoryValidationError(
      `MemoryRecord.scope must be one of: ${MEMORY_SCOPES.join(', ')}. Got: ${record.scope}`,
    );
  }

  // ownerId: non-empty string (required for persistence)
  if (!record.ownerId || typeof record.ownerId !== 'string') {
    throw new MemoryValidationError(
      'MemoryRecord.ownerId must be a non-empty string',
    );
  }

  // source: non-empty string
  if (!record.source || typeof record.source !== 'string') {
    throw new MemoryValidationError(
      'MemoryRecord.source must be a non-empty string',
    );
  }

  // sourceType: non-empty string
  if (!record.sourceType || typeof record.sourceType !== 'string') {
    throw new MemoryValidationError(
      'MemoryRecord.sourceType must be a non-empty string',
    );
  }

  // confidence: number in [0, 1]
  if (
    typeof record.confidence !== 'number' ||
    isNaN(record.confidence) ||
    record.confidence < 0 ||
    record.confidence > 1
  ) {
    throw new MemoryValidationError(
      `MemoryRecord.confidence must be a number between 0 and 1. Got: ${record.confidence}`,
    );
  }

  // importance: number in [0, 1]
  if (
    typeof record.importance !== 'number' ||
    isNaN(record.importance) ||
    record.importance < 0 ||
    record.importance > 1
  ) {
    throw new MemoryValidationError(
      `MemoryRecord.importance must be a number between 0 and 1. Got: ${record.importance}`,
    );
  }

  // version: integer >= 1
  if (
    typeof record.version !== 'number' ||
    !Number.isInteger(record.version) ||
    record.version < 1
  ) {
    throw new MemoryValidationError(
      `MemoryRecord.version must be an integer >= 1. Got: ${record.version}`,
    );
  }

  // accessCount: integer >= 0
  if (
    typeof record.accessCount !== 'number' ||
    !Number.isInteger(record.accessCount) ||
    record.accessCount < 0
  ) {
    throw new MemoryValidationError(
      `MemoryRecord.accessCount must be an integer >= 0. Got: ${record.accessCount}`,
    );
  }

  // status: valid MemoryStatus
  if (!MEMORY_STATUSES.includes(record.status)) {
    throw new MemoryValidationError(
      `MemoryRecord.status must be one of: ${MEMORY_STATUSES.join(', ')}. Got: ${record.status}`,
    );
  }

  // ISO timestamp format validation for createdAt/updatedAt
  if (!isValidISODate(record.createdAt)) {
    throw new MemoryValidationError(
      `MemoryRecord.createdAt must be a valid ISO 8601 date string. Got: ${record.createdAt}`,
    );
  }

  if (!isValidISODate(record.updatedAt)) {
    throw new MemoryValidationError(
      `MemoryRecord.updatedAt must be a valid ISO 8601 date string. Got: ${record.updatedAt}`,
    );
  }

  // Optional timestamp fields: if present and non-null, must be valid ISO
  if (record.lastAccessedAt != null && !isValidISODate(record.lastAccessedAt)) {
    throw new MemoryValidationError(
      `MemoryRecord.lastAccessedAt must be a valid ISO 8601 date string or null. Got: ${record.lastAccessedAt}`,
    );
  }

  if (record.expiresAt != null && !isValidISODate(record.expiresAt)) {
    throw new MemoryValidationError(
      `MemoryRecord.expiresAt must be a valid ISO 8601 date string or null. Got: ${record.expiresAt}`,
    );
  }

  // derivedFrom: if present, must be array of non-empty strings
  if (record.derivedFrom != null) {
    if (!Array.isArray(record.derivedFrom)) {
      throw new MemoryValidationError(
        'MemoryRecord.derivedFrom must be an array of strings or undefined',
      );
    }
    for (const id of record.derivedFrom) {
      if (typeof id !== 'string' || id.length === 0) {
        throw new MemoryValidationError(
          'MemoryRecord.derivedFrom must contain non-empty strings',
        );
      }
    }
  }
}

/**
 * Check if a string is a valid ISO 8601 date.
 */
function isValidISODate(value: string): boolean {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
}
