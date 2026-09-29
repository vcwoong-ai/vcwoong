-- PE IC Review + Evidence Resolution Workflow — Evidence Request table (PR #109, 2026-09-29)
--
-- PEEvidenceRequest 테이블 1개와 enum 2개만 신규 추가한다. 기존 VC 테이블/
-- PE 재무·QoE·LBO·DD·Evidence 테이블(MADeal/MADocument/PEDDCase/PEDDFinding/
-- PEEvidence 등)의 기존 컬럼은 단 하나도 변경하지 않는다 — MADocument/
-- PEDDCase에는 새 테이블을 향한 반대편 관계(FK)만 생긴다.
--
-- "review item"(readiness blocker/누락 정보/DD finding에서 파생된 항목)은
-- 여전히 저장하지 않는다 — 이 테이블은 오직 "사람이 실제로 근거를
-- 요청했다"는 워크플로 사실만 저장한다(PR #109 핵심 원칙 5).
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS/DO $$ EXCEPTION으로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PEEvidenceRequestStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PEICQuestionPriorityDb" AS ENUM ('P0', 'P1', 'P2');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEEvidenceRequest" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "reviewItemSourceType" TEXT NOT NULL,
    "reviewItemSourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestedDocument" TEXT,
    "requestedFact" TEXT,
    "reason" TEXT NOT NULL,
    "priority" "PEICQuestionPriorityDb" NOT NULL,
    "status" "PEEvidenceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "linkedDocumentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEEvidenceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PEEvidenceRequest_ddCaseId_idx" ON "PEEvidenceRequest"("ddCaseId");
CREATE INDEX IF NOT EXISTS "PEEvidenceRequest_reviewItemSourceType_reviewItemSourceId_idx" ON "PEEvidenceRequest"("reviewItemSourceType", "reviewItemSourceId");
CREATE INDEX IF NOT EXISTS "PEEvidenceRequest_linkedDocumentId_idx" ON "PEEvidenceRequest"("linkedDocumentId");

DO $$ BEGIN
    ALTER TABLE "PEEvidenceRequest" ADD CONSTRAINT "PEEvidenceRequest_ddCaseId_fkey"
        FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEEvidenceRequest" ADD CONSTRAINT "PEEvidenceRequest_linkedDocumentId_fkey"
        FOREIGN KEY ("linkedDocumentId") REFERENCES "MADocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
