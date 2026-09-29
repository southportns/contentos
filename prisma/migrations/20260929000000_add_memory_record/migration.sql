-- P0.6.3.2.1 — Add MemoryRecord Table
--
-- Creates the persistent storage for MemoryRecord entities.
-- This enables cross-session memory persistence via SQLite/Prisma.
--
-- Architecture:
--   MemoryRecord (domain model) → MemoryRecord (table) → SQLite
--
-- Key Design Decisions:
--   - ownerId is NOT NULL (persistent memories must have an owner)
--   - payload and derivedFrom stored as JSON
--   - Composite indexes for efficient owner-scoped queries
--
-- Safety: This migration only ADDS a table. No existing tables are modified.

CREATE TABLE "MemoryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "topicId" TEXT,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "derivedFrom" TEXT,
    "confidence" REAL NOT NULL,
    "importance" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastAccessedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active'
);

-- Indexes for common query patterns
CREATE INDEX "MemoryRecord_ownerId_idx" ON "MemoryRecord"("ownerId");
CREATE INDEX "MemoryRecord_projectId_idx" ON "MemoryRecord"("projectId");
CREATE INDEX "MemoryRecord_topicId_idx" ON "MemoryRecord"("topicId");
CREATE INDEX "MemoryRecord_scope_idx" ON "MemoryRecord"("scope");
CREATE INDEX "MemoryRecord_status_idx" ON "MemoryRecord"("status");
CREATE INDEX "MemoryRecord_kind_idx" ON "MemoryRecord"("kind");

-- Composite indexes for owner-scoped queries
CREATE INDEX "MemoryRecord_ownerId_scope_idx" ON "MemoryRecord"("ownerId", "scope");
CREATE INDEX "MemoryRecord_ownerId_projectId_idx" ON "MemoryRecord"("ownerId", "projectId");
CREATE INDEX "MemoryRecord_ownerId_topicId_idx" ON "MemoryRecord"("ownerId", "topicId");
