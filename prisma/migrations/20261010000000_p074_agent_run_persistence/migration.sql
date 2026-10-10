-- P0.7.4 — ContextOS Agent Run Persistence
-- Extends AgentRun with owner isolation, purpose, and context/decision/outcome IDs.
-- All new fields are NULLABLE to preserve backward compatibility with existing records.

-- Add ownerId (nullable — existing records have no owner context)
ALTER TABLE "AgentRun" ADD COLUMN "ownerId" TEXT;

-- Add projectId (nullable — existing records may not map to a project)
ALTER TABLE "AgentRun" ADD COLUMN "projectId" TEXT;

-- Add purpose (nullable — existing records have no purpose field)
ALTER TABLE "AgentRun" ADD COLUMN "purpose" TEXT;

-- Add contextIds (nullable JSON array of context IDs)
ALTER TABLE "AgentRun" ADD COLUMN "contextIds" TEXT;

-- Add decisionIds (nullable JSON array of decision IDs)
ALTER TABLE "AgentRun" ADD COLUMN "decisionIds" TEXT;

-- Add outcomeIds (nullable JSON array of outcome IDs)
ALTER TABLE "AgentRun" ADD COLUMN "outcomeIds" TEXT;

-- Indexes for owner-scoped queries
CREATE INDEX "AgentRun_ownerId_idx" ON "AgentRun"("ownerId");
CREATE INDEX "AgentRun_ownerId_status_idx" ON "AgentRun"("ownerId", "status");
CREATE INDEX "AgentRun_ownerId_projectId_idx" ON "AgentRun"("ownerId", "projectId");
CREATE INDEX "AgentRun_ownerId_topicId_idx" ON "AgentRun"("ownerId", "topicId");
