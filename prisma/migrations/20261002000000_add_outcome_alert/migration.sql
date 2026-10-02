-- P0.6.5.3 — Outcome Alert
-- Creates the OutcomeAlert table with indexes and unique constraint.

CREATE TABLE "OutcomeAlert" (
    "id"                TEXT NOT NULL,
    "ruleId"            TEXT NOT NULL,
    "outcomeId"         TEXT NOT NULL,
    "ownerId"           TEXT NOT NULL,
    "projectId"         TEXT,
    "topicId"           TEXT,
    "severity"          TEXT NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'open',
    "title"             TEXT NOT NULL,
    "message"           TEXT NOT NULL,
    "matchedConditions" TEXT,
    "triggeredAt"       DATETIME NOT NULL,
    "acknowledgedAt"    DATETIME,
    "resolvedAt"        DATETIME,
    "suppressedAt"      DATETIME,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL,
    "version"           INTEGER NOT NULL DEFAULT 1,
    "fingerprint"       TEXT NOT NULL,

    PRIMARY KEY ("id"),
    UNIQUE ("fingerprint")
);

CREATE INDEX "OutcomeAlert_ownerId_idx" ON "OutcomeAlert"("ownerId");
CREATE INDEX "OutcomeAlert_ownerId_projectId_idx" ON "OutcomeAlert"("ownerId", "projectId");
CREATE INDEX "OutcomeAlert_ownerId_topicId_idx" ON "OutcomeAlert"("ownerId", "topicId");
CREATE INDEX "OutcomeAlert_ownerId_status_idx" ON "OutcomeAlert"("ownerId", "status");
CREATE INDEX "OutcomeAlert_ownerId_severity_idx" ON "OutcomeAlert"("ownerId", "severity");
CREATE INDEX "OutcomeAlert_ruleId_idx" ON "OutcomeAlert"("ruleId");
CREATE INDEX "OutcomeAlert_outcomeId_idx" ON "OutcomeAlert"("outcomeId");
