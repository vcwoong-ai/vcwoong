/**
 * 로컬 개발 DB 전용 — 화면 검토/스크린샷용 "예시 데이터" PE 딜 1건을 만든다.
 *
 * - DATABASE_URL이 SQLite 파일(`file:`)이 아니면 즉시 중단한다(운영 DB 보호).
 * - 실존 기업이 아니며 모든 이름에 "(예시 데이터)"가 붙는다.
 * - 같은 이름의 예시 딜이 있으면 지우고 다시 만든다(멱등).
 *
 * 실행: DATABASE_URL='file:./dev.db' npx tsx tools/seed-showcase-local.ts
 */
import { PrismaClient } from "@prisma/client";

const DEAL_NAME = "예시 · 한빛정밀 인수 검토";
const COMPANY = "한빛정밀 (예시 데이터)";
const DEMO_EMAIL = "demo@dealmind.kr";
const EOK = 100_000_000;

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    console.error(`중단: DATABASE_URL이 로컬 SQLite 파일이 아닙니다(${url.slice(0, 12)}…). 운영/원격 DB에는 실행하지 않습니다.`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true, teamId: true } });
    if (!demo) throw new Error(`${DEMO_EMAIL} 유저 없음 — npm run db:setup:local 먼저 실행`);

    await prisma.mADeal.deleteMany({ where: { name: DEAL_NAME, userId: demo.id } });
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
    console.log(`예시 PE 딜 생성 완료: ${deal.id}`);
    console.log(`  → /ma-deals/${deal.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
