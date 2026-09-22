-- P0.4.4 — Add unique constraint on Draft(topicId, version)
-- Ensures no duplicate versions exist within the same topic.
-- Different topics may use the same version numbers.

-- Create unique index for the @@unique([topicId, version]) constraint
CREATE UNIQUE INDEX "Draft_topicId_version_key" ON "Draft"("topicId", "version");
