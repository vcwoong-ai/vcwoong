-- PE IC Review Audit Trail (PR #111, 2026-09-29)
--
-- PEICReviewSnapshot(불변 검토 완료 스냅샷) + PEICAuditEvent(append-only
-- 이벤트 로그) 테이블 2개와 enum 1개만 신규 추가한다. 기존 PEICReview/
-- PEICReviewComment(PR #110)를 포함해 다른 테이블의 컬럼은 단 하나도
-- 변경하지 않는다 — MADeal/User에는 새 테이블을 향한 반대편 관계(FK)만
-- 생긴다.
--
-- PEICReviewSnapshot은 REVIEWED로 전환할 때마다(재검토 포함) 새 행이
-- insert되고, 그 이후 애플리케이션 코드는 절대 UPDATE/DELETE하지 않는다
-- (PR #111 §6 불변성 원칙). version은 딜 하나당 단조 증가한다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS/DO $$ EXCEPTION으로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PEICAuditEventType" AS ENUM ('REVIEW_STARTED', 'CHANGE_REQUESTED', 'REVIEW_COMPLETED', 'COMMENT_ADDED', 'EVIDENCE_REQUESTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEICReviewSnapshot" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "fingerprintBreakdown" TEXT NOT NULL,
    "openQuestionCodes" TEXT NOT NULL,
    "openQuestionCount" INTEGER NOT NULL,
    "openP0Count" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICReviewSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PEICReviewSnapshot_maDealId_version_key" ON "PEICReviewSnapshot"("maDealId", "version");
CREATE INDEX IF NOT EXISTS "PEICReviewSnapshot_maDealId_createdAt_idx" ON "PEICReviewSnapshot"("maDealId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "PEICReviewSnapshot" ADD CONSTRAINT "PEICReviewSnapshot_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICReviewSnapshot" ADD CONSTRAINT "PEICReviewSnapshot_reviewerId_fkey"
        FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEICAuditEvent" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewSnapshotId" TEXT,
    "actorId" TEXT NOT NULL,
    "eventType" "PEICAuditEventType" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PEICAuditEvent_maDealId_createdAt_idx" ON "PEICAuditEvent"("maDealId", "createdAt");
CREATE INDEX IF NOT EXISTS "PEICAuditEvent_actorId_createdAt_idx" ON "PEICAuditEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "PEICAuditEvent_reviewSnapshotId_idx" ON "PEICAuditEvent"("reviewSnapshotId");

DO $$ BEGIN
    ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_actorId_fkey"
        FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_reviewSnapshotId_fkey"
        FOREIGN KEY ("reviewSnapshotId") REFERENCES "PEICReviewSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
