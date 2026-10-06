-- Local additive rollout only. No legacy worker ownership is inferred.
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "generationClaim" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "generationLeaseExpiresAt" TIMESTAMP(3);
