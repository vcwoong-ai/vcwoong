-- PE IC Committee Pack + Review Sign-off (PR #110, 2026-09-29)
--
-- PEICReview / PEICReviewComment 테이블 2개와 enum 2개만 신규 추가한다.
-- Committee Pack 자체(readiness/thesis/drivers/breakers/financial/QoE/LBO/
-- DD/evidence/review)는 어디에도 저장하지 않는다 — 오직 사람의 워크플로
-- 행동(리뷰어 서명 상태, 메모)만 저장한다(PR #110 핵심 원칙 4/5).
--
-- 기존 테이블의 컬럼은 단 하나도 변경하지 않는다. MADeal/User에는 새
-- 테이블을 향한 반대편 관계(FK)만 생긴다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS/DO $$ EXCEPTION으로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PEICReviewSignoffStatus" AS ENUM ('NOT_REVIEWED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REVIEWED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PEICReviewCommentTargetType" AS ENUM ('COMMITTEE_PACK', 'IC_QUESTION', 'REVIEW_ITEM', 'EVIDENCE_REQUEST');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEICReview" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "PEICReviewSignoffStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "comment" TEXT,
    "reviewedFingerprint" TEXT,
    "reviewedFingerprintBreakdown" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEICReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PEICReview_maDealId_reviewerId_key" ON "PEICReview"("maDealId", "reviewerId");
CREATE INDEX IF NOT EXISTS "PEICReview_maDealId_idx" ON "PEICReview"("maDealId");

DO $$ BEGIN
    ALTER TABLE "PEICReview" ADD CONSTRAINT "PEICReview_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICReview" ADD CONSTRAINT "PEICReview_reviewerId_fkey"
        FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEICReviewComment" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewId" TEXT,
    "authorId" TEXT NOT NULL,
    "targetType" "PEICReviewCommentTargetType" NOT NULL,
    "targetId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICReviewComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PEICReviewComment_maDealId_idx" ON "PEICReviewComment"("maDealId");
CREATE INDEX IF NOT EXISTS "PEICReviewComment_targetType_targetId_idx" ON "PEICReviewComment"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "PEICReviewComment_reviewId_idx" ON "PEICReviewComment"("reviewId");

DO $$ BEGIN
    ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_reviewId_fkey"
        FOREIGN KEY ("reviewId") REFERENCES "PEICReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
