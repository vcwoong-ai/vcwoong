-- Report.autoResumeCount 추가 (2026-09-11)
--
-- 브라우저 의존 없이 서버(cron)가 checkpoint 이후 생성을 이어가기 위한
-- 재시도 횟수 카운터. 브라우저 폴링의 MAX_AUTO_RESUMES(in-memory, 세션당
-- 리셋)와 달리 cron은 매 tick이 완전히 새로운 stateless invocation이라
-- "진행이 없는데도 무한 재시도"를 막으려면 DB에 횟수를 남겨야 한다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.

ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "autoResumeCount" INTEGER NOT NULL DEFAULT 0;
