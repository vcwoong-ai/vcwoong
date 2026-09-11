-- Report.currentSectionTitle 추가 (2026-09-10)
--
-- 보고서 생성 진행률(지금 어느 섹션을 만들고 있는지)을 in-memory Map 대신
-- DB에 저장하기 위한 컬럼. /run(쓰기)과 /status(읽기)가 서로 다른 서버리스
-- 인스턴스에서 실행돼도 같은 값을 보게 하려는 목적이다
-- (src/lib/generation-progress.ts 참고).
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "currentSectionTitle" TEXT;
