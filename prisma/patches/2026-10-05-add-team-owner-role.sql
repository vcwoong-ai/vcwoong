-- Additive PostgreSQL patch. No inferred owner or role backfill for existing teams.
-- Apply only through an explicitly approved database rollout after schema review.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "teamRole" "UserRole";
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;
CREATE INDEX IF NOT EXISTS "Team_ownerUserId_idx" ON "Team"("ownerUserId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Team_ownerUserId_fkey' AND conrelid = '"Team"'::regclass) THEN
    ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
