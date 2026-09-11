-- IC(투자심의위원회) 질문 캐시 테이블 (2026-09-11)
--
-- DealScore.evidenceAssessment(Phase 4)에서 결정적으로 도출한 질문 후보를
-- 필요시 AI로 문장만 다듬은 결과를 저장한다. ReportDeepDive/
-- ReportEvidenceCheck와 동일한 구조 — 보고서 1건당 최신 결과 하나만 유지
-- (재생성 시 upsert로 덮어씀). /api/reports/[id]/ic-questions GET이 이
-- 캐시를 읽어서, generate를 다시 호출하지 않아도 이전 결과를 보여줄 수 있다.
--
-- 새 테이블 추가라 기존 쿼리(findMany 등)에는 영향 없음. 이 패치를
-- 실행하기 전까지는 ic-questions 관련 라우트만 500 에러를 내고, 나머지
-- 기존 기능(보고서·근거 추적·딜 스코어링)은 전혀 영향받지 않는다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE TABLE IF NOT EXISTS "ReportIcQuestions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportIcQuestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportIcQuestions_reportId_key" ON "ReportIcQuestions"("reportId");

DO $$ BEGIN
    ALTER TABLE "ReportIcQuestions" ADD CONSTRAINT "ReportIcQuestions_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
