-- P0.4.6 — Add draft change metadata for version evolution tracking
-- Records why a version was created (changeType + changeReason).
-- Existing drafts get changeType = 'INITIAL', changeReason = NULL.

ALTER TABLE "Draft"
ADD COLUMN "changeType" TEXT NOT NULL DEFAULT 'INITIAL';

ALTER TABLE "Draft"
ADD COLUMN "changeReason" TEXT;
