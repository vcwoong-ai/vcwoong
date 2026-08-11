-- PortfolioCompany.exitedAt 추가 (2026-08-11)
--
-- 펀드 XIRR 계산에서 회수 현금흐름의 정확한 날짜가 필요한데, 지금까지는
-- 회수 시점을 저장하지 않아 updatedAt으로 근사할 수밖에 없었다.
-- (fund-analytics.ts의 companyCashFlows 참고)
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.

ALTER TABLE "PortfolioCompany" ADD COLUMN IF NOT EXISTS "exitedAt" TIMESTAMP(3);
