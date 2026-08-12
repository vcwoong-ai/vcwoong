-- 보조 리서치(딥다이브 검증) 테이블 (2026-08-12)
--
-- evidence.ts(업로드 문서 내부 대조)와 반대 방향 — 보고서 핵심 주장을
-- 뉴스·웹 외부 자료로 교차 검증한 결과를 저장한다. 보고서 1건당 최신
-- 결과 하나만 유지(재검증 시 upsert로 덮어씀).
--
-- 새 테이블 추가라 기존 쿼리(findMany 등)에는 영향 없음 — exitedAt 패치와
-- 달리 이 테이블을 아는 코드만 건드린다. 다만 이 패치를 실행하기 전까지는
-- 딥다이브 기능 자체가 500 에러를 낸다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE TABLE IF NOT EXISTS "ReportDeepDive" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "claims" JSONB NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDeepDive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReportDeepDive_reportId_key" ON "ReportDeepDive"("reportId");

DO $$ BEGIN
    ALTER TABLE "ReportDeepDive" ADD CONSTRAINT "ReportDeepDive_reportId_fkey"
        FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
