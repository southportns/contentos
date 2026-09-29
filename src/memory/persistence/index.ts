/**
 * P0.6.3.2.1 — Memory Persistence Layer
 *
 * Provides persistent storage for MemoryRecords via Prisma/SQLite.
 *
 * Architecture:
 *   MemoryRecord (domain) ↔ MemoryRecordRow (persistence) ↔ Prisma → SQLite
 */

// Types
export type { MemoryRecordRow, CreateMemoryRecordData } from './memory-persistence-types';
export {
  MemoryConcurrencyError,
  MemoryNotFoundError,
  MemoryValidationError,
} from './memory-persistence-types';

// Mapper
export {
  memoryRecordToPersistence,
  persistenceToMemoryRecord,
} from './memory-persistence-mapper';

// Validation
export { validateMemoryRecord } from './memory-persistence-validation';

// Store Interface
export type { MemoryStore } from './memory-store';

// Prisma Implementation
export { PrismaMemoryStore } from './prisma-memory-store';
