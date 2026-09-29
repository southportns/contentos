/**
 * P0.6.3.2.1 — Memory Persistence Validation Tests
 *
 * Tests the validateMemoryRecord function to ensure invalid data
 * is rejected before reaching the database.
 *
 * Covers:
 * - Valid record passes validation
 * - id validation (non-empty)
 * - kind validation (must be valid MemoryKind)
 * - type validation (non-empty)
 * - scope validation (must be valid MemoryScope)
 * - ownerId validation (non-empty)
 * - source/sourceType validation (non-empty)
 * - confidence range [0, 1]
 * - importance range [0, 1]
 * - version >= 1
 * - accessCount >= 0
 * - status validation
 * - ISO timestamp validation
 * - derivedFrom validation
 */

import { describe, it, expect } from 'vitest';
import { validateMemoryRecord } from '../memory-persistence-validation';
import { MemoryValidationError } from '../memory-persistence-types';
import type { MemoryRecord } from '../../memory-record';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createValidRecord(): MemoryRecord {
  return {
    id: 'mem_valid_001',
    kind: 'static',
    type: 'writing_profile',
    payload: { data: 'test' },
    scope: 'global',
    ownerId: 'user_123',
    projectId: null,
    topicId: null,
    source: 'test_source',
    sourceType: 'test_type',
    derivedFrom: ['mem_parent'],
    confidence: 0.5,
    importance: 0.5,
    createdAt: '2026-09-29T10:00:00.000Z',
    updatedAt: '2026-09-29T10:00:00.000Z',
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: null,
    version: 1,
    status: 'active',
  };
}

function expectValidationError(record: MemoryRecord, expectedMessage?: string): void {
  try {
    validateMemoryRecord(record);
    throw new Error('Expected validation to fail but it passed');
  } catch (error) {
    expect(error).toBeInstanceOf(MemoryValidationError);
    if (expectedMessage) {
      expect((error as MemoryValidationError).message).toContain(expectedMessage);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Valid Record
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — valid records', () => {
  it('should pass validation for a valid record', () => {
    const record = createValidRecord();
    expect(() => validateMemoryRecord(record)).not.toThrow();
  });

  it('should accept all valid MemoryKind values', () => {
    const kinds = ['static', 'dynamic', 'episodic', 'semantic'] as const;
    for (const kind of kinds) {
      const record = createValidRecord();
      record.kind = kind;
      expect(() => validateMemoryRecord(record)).not.toThrow();
    }
  });

  it('should accept all valid MemoryScope values', () => {
    const scopes = ['global', 'project', 'topic', 'session'] as const;
    for (const scope of scopes) {
      const record = createValidRecord();
      record.scope = scope;
      expect(() => validateMemoryRecord(record)).not.toThrow();
    }
  });

  it('should accept all valid MemoryStatus values', () => {
    const statuses = ['active', 'superseded', 'expired', 'archived'] as const;
    for (const status of statuses) {
      const record = createValidRecord();
      record.status = status;
      expect(() => validateMemoryRecord(record)).not.toThrow();
    }
  });

  it('should accept boundary values for confidence and importance', () => {
    const record = createValidRecord();
    record.confidence = 0;
    record.importance = 1;
    expect(() => validateMemoryRecord(record)).not.toThrow();

    record.confidence = 1;
    record.importance = 0;
    expect(() => validateMemoryRecord(record)).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// id Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — id validation', () => {
  it('should reject empty id', () => {
    const record = createValidRecord();
    record.id = '';
    expectValidationError(record, 'id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// kind Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — kind validation', () => {
  it('should reject invalid kind', () => {
    const record = createValidRecord();
    record.kind = 'invalid_kind' as MemoryRecord['kind'];
    expectValidationError(record, 'kind');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// type Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — type validation', () => {
  it('should reject empty type', () => {
    const record = createValidRecord();
    record.type = '';
    expectValidationError(record, 'type');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// scope Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — scope validation', () => {
  it('should reject invalid scope', () => {
    const record = createValidRecord();
    record.scope = 'invalid_scope' as MemoryRecord['scope'];
    expectValidationError(record, 'scope');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ownerId Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — ownerId validation', () => {
  it('should reject empty ownerId', () => {
    const record = createValidRecord();
    record.ownerId = '';
    expectValidationError(record, 'ownerId');
  });

  it('should reject null ownerId', () => {
    const record = createValidRecord();
    record.ownerId = null;
    expectValidationError(record, 'ownerId');
  });

  it('should reject undefined ownerId', () => {
    const record = createValidRecord();
    record.ownerId = undefined;
    expectValidationError(record, 'ownerId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// source / sourceType Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — source/sourceType validation', () => {
  it('should reject empty source', () => {
    const record = createValidRecord();
    record.source = '';
    expectValidationError(record, 'source');
  });

  it('should reject empty sourceType', () => {
    const record = createValidRecord();
    record.sourceType = '';
    expectValidationError(record, 'sourceType');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// confidence / importance Range
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — confidence/importance range', () => {
  it('should reject confidence < 0', () => {
    const record = createValidRecord();
    record.confidence = -0.1;
    expectValidationError(record, 'confidence');
  });

  it('should reject confidence > 1', () => {
    const record = createValidRecord();
    record.confidence = 1.1;
    expectValidationError(record, 'confidence');
  });

  it('should reject NaN confidence', () => {
    const record = createValidRecord();
    record.confidence = NaN;
    expectValidationError(record, 'confidence');
  });

  it('should reject importance < 0', () => {
    const record = createValidRecord();
    record.importance = -0.1;
    expectValidationError(record, 'importance');
  });

  it('should reject importance > 1', () => {
    const record = createValidRecord();
    record.importance = 1.1;
    expectValidationError(record, 'importance');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// version / accessCount
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — version/accessCount', () => {
  it('should reject version < 1', () => {
    const record = createValidRecord();
    record.version = 0;
    expectValidationError(record, 'version');
  });

  it('should reject non-integer version', () => {
    const record = createValidRecord();
    record.version = 1.5;
    expectValidationError(record, 'version');
  });

  it('should reject negative accessCount', () => {
    const record = createValidRecord();
    record.accessCount = -1;
    expectValidationError(record, 'accessCount');
  });

  it('should reject non-integer accessCount', () => {
    const record = createValidRecord();
    record.accessCount = 1.5;
    expectValidationError(record, 'accessCount');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// status Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — status validation', () => {
  it('should reject invalid status', () => {
    const record = createValidRecord();
    record.status = 'invalid_status' as MemoryRecord['status'];
    expectValidationError(record, 'status');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Timestamp Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — timestamp validation', () => {
  it('should reject invalid createdAt', () => {
    const record = createValidRecord();
    record.createdAt = 'not-a-date';
    expectValidationError(record, 'createdAt');
  });

  it('should reject invalid updatedAt', () => {
    const record = createValidRecord();
    record.updatedAt = 'not-a-date';
    expectValidationError(record, 'updatedAt');
  });

  it('should reject invalid lastAccessedAt', () => {
    const record = createValidRecord();
    record.lastAccessedAt = 'not-a-date';
    expectValidationError(record, 'lastAccessedAt');
  });

  it('should reject invalid expiresAt', () => {
    const record = createValidRecord();
    record.expiresAt = 'not-a-date';
    expectValidationError(record, 'expiresAt');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// derivedFrom Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('validateMemoryRecord — derivedFrom validation', () => {
  it('should accept undefined derivedFrom', () => {
    const record = createValidRecord();
    record.derivedFrom = undefined;
    expect(() => validateMemoryRecord(record)).not.toThrow();
  });

  it('should accept empty derivedFrom array', () => {
    const record = createValidRecord();
    record.derivedFrom = [];
    expect(() => validateMemoryRecord(record)).not.toThrow();
  });

  it('should reject derivedFrom with empty string', () => {
    const record = createValidRecord();
    record.derivedFrom = ['mem_1', ''];
    expectValidationError(record, 'derivedFrom');
  });
});
