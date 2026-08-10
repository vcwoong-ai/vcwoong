-- 외래키·조회 컬럼 인덱스 (2026-08-10)
--
-- Postgres는 MySQL과 달리 외래키 컬럼에 인덱스를 자동으로 만들어주지 않는다.
-- 지금까지 인덱스가 하나도 없어 `where: { dealId }`, `where: { userId }` 같은
-- 조회가 전부 순차 스캔이었다. 데이터가 쌓이면 그대로 느려진다.
--
-- CONCURRENTLY 없이 만들어도 테이블이 작을 때는 순식간에 끝난다.
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS 로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");
CREATE INDEX IF NOT EXISTS "Deal_userId_idx" ON "Deal"("userId");
CREATE INDEX IF NOT EXISTS "Deal_teamId_idx" ON "Deal"("teamId");
CREATE INDEX IF NOT EXISTS "Deal_status_idx" ON "Deal"("status");
CREATE INDEX IF NOT EXISTS "Document_dealId_idx" ON "Document"("dealId");
CREATE INDEX IF NOT EXISTS "Template_userId_idx" ON "Template"("userId");
CREATE INDEX IF NOT EXISTS "Template_teamId_idx" ON "Template"("teamId");
CREATE INDEX IF NOT EXISTS "Report_dealId_idx" ON "Report"("dealId");
CREATE INDEX IF NOT EXISTS "Report_templateId_idx" ON "Report"("templateId");
CREATE INDEX IF NOT EXISTS "Report_status_idx" ON "Report"("status");
CREATE INDEX IF NOT EXISTS "ReportSection_reportId_idx" ON "ReportSection"("reportId");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_userId_idx" ON "SubscriptionPayment"("userId");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_paymentKey_idx" ON "SubscriptionPayment"("paymentKey");
CREATE INDEX IF NOT EXISTS "UsageLog_userId_idx" ON "UsageLog"("userId");
CREATE INDEX IF NOT EXISTS "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
CREATE INDEX IF NOT EXISTS "Fund_userId_idx" ON "Fund"("userId");
CREATE INDEX IF NOT EXISTS "Fund_teamId_idx" ON "Fund"("teamId");
CREATE INDEX IF NOT EXISTS "PortfolioCompany_userId_idx" ON "PortfolioCompany"("userId");
CREATE INDEX IF NOT EXISTS "PortfolioCompany_teamId_idx" ON "PortfolioCompany"("teamId");
CREATE INDEX IF NOT EXISTS "PortfolioCompany_fundId_idx" ON "PortfolioCompany"("fundId");
CREATE INDEX IF NOT EXISTS "Milestone_companyId_idx" ON "Milestone"("companyId");
CREATE INDEX IF NOT EXISTS "LpReport_fundId_idx" ON "LpReport"("fundId");
CREATE INDEX IF NOT EXISTS "InboundDeal_userId_idx" ON "InboundDeal"("userId");
CREATE INDEX IF NOT EXISTS "InboundDeal_teamId_idx" ON "InboundDeal"("teamId");
CREATE INDEX IF NOT EXISTS "InboundDeal_status_idx" ON "InboundDeal"("status");
