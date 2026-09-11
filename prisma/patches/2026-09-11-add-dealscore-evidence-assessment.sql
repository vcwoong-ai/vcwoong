-- DealScore.evidenceAssessment 추가 (2026-09-11)
--
-- 딜 스코어(marketSize/team/product/businessModel/financials/moat)를
-- evidence.ts 근거 추적과 연결한 결과(확신도·근거 커버리지·risk flag·
-- IC 요약)를 저장한다. ScoreEvidenceAssessment 형태의 JSON
-- (src/lib/deal-scoring-evidence.ts 참고) — 새 테이블이 아니라 기존
-- DealScore에 컬럼 하나만 추가한다.
--
-- 기존 점수 계산 로직·저장 컬럼(overall/marketSize/... /rationale)은 전혀
-- 건드리지 않는다. 이 패치를 실행하기 전에는 evidenceAssessment가 항상
-- null이고, API/UI는 null을 "평가 안 됨"으로 정상 처리한다(에러 아님).
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

ALTER TABLE "DealScore" ADD COLUMN IF NOT EXISTS "evidenceAssessment" JSONB;
