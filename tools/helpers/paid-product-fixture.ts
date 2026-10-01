/** Disposable product fixtures; existing demo accounts/data are never touched. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { traceReportEvidence } from "../../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../../src/lib/deal-scoring-evidence";

async function createPeExample(prisma: PrismaClient, userId: string) {
  const demo = { id: userId, teamId: null };
  const DEAL_NAME = "예시 · 한빛정밀 인수 검토";
  const COMPANY = "한빛정밀 (예시 데이터)";
  const EOK = 100_000_000;
    const deal = await prisma.mADeal.create({
      data: { name: DEAL_NAME, companyName: COMPANY, dealType: "BUYOUT", userId: demo.id, teamId: demo.teamId },
    });

    // 연도별 재무(억원 → 원). 2024 매출은 출처 간 상충(경영 자료 1,200억 vs DART 1,180억).
    const years = [
      { fy: 2022, rev: 900, cogs: 690, sga: 120, da: 28, cash: 95, std: 60, ltd: 180, ocf: 88, capex: 42 },
      { fy: 2023, rev: 1050, cogs: 795, sga: 132, da: 31, cash: 110, std: 70, ltd: 200, ocf: 102, capex: 55 },
      { fy: 2024, rev: 1200, cogs: 910, sga: 148, da: 34, cash: 130, std: 75, ltd: 210, ocf: 118, capex: 61 },
    ];
    let period2024 = "";
    for (const y of years) {
      const period = await prisma.mAFinancialPeriod.create({
        data: {
          maDealId: deal.id, fiscalYear: y.fy, periodType: "ANNUAL",
          startDate: new Date(`${y.fy}-01-01`), endDate: new Date(`${y.fy}-12-31`), currency: "KRW",
        },
      });
      if (y.fy === 2024) period2024 = period.id;
      const gross = y.rev - y.cogs;
      const ebit = gross - y.sga;
      const items: Array<[string, "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW", number]> = [
        ["REVENUE", "INCOME_STATEMENT", y.rev], ["COGS", "INCOME_STATEMENT", y.cogs],
        ["GROSS_PROFIT", "INCOME_STATEMENT", gross], ["SGA", "INCOME_STATEMENT", y.sga],
        ["EBIT", "INCOME_STATEMENT", ebit], ["DA", "INCOME_STATEMENT", y.da],
        ["CASH", "BALANCE_SHEET", y.cash], ["SHORT_TERM_DEBT", "BALANCE_SHEET", y.std],
        ["LONG_TERM_DEBT", "BALANCE_SHEET", y.ltd],
        ["OPERATING_CASH_FLOW", "CASH_FLOW", y.ocf], ["CAPEX", "CASH_FLOW", y.capex],
      ];
      for (const [lineItem, statementType, eok] of items) {
        await prisma.mAFinancialLineItem.create({
          data: {
            financialPeriodId: period.id, statementType, lineItem, value: eok * EOK, currency: "KRW",
            source: "MANUAL", sourceName: "경영진 제공 재무제표(예시)",
          },
        });
      }
      if (y.fy === 2024) {
        await prisma.mAFinancialLineItem.create({
          data: {
            financialPeriodId: period.id, statementType: "INCOME_STATEMENT", lineItem: "REVENUE",
            value: 1180 * EOK, currency: "KRW", source: "DART", sourceName: "2024 사업보고서(예시)",
          },
        });
      }
    }

    // QoE — 일회성 비용 조정 1건(승인) + 검토 중 1건(제안)
    await prisma.mAFinancialAdjustment.create({
      data: {
        financialPeriodId: period2024, metric: "EBITDA", reportedValue: 176 * EOK, adjustmentValue: 9 * EOK,
        normalizedValue: 185 * EOK, reason: "공장 이전에 따른 일회성 비용(예시)", source: "MANUAL",
        sourceName: "경영진 설명(예시)", status: "APPROVED", adjustmentType: "ONE_OFF_EXPENSE",
      },
    });
    await prisma.mAFinancialAdjustment.create({
      data: {
        financialPeriodId: period2024, metric: "EBITDA", reportedValue: 176 * EOK, adjustmentValue: 6 * EOK,
        normalizedValue: 182 * EOK, reason: "대표이사 보수 정상화 제안(예시)", source: "MANUAL",
        sourceName: "자문사 제안(예시)", status: "PROPOSED", adjustmentType: "OWNER_COMPENSATION_NORMALIZATION",
      },
    });

    // DD — 이슈 3건(심각도·상태 다양)
    const ddCase = await prisma.pEDDCase.create({ data: { maDealId: deal.id } });
    const findings: Array<{ category: "FINANCIAL" | "COMMERCIAL" | "LEGAL"; title: string; description: string; severity: "HIGH" | "MEDIUM" | "LOW"; status: "IN_REVIEW" | "CONFIRMED" | "DRAFT"; owner: string }> = [
      { category: "FINANCIAL", title: "2024 매출 출처 간 20억원 차이", description: "경영 자료(1,200억원)와 DART 사업보고서(1,180억원)가 다르다. 차이 원인(연결 범위·매출 인식 시점)을 확인해야 한다.", severity: "HIGH", status: "IN_REVIEW", owner: "재무 실사팀" },
      { category: "COMMERCIAL", title: "상위 고객 3곳 매출 비중 확인 필요", description: "고객 집중도를 판단할 계약·매출 명세가 데이터룸에 없다.", severity: "MEDIUM", status: "DRAFT", owner: "상업 실사팀" },
      { category: "LEGAL", title: "공장 부지 담보 설정 여부", description: "등기부등본 사본이 아직 접수되지 않았다.", severity: "LOW", status: "DRAFT", owner: "법무 실사팀" },
    ];
    for (const f of findings) {
      await prisma.pEDDFinding.create({
        data: { ddCaseId: ddCase.id, category: f.category, title: f.title, description: f.description, severity: f.severity, status: f.status, owner: f.owner, financialPeriodId: f.category === "FINANCIAL" ? period2024 : null },
      });
    }
    return deal;
}

export async function createPaidProductFixture(prisma: PrismaClient) {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db", "local fixture only");
  const password = "PaidFixture2026!";
  const owner = await prisma.user.create({ data: {
    email: `paid-owner-${Date.now()}@example.com`, name: "제품 검토 (합성 계정)",
    passwordHash: await bcrypt.hash(password, 4), role: "ANALYST",
  } });
  const cleanup = async () => {
    await prisma.deal.deleteMany({ where: { userId: owner.id } });
    await prisma.mADeal.deleteMany({ where: { userId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  };
  try {
    const peDeal = await createPeExample(prisma, owner.id);
    await prisma.mADeal.create({ data: { name: "자료 대기 (예시)", companyName: "자료 대기 기업 (예시)", userId: owner.id, dealType: "BUYOUT" } });
    const vcDeal = await prisma.deal.create({ data: {
      name: "네오비전 Series A (예시)", companyName: "네오비전 주식회사 (예시 데이터)", sector: "IT",
      stage: "SCREENING", investRound: "Series A", investAmount: 50, valuation: 400, userId: owner.id,
    } });
    const sections = [
      { sectionKey: "INVESTMENT_OVERVIEW" as const, title: "투자 개요", content: "네오비전은 산업용 비전 AI를 공급한다. 고객사 45곳, 투자 금액 50억원, 포스트밸류 400억원이다." },
      { sectionKey: "COMPANY_OVERVIEW" as const, title: "회사 개요", content: "R&D 출신 5인, 특허 12건, 임직원 38명이다." },
      { sectionKey: "MARKET_ANALYSIS" as const, title: "시장 분석", content: "2024년 국내 시장은 8,000억원 규모이며 연평균 25% 성장한다." },
      { sectionKey: "FINANCIAL_STATUS" as const, title: "재무 현황", content: "2024년 매출 95억원, 영업이익 -12억원, 현금성자산 30억원이다. 2024년 매출 110억원으로 집계한 자료도 있다." },
      { sectionKey: "VALUATION" as const, title: "밸류에이션", content: "비교기업 대비 매출 배수 4.2배를 적용했다." },
    ];
    await prisma.document.create({ data: { dealId: vcDeal.id, name: "IR_Deck_2024.pdf", type: "IR_DECK", url: "fixture://ir", size: 1, mimeType: "application/pdf", parsedText: "네오비전 IR. 2024년 매출 95억원 고객사 45곳 영업이익 -12억원 현금성자산 30억원 특허 12건 임직원 38명 50억원 400억원" } });
    await prisma.document.create({ data: { dealId: vcDeal.id, name: "재무제표_감사보고서.pdf", type: "FINANCIAL", url: "fixture://audit", size: 1, mimeType: "application/pdf", parsedText: "네오비전 감사보고서. 2024년 매출액 110억원" } });
    const report = await prisma.report.create({ data: {
      dealId: vcDeal.id, title: "네오비전 투자심의보고서 (예시)", agentType: "IT", status: "DRAFT",
      generatedAt: new Date(), sections: { create: sections.map((s, order) => ({ ...s, order, status: "DRAFT" })) },
    } });
    const docs = await prisma.document.findMany({ where: { dealId: vcDeal.id }, select: { id: true, name: true, parsedText: true } });
    const claims = traceReportEvidence(sections, docs, { investAmount: 50, valuation: 400 }).claims;
    const scores = { marketSize: 78, team: 72, product: 80, businessModel: 68, financials: 74, moat: 70 };
    const rationale = { marketSize: "시장 성장", team: "R&D 출신 팀", product: "특허", businessModel: "SaaS", financials: "성장", moat: "특허 12건" };
    await prisma.dealScore.create({ data: { dealId: vcDeal.id, overall: 74, ...scores, rationale, modelUsed: "fixture", evidenceAssessment: buildScoreEvidenceAssessment(scores, rationale, claims, "report_evidence") as never } });
    const health = await prisma.deal.create({ data: { name: "근거 부족 (예시)", companyName: "헬스케어AI (예시 데이터)", sector: "BIO", userId: owner.id } });
    await prisma.report.create({ data: {
      dealId: health.id, title: "근거 미확인 초안 (예시)", agentType: "BIO", status: "DRAFT",
      sections: { create: [
        ...sections.map((s, order) => ({ sectionKey: s.sectionKey, title: s.title, order, status: "DRAFT" as const, content: "자료 미제공으로 확인할 수 없습니다." })),
        { sectionKey: "OPINION_SUMMARY", title: "의견 종합", order: 5, status: "DRAFT", content: "조건부 투자 권고 초안. 근거 자료는 제공되지 않아 추가 확인이 필요합니다." },
      ] },
    } });
    await prisma.deal.create({ data: { name: "보고서 미작성 (예시)", companyName: "자료 대기 VC 기업 (예시 데이터)", sector: "GENERAL", userId: owner.id } });
    return { owner, password, peDeal, vcDeal, report, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
