-- PE DD & Evidence Persistence Foundation (PR #105, 2026-09-28)
--
-- PEDDCase/PEDDFinding/PEEvidence 3개 테이블과 4개 enum을 신규 추가할 뿐,
-- 기존 VC 테이블/PE 재무·QoE·LBO 테이블(MADeal/MADocument/MAFinancialPeriod/
-- MAFinancialLineItem/MAFinancialAdjustment 등)의 컬럼은 단 하나도 변경하지
-- 않는다. MADeal/MADocument/MAFinancialPeriod에는 새 테이블을 향한 반대편
-- 관계(FK)만 생긴다 — 이 관계는 참조하는 쪽(PEDDFinding/PEEvidence)에만
-- 컬럼을 추가하므로 기존 테이블 자체는 스키마 변경이 필요 없다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS/DO $$ EXCEPTION으로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PEDDCaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PEDDCategory" AS ENUM ('FINANCIAL', 'COMMERCIAL', 'OPERATIONAL', 'LEGAL', 'TAX', 'HR', 'TECHNOLOGY', 'IT_SECURITY', 'REGULATORY', 'ESG', 'MANAGEMENT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PEDDSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "PEDDFindingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CONFIRMED', 'MITIGATED', 'ACCEPTED', 'REJECTED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEDDCase" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "status" "PEDDCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEDDCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PEDDCase_maDealId_key" ON "PEDDCase"("maDealId");
CREATE INDEX IF NOT EXISTS "PEDDCase_maDealId_idx" ON "PEDDCase"("maDealId");

DO $$ BEGIN
    ALTER TABLE "PEDDCase" ADD CONSTRAINT "PEDDCase_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEDDFinding" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "category" "PEDDCategory" NOT NULL,
    "subCategory" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "PEDDSeverity" NOT NULL,
    "status" "PEDDFindingStatus" NOT NULL DEFAULT 'DRAFT',
    "financialPeriodId" TEXT,
    "owner" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEDDFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PEDDFinding_ddCaseId_idx" ON "PEDDFinding"("ddCaseId");
CREATE INDEX IF NOT EXISTS "PEDDFinding_financialPeriodId_idx" ON "PEDDFinding"("financialPeriodId");
CREATE INDEX IF NOT EXISTS "PEDDFinding_status_idx" ON "PEDDFinding"("status");

DO $$ BEGIN
    ALTER TABLE "PEDDFinding" ADD CONSTRAINT "PEDDFinding_ddCaseId_fkey"
        FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEDDFinding" ADD CONSTRAINT "PEDDFinding_financialPeriodId_fkey"
        FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PEEvidence" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "findingId" TEXT,
    "documentId" TEXT,
    "sourceType" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceLocation" TEXT,
    "externalReference" TEXT,
    "locator" TEXT,
    "excerpt" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PEEvidence_ddCaseId_idx" ON "PEEvidence"("ddCaseId");
CREATE INDEX IF NOT EXISTS "PEEvidence_findingId_idx" ON "PEEvidence"("findingId");
CREATE INDEX IF NOT EXISTS "PEEvidence_documentId_idx" ON "PEEvidence"("documentId");

DO $$ BEGIN
    ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_ddCaseId_fkey"
        FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_findingId_fkey"
        FOREIGN KEY ("findingId") REFERENCES "PEDDFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "MADocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
