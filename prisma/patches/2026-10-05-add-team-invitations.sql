-- Local additive PostgreSQL rollout artifact; no owner inference or role backfill.
DO $$ BEGIN
  CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "TeamInvitation" (
  "id" TEXT PRIMARY KEY,
  "teamId" TEXT NOT NULL REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invitedByUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "targetUserId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
  "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "TeamInvitation_teamId_targetUserId_status_idx" ON "TeamInvitation"("teamId","targetUserId","status");
CREATE INDEX IF NOT EXISTS "TeamInvitation_targetUserId_status_expiresAt_idx" ON "TeamInvitation"("targetUserId","status","expiresAt");
