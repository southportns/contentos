-- P0.4.8.1 — Harden Topic.activeDraftId Foreign Key
--
-- Problem: Topic.activeDraftId column exists (added by P0.4.8 migration) but
--          the foreign key constraint to Draft.id was never created.
--          This means referential integrity was not enforced at the DB level.
--
-- Solution: Rebuild Topic table with proper FK constraint.
--           SQLite does not support ALTER TABLE ADD CONSTRAINT for FK.
--           We use the standard SQLite table-rebuild pattern:
--             1. Disable foreign keys
--             2. Create new_Topic with FK + unique
--             3. Copy all data
--             4. Drop old Topic
--             5. Rename new_Topic to Topic
--             6. Recreate all indexes
--             7. Re-enable foreign keys

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- Step 1: Create new Topic table with FK to Draft.id and unique constraint on activeDraftId
CREATE TABLE "new_Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "category" TEXT,
    "platform" TEXT,
    "audience" TEXT,
    "contentType" TEXT,
    "goal" TEXT,
    "tone" TEXT,
    "constraints" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "personaId" TEXT,
    "activeDraftId" TEXT,
    CONSTRAINT "new_Topic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "new_Topic_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "new_Topic_activeDraftId_fkey" FOREIGN KEY ("activeDraftId") REFERENCES "Draft" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Step 2: Copy all existing Topic data
INSERT INTO "new_Topic" ("id", "projectId", "topic", "category", "platform", "audience", "contentType", "goal", "tone", "constraints", "status", "createdAt", "updatedAt", "personaId", "activeDraftId")
SELECT "id", "projectId", "topic", "category", "platform", "audience", "contentType", "goal", "tone", "constraints", "status", "createdAt", "updatedAt", "personaId", "activeDraftId" FROM "Topic";

-- Step 3: Drop old Topic table
-- Note: With PRAGMA foreign_keys=OFF, child tables' FK references remain.
-- They will reference the renamed table once we complete the operation.
DROP TABLE "Topic";

-- Step 4: Rename new_Topic to Topic
ALTER TABLE "new_Topic" RENAME TO "Topic";

-- Step 5: Recreate indexes
CREATE INDEX "Topic_projectId_idx" ON "Topic"("projectId");
CREATE INDEX "Topic_personaId_idx" ON "Topic"("personaId");
CREATE INDEX "Topic_activeDraftId_idx" ON "Topic"("activeDraftId");

-- Step 6: Unique index for activeDraftId (enforces @unique at DB level)
-- Each Draft can be active for at most one Topic
CREATE UNIQUE INDEX "Topic_activeDraftId_key" ON "Topic"("activeDraftId");

COMMIT;

PRAGMA foreign_keys=ON;
