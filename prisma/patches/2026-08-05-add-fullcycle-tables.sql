-- Neon 프로덕션 DB에 누락된 풀사이클 테이블 추가 (2026-08-05)
--
-- 원인: prisma/db-init.sql 이 Fund/PortfolioCompany/CompanyKPI/Milestone/
-- PortfolioUpdate/LpReport/InboundDeal 7개 테이블이 추가되기 전 버전이라,
-- Neon 마이그레이션 때 이 테이블들이 생성되지 않았음. 대시보드가
-- portfolioCompany.findMany()를 항상 호출하기 때문에 로그인 직후
-- "Server Components render" 500 에러로 이어짐(회원가입 자체가 아니라
-- 가입 후 자동 로그인 → /dashboard 리다이렉트에서 실패).
--
-- 재실행해도 안전(멱등): 이미 있는 타입/테이블/제약조건은 건너뜀.
-- Neon Console → SQL Editor 에서 전체 실행하세요.

DO $$ BEGIN
    CREATE TYPE "PortfolioStatus" AS ENUM ('ACTIVE', 'WATCH', 'RISK', 'EXITED', 'WRITTEN_OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'DELAYED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "DealSourceType" AS ENUM ('INBOUND', 'REFERRAL', 'DEMO_DAY', 'ACCELERATOR', 'OUTREACH', 'PARTNER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "InboundStatus" AS ENUM ('NEW', 'REVIEWING', 'QUALIFIED', 'PROMOTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Fund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vintageYear" INTEGER NOT NULL,
    "fundSize" DOUBLE PRECISION NOT NULL,
    "paidIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "managementFee" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PortfolioCompany" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "fundId" TEXT,
    "companyName" TEXT NOT NULL,
    "sector" "DealSector" NOT NULL,
    "investedAt" TIMESTAMP(3) NOT NULL,
    "investAmount" DOUBLE PRECISION NOT NULL,
    "ownershipPercent" DOUBLE PRECISION NOT NULL,
    "entryValuation" DOUBLE PRECISION NOT NULL,
    "currentValuation" DOUBLE PRECISION,
    "realizedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PortfolioStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompanyKPI" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyKPI_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Milestone" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PortfolioUpdate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "highlights" TEXT,
    "concerns" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LpReport" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metrics" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LpReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InboundDeal" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "sector" "DealSector" NOT NULL DEFAULT 'GENERAL',
    "source" "DealSourceType" NOT NULL DEFAULT 'OTHER',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "summary" TEXT,
    "rawText" TEXT,
    "screeningScore" INTEGER,
    "screeningNotes" TEXT,
    "status" "InboundStatus" NOT NULL DEFAULT 'NEW',
    "dealId" TEXT,
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundDeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioCompany_dealId_key" ON "PortfolioCompany"("dealId");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyKPI_companyId_period_metric_key" ON "CompanyKPI"("companyId", "period", "metric");
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioUpdate_companyId_period_key" ON "PortfolioUpdate"("companyId", "period");

DO $$ BEGIN
    ALTER TABLE "Fund" ADD CONSTRAINT "Fund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Fund" ADD CONSTRAINT "Fund_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PortfolioCompany" ADD CONSTRAINT "PortfolioCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PortfolioCompany" ADD CONSTRAINT "PortfolioCompany_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PortfolioCompany" ADD CONSTRAINT "PortfolioCompany_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PortfolioCompany" ADD CONSTRAINT "PortfolioCompany_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CompanyKPI" ADD CONSTRAINT "CompanyKPI_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PortfolioUpdate" ADD CONSTRAINT "PortfolioUpdate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "PortfolioCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "LpReport" ADD CONSTRAINT "LpReport_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "InboundDeal" ADD CONSTRAINT "InboundDeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "InboundDeal" ADD CONSTRAINT "InboundDeal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
