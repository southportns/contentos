-- P0.3.8.4.1 — Add server-side approval state to ContentStrategy

ALTER TABLE "ContentStrategy" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "ContentStrategy" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "ContentStrategy" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "ContentStrategy" ADD COLUMN "rejectedAt" DATETIME;

CREATE INDEX "ContentStrategy_approvalStatus_idx" ON "ContentStrategy"("approvalStatus");
