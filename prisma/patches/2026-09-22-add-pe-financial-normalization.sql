-- PE 재무 정규화 계층 테이블 (2026-09-22)
--
-- DealMind PE Track PR-B. MAFinancialPeriod/MAFinancialLineItem/
-- MAFinancialAdjustment 3개 테이블과 3개 enum을 신규 추가한다. PR-A의
-- MADeal 외에는 어떤 기존 테이블도 참조·변경하지 않는다 — 기존 VC 테이블
-- (Deal/Document/Report/ReportSection/DealScore)과 기존 PE 테이블
-- (MADocument/MAReport/MAReportSection)의 컬럼은 하나도 변경하지 않는다.
--
-- DART adapter, QoE 분류 로직, LBO 연결은 이 패치에 포함하지 않는다 —
-- MAFinancialAdjustment는 향후 QoE(PR-D)가 그대로 확장해 쓸 수 있는
-- 최소 구조만 갖춘다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MaFinancialPeriodType" AS ENUM ('ANNUAL', 'QUARTERLY', 'TTM');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaFinancialStatementType" AS ENUM ('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaFinancialSourceType" AS ENUM ('UPLOADED_DOCUMENT', 'EXCEL', 'DART', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAFinancialPeriod" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" "MaFinancialPeriodType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialPeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MAFinancialPeriod_maDealId_fiscalYear_periodType_key" ON "MAFinancialPeriod"("maDealId", "fiscalYear", "periodType");
CREATE INDEX IF NOT EXISTS "MAFinancialPeriod_maDealId_idx" ON "MAFinancialPeriod"("maDealId");
CREATE INDEX IF NOT EXISTS "MAFinancialPeriod_fiscalYear_idx" ON "MAFinancialPeriod"("fiscalYear");

DO $$ BEGIN
    ALTER TABLE "MAFinancialPeriod" ADD CONSTRAINT "MAFinancialPeriod_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAFinancialLineItem" (
    "id" TEXT NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "statementType" "MaFinancialStatementType" NOT NULL,
    "lineItem" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "source" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceLocation" TEXT,
    "isNormalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MAFinancialLineItem_financialPeriodId_idx" ON "MAFinancialLineItem"("financialPeriodId");
CREATE INDEX IF NOT EXISTS "MAFinancialLineItem_financialPeriodId_lineItem_idx" ON "MAFinancialLineItem"("financialPeriodId", "lineItem");

DO $$ BEGIN
    ALTER TABLE "MAFinancialLineItem" ADD CONSTRAINT "MAFinancialLineItem_financialPeriodId_fkey"
        FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAFinancialAdjustment" (
    "id" TEXT NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "reportedValue" DOUBLE PRECISION NOT NULL,
    "adjustmentValue" DOUBLE PRECISION NOT NULL,
    "normalizedValue" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MAFinancialAdjustment_financialPeriodId_idx" ON "MAFinancialAdjustment"("financialPeriodId");

DO $$ BEGIN
    ALTER TABLE "MAFinancialAdjustment" ADD CONSTRAINT "MAFinancialAdjustment_financialPeriodId_fkey"
        FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
