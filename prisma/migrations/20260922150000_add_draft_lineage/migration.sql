-- P0.4.5 — Add parentDraftId self relation for Draft lineage tracking
-- Records which Draft version a new Draft was created from.
-- onDelete: SetNull — if parent is deleted, child remains with parentDraftId = null.

-- Add parentDraftId column (nullable — initial drafts have no parent)
ALTER TABLE "Draft" ADD COLUMN "parentDraftId" TEXT;

-- Create index on parentDraftId for lineage queries
CREATE INDEX "Draft_parentDraftId_idx" ON "Draft"("parentDraftId");
