-- PE 트랙 Domain Foundation 테이블 (2026-09-22)
--
-- DealMind PE Track — Phase 2 아키텍처 설계 §5, PR-A 구현 명세 §9의 결론을
-- 그대로 반영한다. MADeal/MADocument/MAReport/MAReportSection 4개 테이블과
-- 5개 enum을 신규 추가할 뿐, 기존 VC 테이블(Deal/Document/Report/
-- ReportSection/DealScore)의 컬럼은 단 하나도 변경하지 않는다.
--
-- LboModel/LboScenario/DebtTranche는 이 패치에 포함하지 않는다 — PR #90의
-- LBO Engine(src/lib/lbo-model.ts)은 Prisma에 의존하지 않는 순수 함수라
-- 아직 DB 테이블이 필요 없다(LBO integration PR에서 별도 추가 예정).
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MaDealType" AS ENUM ('BUYOUT', 'GROWTH_EQUITY', 'CARVE_OUT', 'MBO', 'SECONDARY', 'MINORITY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaDealStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaDocumentType" AS ENUM ('MANAGEMENT_ACCOUNTS', 'DD_MATERIAL', 'FINANCIAL_MODEL', 'CONTRACT', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaReportStatus" AS ENUM ('PENDING', 'DRAFT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaSectionKey" AS ENUM ('DEAL_OVERVIEW', 'FINANCIAL_NORMALIZATION', 'QOE_ANALYSIS', 'LBO_ANALYSIS', 'DD_SUMMARY', 'RETURNS_ANALYSIS', 'RISK_FACTORS', 'RECOMMENDATION');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MADeal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "dealType" "MaDealType" NOT NULL,
    "status" "MaDealStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MADeal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MADeal_userId_idx" ON "MADeal"("userId");
CREATE INDEX IF NOT EXISTS "MADeal_teamId_idx" ON "MADeal"("teamId");
CREATE INDEX IF NOT EXISTS "MADeal_status_idx" ON "MADeal"("status");

DO $$ BEGIN
    ALTER TABLE "MADeal" ADD CONSTRAINT "MADeal_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "MADeal" ADD CONSTRAINT "MADeal_teamId_fkey"
        FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MADocument" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MaDocumentType" NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "parsedText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MADocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MADocument_maDealId_idx" ON "MADocument"("maDealId");

DO $$ BEGIN
    ALTER TABLE "MADocument" ADD CONSTRAINT "MADocument_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAReport" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MaReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MAReport_maDealId_idx" ON "MAReport"("maDealId");
CREATE INDEX IF NOT EXISTS "MAReport_status_idx" ON "MAReport"("status");

DO $$ BEGIN
    ALTER TABLE "MAReport" ADD CONSTRAINT "MAReport_maDealId_fkey"
        FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MAReportSection" (
    "id" TEXT NOT NULL,
    "maReportId" TEXT NOT NULL,
    "sectionKey" "MaSectionKey" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAReportSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MAReportSection_maReportId_idx" ON "MAReportSection"("maReportId");

DO $$ BEGIN
    ALTER TABLE "MAReportSection" ADD CONSTRAINT "MAReportSection_maReportId_fkey"
        FOREIGN KEY ("maReportId") REFERENCES "MAReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
