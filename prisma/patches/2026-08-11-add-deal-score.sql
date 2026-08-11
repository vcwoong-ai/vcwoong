-- 딜 스코어링(투자 매력도 점수) 테이블 (2026-08-11)
--
-- 보고서 "품질 점수"(작문 품질)와 별개로, 딜 자체가 투자할 만한지를
-- 시장성·팀·제품·사업모델·재무·경쟁우위 6개 차원으로 평가해 저장한다.
-- 딜 1건당 최신 점수 하나만 유지(재계산 시 upsert로 덮어씀).
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE TABLE IF NOT EXISTS "DealScore" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "marketSize" DOUBLE PRECISION NOT NULL,
    "team" DOUBLE PRECISION NOT NULL,
    "product" DOUBLE PRECISION NOT NULL,
    "businessModel" DOUBLE PRECISION NOT NULL,
    "financials" DOUBLE PRECISION NOT NULL,
    "moat" DOUBLE PRECISION NOT NULL,
    "rationale" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DealScore_dealId_key" ON "DealScore"("dealId");

DO $$ BEGIN
    ALTER TABLE "DealScore" ADD CONSTRAINT "DealScore_dealId_fkey"
        FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
