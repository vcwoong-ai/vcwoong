-- Additive metadata only. Applying this patch does not enable billing or register cron.
CREATE TABLE IF NOT EXISTS "BillingMaintenanceState" (
  "id" TEXT PRIMARY KEY,
  "renewalCursor" TEXT,
  "reconciliationCursor" TEXT,
  "reconcileFirst" BOOLEAN NOT NULL DEFAULT TRUE,
  "workerToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "failureStreak" INTEGER NOT NULL DEFAULT 0,
  "lastStartedAt" TIMESTAMP(3),
  "lastCompletedAt" TIMESTAMP(3),
  "lastOutcome" TEXT NOT NULL DEFAULT 'NEVER'
);
