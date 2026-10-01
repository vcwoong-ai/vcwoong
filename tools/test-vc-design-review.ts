/** Local-only design review: existing VC E2E fixture, unchanged between captures. */
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { traceReportEvidence } from "../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import { computeReportDecision, REPORT_FOR_DECISION_INCLUDE } from "../src/lib/vc-decision-loader";
import { loadReportForExport } from "../src/lib/report-export-common";

const BASE = "http://localhost:3000";
const phase = process.argv[2] ?? "after";
const dir = "screenshots/vc-design-review";
const reportId = "codex-design-review-report";
const prisma = new PrismaClient();
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

async function main() {
  assert.equal(process.env.DATABASE_URL, "file:./dev.db", "Only the isolated repository SQLite fixture is allowed");
  assert(["before", "after", "seed"].includes(phase));
  mkdirSync(dir, { recursive: true });
  if (!await prisma.report.findUnique({ where: { id: reportId } })) {
    assert(phase === "before" || phase === "seed", "Capture Before first");
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "demo@dealmind.kr" } });
    const deal = await prisma.deal.create({ data: {
      name: "예시 · 비전AI Series A 검토", companyName: "비전AI (예시 데이터)", sector: "IT", stage: "SCREENING",
      investRound: "Series A", investAmount: 50, valuation: 400, userId: owner.id, teamId: owner.teamId,
    } });
    const sections = [
      { sectionKey: "INVESTMENT_OVERVIEW" as const, title: "투자 개요", content: "비전AI는 산업용 비전 AI를 공급한다. 고객사 45곳을 확보했고 이번 라운드에서 50억원을 투자하며 포스트밸류는 400억원이다." },
      { sectionKey: "COMPANY_OVERVIEW" as const, title: "회사 개요", content: "창업팀은 대기업 R&D 출신 5인이며 누적 특허 12건을 보유한다. 임직원 수는 38명이다." },
      { sectionKey: "MARKET_ANALYSIS" as const, title: "시장 분석", content: "국내 시장은 2024년 8,000억원 규모이며 연평균 25% 성장한다." },
      { sectionKey: "FINANCIAL_STATUS" as const, title: "재무 현황", content: "2024년 매출 95억원, 영업이익 -12억원을 기록했다. 현금성자산은 30억원이다. 2024년 매출 110억원으로 집계한 자료도 있다." },
      { sectionKey: "VALUATION" as const, title: "밸류에이션", content: "비교기업 대비 매출 배수 4.2배를 적용했다." },
    ];
    await prisma.document.create({ data: { dealId: deal.id, name: "IR_Deck_2024.pdf", type: "IR_DECK", url: "fixture://ir", size: 1, mimeType: "application/pdf", parsedText: "2024년 매출 95억원 고객사 45곳 영업이익 -12억원 현금성자산 30억원 특허 12건 임직원 38명 50억원 400억원" } });
    await prisma.document.create({ data: { dealId: deal.id, name: "감사보고서.pdf", type: "FINANCIAL", url: "fixture://audit", size: 1, mimeType: "application/pdf", parsedText: "감사보고서 2024년 매출액 110억원" } });
    await prisma.report.create({ data: { id: reportId, dealId: deal.id, title: "비전AI 투자심의보고서 (예시 데이터)", agentType: "IT", status: "DRAFT", generatedAt: new Date("2026-09-30T00:00:00Z"), sections: { create: sections.map((s, order) => ({ ...s, order, status: "DRAFT" })) } } });
    const docs = await prisma.document.findMany({ where: { dealId: deal.id }, select: { id: true, name: true, parsedText: true } });
    const claims = traceReportEvidence(sections, docs, { investAmount: 50, valuation: 400 }).claims;
    const scores = { marketSize: 78, team: 72, product: 80, businessModel: 68, financials: 74, moat: 70 };
    const rationale = { marketSize: "시장 성장", team: "R&D 출신 팀", product: "특허", businessModel: "SaaS", financials: "성장", moat: "특허 12건" };
    await prisma.dealScore.create({ data: { dealId: deal.id, overall: 74, ...scores, rationale, modelUsed: "fixture", evidenceAssessment: buildScoreEvidenceAssessment(scores, rationale, claims, "report_evidence") as never } });
  }
  if (phase === "seed") {
    console.log(`Fixture ready: /reports/${reportId} (existing fixture preserved)`);
    return;
  }
  const input = await prisma.report.findUniqueOrThrow({ where: { id: reportId }, include: REPORT_FOR_DECISION_INCLUDE });
  const snapshot = { inputHash: hash(input), decisionHash: hash(computeReportDecision(input).decision) };
  const owner = await prisma.deal.findUniqueOrThrow({ where: { id: input.deal.id }, select: { userId: true } });
  const exported = await loadReportForExport(owner.userId, reportId);
  assert("report" in exported && exported.report, "Export input is available for this fixture owner");
  assert.equal(hash(computeReportDecision(exported.report).decision), snapshot.decisionHash, "Export loader and API loader produce the same decision for frozen fixture inputs");
  if (phase === "before") writeFileSync(`${dir}/snapshot.json`, JSON.stringify(snapshot, null, 2));
  else assert.deepEqual(snapshot, JSON.parse(readFileSync(`${dir}/snapshot.json`, "utf8")), "Before/After use exactly the same input and decision");
  const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.fill("#email", "demo@dealmind.kr");
    await page.fill("#password", "Demo1234!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/, { timeout: 120000 });
    const response = await page.request.get(`${BASE}/api/reports/${reportId}/decision`);
    assert(response.ok());
    const api = (await response.json()).data;
    assert.equal(hash(api.decision), snapshot.decisionHash);
    for (const width of phase === "before" ? [1440, 390] : [1440, 390, 430, 768, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${BASE}/reports/${reportId}`, { waitUntil: "networkidle", timeout: 120000 });
      await page.locator('[data-testid="vc-decision-workspace"][data-state="ready"]').waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.getByTestId("vc-decision-thesis").innerText(), api.decision.thesis);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}px`);
      await page.screenshot({ path: `${dir}/${phase}-${width}.png` });
      await page.getByTestId("vc-decision-workspace").screenshot({ path: `${dir}/${phase}-${width}-workspace.png` });
      const opener = page.getByTestId("vc-contradiction").first().getByTestId("vc-open-evidence").first();
      await opener.click();
      const panel = page.getByTestId("vc-evidence-panel");
      await panel.waitFor();
      for (const value of ["95억원", "110억원", "IR_Deck_2024.pdf", "감사보고서.pdf"]) assert((await panel.innerText()).includes(value));
      await page.screenshot({ path: `${dir}/${phase}-${width}-evidence.png` });
      if (phase === "after") {
        const firstTab = panel.getByRole("tab").first();
        await firstTab.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(await panel.getByRole("tab").nth(1).getAttribute("aria-selected"), "true");
        assert((await page.getByTestId("vc-evidence-entry").innerText()).includes("110억원"));
        await page.keyboard.press("Home");
        assert.equal(await firstTab.getAttribute("aria-selected"), "true");
        for (let i = 0; i < 6; i++) {
          await page.keyboard.press("Tab");
          assert(await panel.evaluate(el => el.contains(document.activeElement)), "Dialog traps keyboard focus");
        }
      }
      await page.keyboard.press("Escape");
      assert(await opener.evaluate(el => el === document.activeElement), "Closing returns keyboard focus");
      if (phase === "after") {
        await page.getByRole("link", { name: "상충 값 1건 대조 ↓", exact: true }).click();
        assert(new URL(page.url()).hash === "#vc-contradictions-title", "Prominent review action reaches actual conflict section");
        assert.equal(await page.getByTestId("vc-question").count(), api.questionLinks.length, "All canonical IC questions remain accessible");
        await page.getByTestId("vc-contradiction").screenshot({ path: `${dir}/${phase}-${width}-comparison.png` });
      }
      console.log(`PASS ${phase} ${width}px: canonical thesis, overflow, competing sources, dialog focus`);
    }
    assert.equal(hash(await prisma.report.findUniqueOrThrow({ where: { id: reportId }, include: REPORT_FOR_DECISION_INCLUDE })), snapshot.inputHash, "Review did not mutate fixture input");
    console.log(JSON.stringify({ route: `/reports/${reportId}`, ...snapshot }));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
