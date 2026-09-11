-- 근거 추적(evidence.ts) AI 보강 검증 캐시 테이블 (2026-09-11)
--
-- evidence.ts의 deterministic 매칭(숫자 색인·키워드 겹침)으로 근거를 못
-- 찾은(UNSUPPORTED) claim만, 최대 5개까지 AI로 재확인한 결과를 저장한다.
-- ReportDeepDive와 동일한 구조 — 보고서 1건당 최신 결과 하나만 유지
-- (재검증 시 upsert로 덮어씀). /api/reports/[id]/evidence GET이 이 캐시를
-- 읽어서, /evidence/verify POST를 다시 호출하지 않아도 AI 판정 결과를
-- 보여줄 수 있다.
--
-- 새 테이블 추가라 기존 쿼리(findMany 등)에는 영향 없음. 이 패치를
-- 실행하기 전까지는 evidence/verify 라우트만 500 에러를 내고, 기존
-- /evidence GET(deterministic 매칭)은 이 테이블 없이도 정상 동작한다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE TABLE IF NOT EXISTS "ReportEvidenceCheck" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "verdicts" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportEvidenceCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportEvidenceCheck_reportId_key" ON "ReportEvidenceCheck"("reportId");

DO $$ BEGIN
    ALTER TABLE "ReportEvidenceCheck" ADD CONSTRAINT "ReportEvidenceCheck_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
