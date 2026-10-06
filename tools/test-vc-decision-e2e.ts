import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace, chromiumLaunchOptions } from "./helpers/e2e-environment";
/**
 * VC 결정 워크스페이스 종합 브라우저 E2E.
 *
 * 로그인 -> 대시보드 -> 딜 목록 -> 딜 상세(투자 판단 요약) -> 보고서 -> 결정 워크스페이스
 * (시그널·논지·상충·Driver·Breaker·밸류에이션·미확인 정보·IC 질문) -> 상세 분석 -> export
 * 를 한 흐름으로 검증하고, 화면에 보이는 값이 서버 canonical 결과(GET /decision)와
 * 일치하는지, DOCX export가 같은 상충을 싣는지 대조한다. 데스크톱(1280)과 모바일(390).
 *
 * Usage: npm run db:setup:local && npm run dev:local 후 npm run test:vc-decision-e2e
 */
import { chromium, type Page } from "playwright";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { traceReportEvidence } from "../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import { SCORE_DIMENSIONS } from "../src/lib/deal-scoring-shared";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
assertE2ETarget(BASE);
assertNoExternalE2ECredentials();
assertCleanE2EWorkspace();
const prisma = new PrismaClient();
const EMAIL = process.env.SMOKE_EMAIL ?? "demo@dealmind.kr";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Demo1234!";


function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const SECTIONS: Array<{ key: "INVESTMENT_OVERVIEW" | "COMPANY_OVERVIEW" | "MARKET_ANALYSIS" | "FINANCIAL_STATUS" | "VALUATION"; title: string; content: string }> = [
  { key: "INVESTMENT_OVERVIEW", title: "투자 개요", content: "E2E비전은 산업용 비전 AI를 공급한다. 고객사 45곳을 확보했고 이번 라운드에서 50억원을 투자하며 포스트밸류는 400억원이다." },
  { key: "COMPANY_OVERVIEW", title: "회사 개요", content: "창업팀은 대기업 R&D 출신 5인이며 누적 특허 12건을 보유한다. 임직원 수는 38명이다." },
  { key: "MARKET_ANALYSIS", title: "시장 분석", content: "국내 시장은 2024년 8,000억원 규모이며 연평균 25% 성장한다." },
  { key: "FINANCIAL_STATUS", title: "재무 현황", content: "2024년 매출 95억원, 영업이익 -12억원을 기록했다. 현금성자산은 30억원이다. 2024년 매출 110억원으로 집계한 자료도 있다." },
  { key: "VALUATION", title: "밸류에이션", content: "비교기업 대비 매출 배수 4.2배를 적용했다." },
];

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500); // 콜드 컴파일/하이드레이션 레이스(레포 관례)
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

async function main() {
  console.log(`\n=== VC 결정 워크스페이스 E2E — 대상: ${BASE} ===\n`);
  const demo = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, teamId: true } });
  assert(!!demo, `${EMAIL} 유저를 찾을 수 없음 — npm run db:setup:local을 먼저 실행하세요`);

  // ── Fixture: 상충(95억 vs 110억)하는 두 문서 + 보고서 + 결정적 점수 ─────
  const tag = String(Date.now());
  const deal = await prisma.deal.create({
    data: { name: `E2E VC ${tag}`, companyName: "E2E비전 주식회사", sector: "IT", stage: "SCREENING", investRound: "Series A", investAmount: 50, valuation: 400, userId: demo!.id, teamId: demo!.teamId },
  });
  await prisma.document.create({ data: { dealId: deal.id, name: "IR_Deck_2024.pdf", type: "IR_DECK", url: "x://1", size: 1, mimeType: "application/pdf", parsedText: "2024년 매출 95억원 고객사 45곳 영업이익 -12억원 현금성자산 30억원 특허 12건 임직원 38명 50억원 400억원" } });
  await prisma.document.create({ data: { dealId: deal.id, name: "감사보고서.pdf", type: "FINANCIAL", url: "x://2", size: 1, mimeType: "application/pdf", parsedText: "감사보고서 2024년 매출액 110억원" } });
  const report = await prisma.report.create({ data: { dealId: deal.id, title: "E2E비전 투자심의보고서", agentType: "IT", status: "DRAFT", generatedAt: new Date() } });
  let order = 0;
  for (const s of SECTIONS) await prisma.reportSection.create({ data: { reportId: report.id, sectionKey: s.key, title: s.title, content: s.content, order: order++, status: "DRAFT" } });
  const docs = await prisma.document.findMany({ where: { dealId: deal.id }, select: { id: true, name: true, parsedText: true } });
  const claims = traceReportEvidence(SECTIONS.map((s) => ({ sectionKey: s.key, content: s.content })), docs, { investAmount: 50, valuation: 400 }, undefined).claims;
  const scores = { marketSize: 78, team: 72, product: 80, businessModel: 68, financials: 74, moat: 70 } as const;
  const rationale = { marketSize: "시장 성장", team: "R&D 출신 팀", product: "특허", businessModel: "SaaS", financials: "성장", moat: "특허 12건" };
  const assessment = buildScoreEvidenceAssessment(scores, rationale, claims, "report_evidence");
  await prisma.dealScore.create({
    data: { dealId: deal.id, overall: Math.round(SCORE_DIMENSIONS.reduce((a, d) => a + scores[d.key], 0) / SCORE_DIMENSIONS.length), ...scores, rationale, modelUsed: "fixture", evidenceAssessment: assessment as never },
  });
  console.log(`딜 생성: ${deal.id} / 보고서: ${report.id}\n`);

  const browser = await chromium.launch(chromiumLaunchOptions());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));

  try {
    // 1. 로그인 -> 대시보드
    await login(page);
    await page.waitForSelector("text=대시보드", { timeout: 20000 });
    console.log("✅ 1 — 로그인 후 VC 대시보드 진입");

    // 2. 딜 목록에서 딜 열기
    await page.goto(`${BASE}/deals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const dealLink = page.locator(`a[href="/deals/${deal.id}"]`).first();
    await dealLink.waitFor({ state: "attached", timeout: 30000 });
    await dealLink.click({ timeout: 30000 });
    await page.waitForURL(new RegExp(`/deals/${deal.id}`), { timeout: 20000 });
    console.log("✅ 2 — 딜 목록에서 딜 상세로 이동");

    // 3. 딜 상세 첫 화면: 투자 판단 요약(문서 업로더가 아니라 판단이 먼저)
    const summary = page.getByTestId("deal-decision-summary");
    await summary.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForSelector('[data-testid="deal-decision-summary"][data-state="ready"]', { timeout: 30000 });
    const summaryText = await summary.innerText();
    assert(summaryText.includes("수치 상충") && summaryText.includes("95억원") && summaryText.includes("110억원"), `딜 상세 요약에 상충 값이 보여야 함: ${summaryText}`);
    const boxTop = (await summary.boundingBox())!.y;
    const uploaderTop = (await page.getByText("문서 업로드").first().boundingBox())!.y;
    assert(boxTop < uploaderTop, "투자 판단 요약이 문서 업로더보다 위에 있어야 함(5초 이해)");
    console.log("✅ 3 — 딜 상세 최상단에 투자 판단 요약(시그널·상충 95억 vs 110억)이 문서 업로더보다 먼저 보임");

    // 4. 보고서로 이동 -> 결정 워크스페이스
    await page.getByRole("link", { name: /결정 요약 전체 보기/ }).click();
    await page.waitForURL(new RegExp(`/reports/${report.id}`), { timeout: 20000 });
    const ws = page.getByTestId("vc-decision-workspace");
    await ws.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForSelector('[data-testid="vc-decision-workspace"][data-state="ready"]', { timeout: 30000 });
    console.log("✅ 4 — 보고서 화면 첫 구획이 결정 워크스페이스");

    // 5. canonical 서버 결과와 화면 대조
    const apiRes = await page.request.get(`${BASE}/api/reports/${report.id}/decision`);
    assert(apiRes.ok(), "결정 API 200");
    const api = (await apiRes.json()).data;
    const dec = api.decision;
    const signalText = (await page.getByTestId("vc-decision-signal").innerText()).trim();
    assert(signalText.replace(" ", "").toUpperCase() === (dec.signal as string).replace("_", "").toUpperCase(), `화면 시그널(${signalText})이 서버(${dec.signal})와 같아야 함`);
    const thesisText = (await page.getByTestId("vc-decision-thesis").innerText()).trim();
    assert(thesisText === dec.thesis, "화면 논지 문장이 서버 canonical 논지와 정확히 같아야 함(React가 다시 쓰지 않음)");
    const statsText = await page.getByTestId("vc-decision-stats").innerText();
    const p0 = dec.missingInformation.filter((m: { priority: string }) => m.priority === "P0").length;
    assert(statsText.includes(`${p0}건`) && statsText.includes(`${dec.contradictions.length}건`) && statsText.includes(`${dec.thesisBreakers.length}건`), `상단 개수(P0 ${p0}/상충 ${dec.contradictions.length}/Breaker ${dec.thesisBreakers.length})가 서버와 같아야 함: ${statsText}`);
    console.log("✅ 5 — 시그널·논지·P0/상충/Breaker 개수가 서버 canonical 응답과 정확히 일치(화면이 재계산하지 않음)");

    // 6. 수치 상충 패널: 두 값·출처·기간, 상시 표시
    const contra = page.getByTestId("vc-contradiction");
    assert((await contra.count()) === dec.contradictions.length, "상충 패널 개수가 서버와 같아야 함");
    const contraText = await contra.first().innerText();
    for (const needle of ["95억원", "110억원", "IR_Deck_2024.pdf", "감사보고서.pdf", "FY2024", "필요한 검증"]) {
      assert(contraText.includes(needle), `상충 패널에 '${needle}'이 있어야 함(호버 없이 상시): ${contraText}`);
    }
    assert((await page.getByTestId("vc-contradiction-value").count()) === 2, "상충 값 행이 2개(값을 하나만 고르지 않음)");
    console.log("✅ 6 — 수치 상충 패널이 두 값·두 출처·기간·필요한 검증을 상시 표시");

    // 7. Driver/Breaker 일관성 — 상충 차원의 Driver가 '확인됨'으로 보이지 않음(핵심 회귀)
    const finDriver = page.locator('[data-testid="vc-driver"]', { hasText: "재무 건전성" });
    assert((await finDriver.count()) === 1, "재무 Driver가 숨지지 않고 있어야 함");
    assert((await finDriver.getAttribute("data-evidence-state")) === "CONTRADICTED", "상충 차원 Driver는 CONTRADICTED");
    assert(!(await finDriver.innerText()).includes("IC 상정 가능"), "상충 Driver가 'IC 상정 가능'이라고 말하면 안 됨");
    assert((await page.locator('[data-testid="vc-breaker"][data-trigger="CONTRADICTION"]').count()) === 1, "상충이 Thesis Breaker로 올라와야 함");
    assert((await page.locator('[data-testid="vc-missing-item"][data-priority="P0"]', { hasText: "수치 상충" }).count()) >= 1, "상충이 P0 미확인 정보로 올라와야 함");
    console.log("✅ 7 — 상충 Driver는 '상충', Thesis Breaker·P0 미확인 정보에 모두 반영(Decision Map과 모순 없음)");

    // 8. 밸류에이션: 사실 + 산출 불가 사유, 지어낸 MOIC/IRR 없음
    const valText = await page.getByTestId("vc-valuation").innerText();
    assert(valText.includes("50억원") && valText.includes("400억원") && valText.includes("12.50%"), "투자금액·밸류에이션·지분율(12.50%)이 표시돼야 함");
    assert(((await page.getByTestId("vc-valuation-line").filter({ hasText: "산출 불가" }).count())) >= 2, "MOIC/IRR은 산출 불가와 사유·필요 입력을 표시");
    assert(!/MOIC[^\n]*\d+(\.\d+)?x/i.test(valText), "MOIC 수치를 지어내면 안 됨");
    console.log("✅ 8 — 밸류에이션은 입력값·결정적 지분율만, MOIC/IRR은 산출 불가+필요 입력");

    // 9. IC 질문: 생성 전에도 결정적 미리보기로 상충 질문이 결정 이슈와 연결되어 보임 -> 생성하면 저장본으로 전환
    assert(api.questionsSource === "deterministic_preview", `저장 전 질문 출처는 미리보기여야 함: ${api.questionsSource}`);
    await page.waitForSelector('[data-testid="vc-questions-preview"]', { timeout: 10000 });
    const preText = await page.getByTestId("vc-questions").innerText();
    assert(preText.includes("95억원") && preText.includes("110억원") && preText.includes("풀어야 할 이슈") && preText.includes("수치 상충"), `생성 전에도 상충 IC 질문이 값·출처와 함께 결정 이슈에 연결돼 보여야 함: ${preText.slice(0, 300)}`);
    await page.getByRole("button", { name: "IC 질문 생성" }).click();
    await page.waitForSelector('[data-testid="vc-questions-preview"]', { state: "detached", timeout: 30000 });
    const qText = await page.getByTestId("vc-questions").innerText();
    assert(qText.includes("95억원") && qText.includes("110억원") && qText.includes("수치 상충"), `생성 후에도 상충 질문 유지: ${qText.slice(0, 300)}`);
    console.log("✅ 9 — 생성 전에도 상충 질문이 '미리보기'로 결정 이슈와 연결되어 보이고, 생성하면 저장본으로 전환");

    // 10. 상세 분석은 결정 아래(근거로서)
    const wsBottom = (await ws.boundingBox())!.y + (await ws.boundingBox())!.height;
    const detailTop = (await page.locator("#report-detail").boundingBox())!.y;
    assert(detailTop > wsBottom - 1, "상세 분석(보고서 본문)은 결정 워크스페이스 아래에 있어야 함");
    await page.getByText("재무 현황").first().waitFor({ state: "visible", timeout: 10000 });
    console.log("✅ 10 — 상세 분석(보고서 본문)은 결정 아래에서 근거로 제공됨");

    // 11. export가 화면과 같은 상충을 싣는다(화면=문서 일관성)
    const docx = await page.request.post(`${BASE}/api/reports/${report.id}/export/docx`);
    assert(docx.ok(), "DOCX export 200");
    const zip = await JSZip.loadAsync(await docx.body());
    const xml = await zip.file("word/document.xml")!.async("string");
    assert(xml.includes("수치 상충") && xml.includes("95억원") && xml.includes("110억원") && xml.includes("감사보고서.pdf"), "DOCX에도 수치 상충 섹션(값·출처)이 실려야 함");
    console.log("✅ 11 — DOCX export에 화면과 같은 수치 상충(95억/110억·출처)이 실림");

    // 12. 반응형 + 접근성
    for (const width of [390, 430, 768, 1024, 1440]) {
      const c = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500 });
      const p = await c.newPage();
      await login(p);
      await p.goto(`${BASE}/reports/${report.id}`, { waitUntil: "networkidle" });
      await p.waitForSelector('[data-testid="vc-decision-workspace"][data-state="ready"]', { timeout: 30000 });
      await p.waitForTimeout(800);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert(!overflow, `${width}px에서 페이지가 가로로 넘치면 안 됨`);
      const sig = await p.getByTestId("vc-decision-signal").boundingBox();
      assert(!!sig && sig.x >= 0 && sig.x + sig.width <= width, `${width}px에서 시그널이 화면 안에 보여야 함`);
      const tbl = await p.getByTestId("vc-contradiction").first().boundingBox();
      assert(!!tbl && tbl.x + tbl.width <= width + 1, `${width}px에서 상충 패널이 화면을 넘지 않아야 함(표는 내부 스크롤)`);
      if (width === 390) {
        const a11y = await p.evaluate(() => ({
          alerts: document.querySelectorAll('[role="alert"]').length,
          h2: document.querySelectorAll("h2").length,
          h3: document.querySelectorAll("h3").length,
          tables: Array.from(document.querySelectorAll("table")).every((t) => !!t.querySelector("caption, th")),
          tinyText: Array.from(document.querySelectorAll('[data-testid="vc-decision-workspace"] *')).filter((el) => el.children.length === 0 && (el.textContent ?? "").trim().length > 0 && parseFloat(getComputedStyle(el).fontSize) < 12).length,
        }));
        assert(a11y.alerts >= 1, "상충/차단 경고는 role=alert로 스크린리더에 알려야 함");
        assert(a11y.h2 >= 1 && a11y.h3 >= 3, "제목 계층(h2 -> h3)이 있어야 함");
        assert(a11y.tables, "표에는 헤더 셀이 있어야 함");
        assert(a11y.tinyText === 0, `결정 워크스페이스에 12px 미만 글자가 없어야 함, 실제 ${a11y.tinyText}개`);
      }
      await c.close();
    }
    console.log("✅ 12 — 390/430/768/1024/1440px에서 가로 넘침 없음, 시그널·상충 패널이 화면 안, 접근성(alert·제목 계층·표 헤더·12px 이상)");

    const relevant = consoleErrors.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED") && !e.includes("Text content did not match") && !e.includes("Text content does not match") && !e.includes("error while hydrating"));
    assert(relevant.length === 0, `콘솔 에러 없어야 함: ${JSON.stringify(relevant.slice(0, 5))}`);
    console.log("\n✅ VC 결정 워크스페이스 E2E 전체 통과\n");
  } finally {
    await browser.close();
    await prisma.deal.delete({ where: { id: deal.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("\n❌ 실패:", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
