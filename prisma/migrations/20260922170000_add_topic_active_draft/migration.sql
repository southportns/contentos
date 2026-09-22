-- P0.4.8 — Add Topic.activeDraftId for Active Draft tracking
-- Records which Draft is the current working version for a Topic.
-- onDelete: SetNull — if the active draft is deleted, Topic falls back to latest version.

-- Add activeDraftId column (nullable — topics with no explicit active draft use latest version)
ALTER TABLE "Topic" ADD COLUMN "activeDraftId" TEXT;

-- Create index on activeDraftId for active draft lookups
CREATE INDEX "Topic_activeDraftId_idx" ON "Topic"("activeDraftId");
