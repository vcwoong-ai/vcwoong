-- Additive only. No backfill, quota reset, customer data or operating execution.
CREATE TABLE IF NOT EXISTS "ReportQuotaAdmission" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reportId" TEXT UNIQUE REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "admissionRef" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ReportQuotaAdmission_userId_createdAt_idx"
  ON "ReportQuotaAdmission"("userId", "createdAt");
