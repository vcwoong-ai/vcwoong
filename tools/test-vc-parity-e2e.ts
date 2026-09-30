/**
 * VC 결정 정합성(parity) E2E — API → 화면 → DOCX를 같은 report ID로 나란히 대조한다.
 *
 * 머지 게이트용: (1) API가 canonical 엔진 직접 호출 결과와 byte 단위로 같은지,
 * (2) 화면이 API 값을 그대로 렌더링하는지, (3) DOCX가 같은 상충/Breaker/누락정보/
 * 확신도/gate/밸류에이션/IC 질문을 싣는지를 fixture 여러 개로 확인한다.
 * 그리고 로딩/오류/빈 상태/게이트 실패에서 긍정 상태가 만들어지지 않는지,
 * 키보드로 워크스페이스에 도달하고 포커스가 보이는지 확인한다.
 *
 * Usage: npm run dev:local 후 npm run test:vc-parity-e2e
 */
import { chromium, type APIRequestContext, type Page } from "playwright";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { traceReportEvidence } from "../src/lib/evidence";
import { buildScoreEvidenceAssessment } from "../src/lib/deal-scoring-evidence";
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "../src/lib/deal-scoring-shared";
import { computeReportDecision } from "../src/lib/vc-decision-loader";
import { INVESTMENT_SIGNAL_LABEL } from "../src/lib/ic-review";
import { VC_EVIDENCE_STATE_LABEL } from "../src/lib/vc-decision-types";

const BASE = (process.argv[2] ?? process.env.E2E_TEST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "demo@dealmind.kr";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "Demo1234!";
const prisma = new PrismaClient();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
}

type SectionSpec = { key: string; title: string; content: string };
interface FixtureSpec {
  id: string;
  label: string;
  sections: SectionSpec[];
  docs: Array<{ name: string; text: string }>;
  investAmount: number | null;
  valuation: number | null;
  withScore?: boolean;
  /** 이 fixture에서 기대하는 상충 개수(음수 부호 한계 등 알려진 한계는 실제 동작 그대로 기록) */
  expectContradictions: number;
}

const F = (key: string, title: string, content: string): SectionSpec => ({ key, title, content });

const FIXTURES: FixtureSpec[] = [
  {
    // Stop Test: 재무 차원, 상충 두 claim이 keyEvidence(상위 3개) 밖
    id: "stop", label: "Stop Test(상충 claim이 keyEvidence 밖)",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "총자산 200억원, 부채 50억원, 자본 150억원이다. 2024년 매출 95억원을 기록했다. 2024년 매출 110억원으로 집계한 자료도 있다.")],
    docs: [{ name: "IR.pdf", text: "총자산 200억원 부채 50억원 자본 150억원 2024년 매출 95억원" }, { name: "감사.pdf", text: "2024년 매출액 110억원" }],
    investAmount: 50, valuation: 400, expectContradictions: 1,
  },
  {
    // contradiction 2+ / 같은 dimension 여러 개 / 3개 값 / 밸류에이션 섹션 상충 / P0·P1 중복 후보(근거 없는 8,000억원)
    id: "multi", label: "상충 2+ · 3값 · 같은 차원 다수 · 밸류에이션 섹션",
    sections: [
      F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원, 2024년 매출 110억원, 2024년 매출 102억원. 현금성자산 30억원. 현금성자산 35억원."),
      F("VALUATION", "밸류에이션", "포스트밸류 400억원을 적용한다."),
      F("INVESTMENT_TERMS", "투자 조건", "포스트밸류 450억원 기준으로 협의한다."),
      F("MARKET_ANALYSIS", "시장 분석", "국내 시장은 8,000억원 규모다."),
    ],
    docs: [{ name: "IR.pdf", text: "매출 95억원 현금성자산 30억원 포스트밸류 400억원" }, { name: "감사.pdf", text: "매출액 110억원 현금성자산 35억원" }, { name: "기타.pdf", text: "매출 102억원 포스트밸류 450억원" }],
    investAmount: 50, valuation: 400, expectContradictions: 3,
  },
  {
    id: "clean", label: "상충 0 · 근거 충분",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원, 현금성자산 30억원이다."), F("COMPANY_OVERVIEW", "회사 개요", "특허 12건, 임직원 38명이다.")],
    docs: [{ name: "IR.pdf", text: "2024년 매출 95억원 현금성자산 30억원 특허 12건 임직원 38명" }],
    investAmount: 50, valuation: 400, expectContradictions: 0,
  },
  {
    id: "noval", label: "밸류에이션 입력 전부 누락",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원이다.")],
    docs: [{ name: "IR.pdf", text: "2024년 매출 95억원" }],
    investAmount: null, valuation: null, expectContradictions: 0,
  },
  {
    id: "partval", label: "밸류에이션 입력 일부 누락(투자금액만)",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원이다.")],
    docs: [{ name: "IR.pdf", text: "2024년 매출 95억원" }],
    investAmount: 50, valuation: null, expectContradictions: 0,
  },
  {
    // 음수: 부호만 다른 값은 탐지 못 함(알려진 한계 P3) — 실제 동작을 그대로 기록한다
    id: "neg", label: "음수 값(-12 vs 12 : 알려진 한계 재현)",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "영업이익 -12억원을 기록했다. 영업이익 12억원으로도 표기됐다.")],
    docs: [{ name: "IR.pdf", text: "영업이익 12억원" }],
    investAmount: 50, valuation: 400, expectContradictions: 0,
  },
  {
    // 매우 긴 출처명 + 한글/영문/특수문자(XML 특수문자 포함)
    id: "special", label: "긴 출처명·특수문자 출처",
    sections: [F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원. 2024년 매출 110억원.")],
    docs: [
      { name: `A&B "IR" <deck> 'v2' ${"매우긴출처명".repeat(20)}.pdf`, text: "2024년 매출 95억원" },
      { name: "Audit 보고서 (final)_2024.pdf", text: "2024년 매출액 110억원" },
    ],
    investAmount: 50, valuation: 400, expectContradictions: 1,
  },
  {
    id: "noscore", label: "점수 없음(hasScore=false)", withScore: false,
    sections: [F("FINANCIAL_STATUS", "재무 현황", "2024년 매출 95억원. 2024년 매출 110억원.")],
    docs: [{ name: "IR.pdf", text: "2024년 매출 95억원" }, { name: "감사.pdf", text: "2024년 매출액 110억원" }],
    investAmount: 50, valuation: 400, expectContradictions: 1,
  },
];

function plainFromDocx(xml: string): string {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

async function createFixture(userId: string, teamId: string | null, spec: FixtureSpec, tag: string) {
  const deal = await prisma.deal.create({
    data: { name: `PARITY ${spec.id} ${tag}`, companyName: `PARITY-${spec.id}`, sector: "IT", stage: "SCREENING", investAmount: spec.investAmount, valuation: spec.valuation, userId, teamId },
  });
  for (const d of spec.docs) {
    await prisma.document.create({ data: { dealId: deal.id, name: d.name, type: "OTHER", url: "x://p", size: 1, mimeType: "application/pdf", parsedText: d.text } });
  }
  const report = await prisma.report.create({ data: { dealId: deal.id, title: `${spec.id} 보고서`, agentType: "IT", status: "DRAFT", generatedAt: new Date() } });
  let order = 0;
  for (const s of spec.sections) {
    await prisma.reportSection.create({ data: { reportId: report.id, sectionKey: s.key as never, title: s.title, content: s.content, order: order++, status: "DRAFT" } });
  }
  if (spec.withScore !== false) {
    const docs = await prisma.document.findMany({ where: { dealId: deal.id }, select: { id: true, name: true, parsedText: true } });
    const claims = traceReportEvidence(spec.sections.map((s) => ({ sectionKey: s.key, content: s.content })), docs, { investAmount: spec.investAmount, valuation: spec.valuation }, undefined).claims;
    const scores = { marketSize: 78, team: 72, product: 80, businessModel: 68, financials: 74, moat: 70 } as Record<ScoreDimensionKey, number>;
    const rationale = { marketSize: "시장", team: "팀", product: "제품", businessModel: "모델", financials: "재무", moat: "해자" };
    const assessment = buildScoreEvidenceAssessment(scores, rationale, claims, "report_evidence");
    await prisma.dealScore.create({
      data: { dealId: deal.id, overall: Math.round(SCORE_DIMENSIONS.reduce((a, d) => a + scores[d.key], 0) / SCORE_DIMENSIONS.length), ...scores, rationale, modelUsed: "fixture", evidenceAssessment: assessment as never },
    });
  }
  return { deal, report };
}

async function canonicalDirect(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      sections: { orderBy: { order: "asc" }, select: { sectionKey: true, title: true, content: true } },
      deal: { select: { investAmount: true, valuation: true, documents: { select: { id: true, name: true, parsedText: true } }, score: { select: { overall: true, rationale: true, evidenceAssessment: true } } } },
      evidenceCheck: { select: { verdicts: true } },
      icQuestions: { select: { questions: true } },
    },
  });
  return computeReportDecision(report as never);
}

async function main() {
  console.log(`\n=== VC 결정 정합성(API → 화면 → DOCX) E2E — 대상: ${BASE} ===\n`);
  const demo = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, teamId: true } });
  assert(!!demo, "demo 유저 필요");
  const tag = String(Date.now());
  const created: Array<{ spec: FixtureSpec; dealId: string; reportId: string }> = [];
  for (const spec of FIXTURES) {
    const { deal, report } = await createFixture(demo!.id, demo!.teamId, spec, tag);
    created.push({ spec, dealId: deal.id, reportId: report.id });
  }
  // 섹션 없는 보고서(15번 edge: report는 있으나 본문 없음)
  const emptyDeal = await prisma.deal.create({ data: { name: `PARITY empty ${tag}`, companyName: "PARITY-empty", sector: "IT", stage: "SCREENING", userId: demo!.id, teamId: demo!.teamId } });
  const emptyReport = await prisma.report.create({ data: { dealId: emptyDeal.id, title: "빈 보고서", agentType: "IT", status: "PENDING" } });

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const req: APIRequestContext = ctx.request;
  const consoleErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message.slice(0, 200)}`));

  try {
    await login(page);

    for (const { spec, reportId } of created) {
      const res = await req.get(`${BASE}/api/reports/${reportId}/decision`);
      assert(res.ok(), `[${spec.id}] decision API 200`);
      const api = (await res.json()).data;
      const d = api.decision;

      // ── (1) API == canonical 엔진 직접 호출 ─────────────────────────
      const direct = await canonicalDirect(reportId);
      assert(JSON.stringify(d) === JSON.stringify(direct.decision), `[${spec.id}] API decision이 canonical 엔진 직접 호출 결과와 byte 단위로 같아야 함(API가 재계산하지 않음)`);
      assert(JSON.stringify(api.gate) === JSON.stringify(direct.gate), `[${spec.id}] API gate가 canonical gate와 같아야 함`);
      assert(d.contradictions.length === spec.expectContradictions, `[${spec.id}] 상충 개수 기대 ${spec.expectContradictions}, 실제 ${d.contradictions.length}`);

      // Stop Test 전제: 상충 claim이 keyEvidence 밖인지 fixture 자체를 검증
      if (spec.id === "stop") {
        const fin = await prisma.dealScore.findFirst({ where: { deal: { reports: { some: { id: reportId } } } }, select: { evidenceAssessment: true } });
        const key = (fin!.evidenceAssessment as { dimensions: { financials: { keyEvidence: Array<{ raw: string }> } } }).dimensions.financials.keyEvidence.map((e) => e.raw);
        assert(!key.includes("95억원") && !key.includes("110억원"), `[stop] fixture 전제: 상충 claim 둘 다 keyEvidence 밖이어야 함(실제 keyEvidence=${JSON.stringify(key)})`);
        assert(d.decisionDimensions.find((x: { dimension: string }) => x.dimension === "financials").state === "CONTRADICTED", "[stop] Decision Map: 재무=CONTRADICTED");
        assert(d.drivers.find((x: { dimension: string }) => x.dimension === "financials")?.evidenceState === "CONTRADICTED", "[stop] Driver: 재무=CONTRADICTED");
        assert(d.thesisBreakers.some((b: { trigger: string }) => b.trigger === "CONTRADICTION"), "[stop] Breaker: CONTRADICTION 존재");
        assert(d.missingInformation.some((m: { id: string; priority: string }) => m.id.startsWith("missing:contradiction:") && m.priority === "P0"), "[stop] Missing Info: 상충 P0 존재");
        assert(d.confidence === "CONTRADICTED", "[stop] Confidence=CONTRADICTED");
        assert(api.gate.ok === true && d.thesis.includes("수치 상충"), "[stop] Thesis가 상충을 언급하고 gate는 상충을 명시한 채 통과");
        // gate에 상충 은폐가 들어오면 거부되는지(같은 fixture의 변조본)
        const { checkVCDecisionGate } = await import("../src/lib/vc-decision-gate");
        const tampered = JSON.parse(JSON.stringify(d));
        tampered.drivers.find((x: { dimension: string }) => x.dimension === "financials").evidenceState = "VERIFIED";
        assert(!checkVCDecisionGate(tampered).ok, "[stop] Driver를 '확인됨'으로 바꾸면 gate가 거부해야 함");
      }

      // ── (2) 화면 == API ─────────────────────────────────────────────
      await page.goto(`${BASE}/reports/${reportId}`, { waitUntil: "networkidle" });
      const state = api.hasScore ? (api.gate.ok ? "ready" : "gate-failed") : "no-score";
      await page.waitForSelector(`[data-testid="vc-decision-workspace"][data-state="${state}"]`, { timeout: 30000 });
      assert((await page.getByTestId("vc-contradiction").count()) === d.contradictions.length, `[${spec.id}] 화면 상충 패널 수 == API`);
      if (state === "ready") {
        assert((await page.getByTestId("vc-decision-signal").innerText()).trim() === INVESTMENT_SIGNAL_LABEL[d.signal as keyof typeof INVESTMENT_SIGNAL_LABEL].label, `[${spec.id}] 화면 시그널 == API`);
        assert((await page.getByTestId("vc-decision-thesis").innerText()).trim() === d.thesis, `[${spec.id}] 화면 논지 == API`);
        assert((await page.getByTestId("vc-driver").count()) === d.drivers.length, `[${spec.id}] Driver 수 == API`);
        const uiStates = await page.getByTestId("vc-driver").evaluateAll((els) => els.map((e) => e.getAttribute("data-evidence-state")));
        assert(JSON.stringify(uiStates) === JSON.stringify(d.drivers.map((x: { evidenceState: string }) => x.evidenceState)), `[${spec.id}] Driver 상태 순서 == API (${JSON.stringify(uiStates)})`);
        assert((await page.getByTestId("vc-breaker").count()) === d.thesisBreakers.length, `[${spec.id}] Breaker 수 == API`);
        assert((await page.getByTestId("vc-missing-item").count()) === d.missingInformation.length, `[${spec.id}] 미확인 정보 수 == API`);
        for (const pr of ["P0", "P1", "P2"]) {
          assert((await page.locator(`[data-testid="vc-missing-item"][data-priority="${pr}"]`).count()) === d.missingInformation.filter((m: { priority: string }) => m.priority === pr).length, `[${spec.id}] ${pr} 개수 == API`);
        }
        const statsText = await page.getByTestId("vc-decision-stats").innerText();
        assert(statsText.includes(VC_EVIDENCE_STATE_LABEL[d.confidence as keyof typeof VC_EVIDENCE_STATE_LABEL]), `[${spec.id}] 확신도 라벨 == API`);
        const val = await page.getByTestId("vc-valuation").innerText();
        for (const li of d.valuation.lineItems) {
          assert(val.includes(li.label), `[${spec.id}] 밸류에이션 라인 '${li.label}' 표시`);
          if (li.status === "computed") assert(val.includes(li.value), `[${spec.id}] 계산값 ${li.value} 표시`);
          else assert(val.includes("산출 불가") && val.includes(li.requiredInput), `[${spec.id}] 산출 불가 + 필요 입력 표시(임의 숫자 없음)`);
        }
      } else {
        assert((await page.getByTestId("vc-decision-signal").count()) === 0, `[${spec.id}] ${state}에서는 시그널(긍정 상태)을 만들지 않음`);
        assert((await page.getByTestId("vc-driver").count()) === 0, `[${spec.id}] ${state}에서는 Driver를 만들지 않음`);
      }

      // ── (3) DOCX == API ─────────────────────────────────────────────
      if (spec.id !== "noscore") {
        const docx = await req.post(`${BASE}/api/reports/${reportId}/export/docx`);
        assert(docx.ok(), `[${spec.id}] DOCX export 200(특수문자 출처명 포함)`);
        const zip = await JSZip.loadAsync(await docx.body());
        const text = plainFromDocx(await zip.file("word/document.xml")!.async("string"));
        assert(text.includes("투자 결정 요약") || !api.gate.ok || d.decisionDimensions.length === 0, `[${spec.id}] DOCX에 결정 요약`);
        assert((text.match(/개 값이 상충/g) ?? []).length === d.contradictions.length, `[${spec.id}] DOCX 상충 섹션 수 == API(${d.contradictions.length})`);
        for (const c of d.contradictions) {
          for (const v of c.values) {
            assert(text.includes(v.raw), `[${spec.id}] DOCX에 상충 값 ${v.raw}`);
            if (v.documentName) assert(text.includes(v.documentName.replace(/\s+/g, " ")), `[${spec.id}] DOCX에 출처명(${v.documentName.slice(0, 20)}…)`);
            assert(text.includes(v.period === "UNSPECIFIED" ? "명시 없음" : v.period), `[${spec.id}] DOCX에 기간`);
          }
        }
        if (api.gate.ok) {
          for (const b of d.thesisBreakers) assert(text.includes(b.title), `[${spec.id}] DOCX에 Breaker '${b.title}'`);
          for (const m of d.missingInformation) assert(text.includes(`[${m.priority}] ${m.item}`), `[${spec.id}] DOCX에 누락정보 [${m.priority}] ${m.item.slice(0, 24)}`);
          assert(text.includes(VC_EVIDENCE_STATE_LABEL[d.confidence as keyof typeof VC_EVIDENCE_STATE_LABEL]), `[${spec.id}] DOCX 확신도 == API`);
          assert(text.includes(d.thesis.slice(0, 30)), `[${spec.id}] DOCX 논지 == API`);
          for (const li of d.valuation.lineItems) {
            assert(text.includes(li.label), `[${spec.id}] DOCX 밸류에이션 '${li.label}'`);
            if (li.status === "computed") assert(text.includes(li.value), `[${spec.id}] DOCX 계산값 ${li.value}`);
            else assert(text.includes("NOT COMPUTABLE"), `[${spec.id}] DOCX '계산 불가' 명시(임의 숫자 없음)`);
          }
          assert(!text.includes("일관성 검증을 통과하지 못했습니다"), `[${spec.id}] gate=ok인데 DOCX가 실패를 표시하면 안 됨`);
        } else {
          assert(text.includes("일관성 검증을 통과하지 못했습니다"), `[${spec.id}] gate 실패 시 DOCX도 동일하게 실패 표시`);
        }
      }

      // 같은 공백이 P0/P1로 이중 표시되지 않음
      const items: Array<{ item: string; relatedDimension?: string; priority: string }> = d.missingInformation;
      const dup = items.filter((m, i) => items.findIndex((o) => o.item === m.item && o.relatedDimension === m.relatedDimension) !== i);
      assert(dup.length === 0, `[${spec.id}] 누락정보 중복 없음`);
      console.log(`✅ ${spec.label} — API=엔진 직접 호출, 화면=API, DOCX=API (상충 ${d.contradictions.length}건, Breaker ${d.thesisBreakers.length}, 누락 ${d.missingInformation.length}, gate ${api.gate.ok ? "ok" : "차단"})`);
    }

    // ── IC 질문: 생성 → API/화면/DOCX 동일, AI 없이 상충 질문 생성 ─────
    const multi = created.find((c) => c.spec.id === "multi")!;
    const gen = await req.post(`${BASE}/api/reports/${multi.reportId}/ic-questions/generate`);
    assert(gen.ok(), "IC 질문 생성 200(AI 미설정 환경에서도 결정적으로 생성)");
    const api2 = (await (await req.get(`${BASE}/api/reports/${multi.reportId}/decision`)).json()).data;
    const cq = api2.questionLinks.filter((l: { question: { trigger: string } }) => l.question.trigger === "CONTRADICTION");
    assert(cq.length === api2.decision.contradictions.length, `상충 ${api2.decision.contradictions.length}건이 모두 IC 질문이 됨(실제 ${cq.length})`);
    assert(cq.every((l: { question: { priority: string; source: string; question: string }; linkedTo: unknown[] }) => l.question.priority === "HIGH" && l.question.source === "deterministic" && l.linkedTo.length > 0), "상충 질문은 HIGH·결정적·결정 이슈에 연결");
    for (const c of api2.decision.contradictions) {
      const q = cq.find((l: { question: { question: string } }) => c.values.every((v: { raw: string }) => l.question.question.includes(v.raw)));
      assert(!!q, `상충(${c.metricLabel})의 모든 값이 질문 문장에 포함`);
    }
    await page.goto(`${BASE}/reports/${multi.reportId}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="vc-question"]', { timeout: 30000 });
    assert((await page.getByTestId("vc-question").count()) === Math.min(8, api2.questionLinks.length), "화면 IC 질문 수 == min(8, API 연결 질문 수)");
    const docx2 = await req.post(`${BASE}/api/reports/${multi.reportId}/export/docx`);
    const text2 = plainFromDocx(await (await JSZip.loadAsync(await docx2.body())).file("word/document.xml")!.async("string"));
    for (const l of cq) assert(text2.includes(l.question.question.slice(0, 40)), "DOCX IC 질문 섹션에 상충 질문 포함");
    console.log("✅ IC 질문 — 상충 전부 결정적 HIGH 질문(AI 없이), 값·출처 포함, 화면/API/DOCX 동일");

    // ── 15) 없는 report / 섹션 없는 report ────────────────────────────
    assert((await req.get(`${BASE}/api/reports/does-not-exist/decision`)).status() === 404, "없는 report는 404");
    const emptyRes = await req.get(`${BASE}/api/reports/${emptyReport.id}/decision`);
    assert(emptyRes.ok(), "섹션 없는 report도 200");
    const emptyData = (await emptyRes.json()).data;
    assert(emptyData.hasScore === false && emptyData.decision.contradictions.length === 0 && emptyData.decision.drivers.length === 0, "섹션·점수 없는 report는 긍정 상태 없이 빈 결정");
    console.log("✅ 없는 report 404, 섹션·점수 없는 report는 빈 결정(임의 긍정 상태 없음)");

    // ── 2.3~2.5 로딩/오류/게이트 실패 상태 ────────────────────────────
    const stop = created.find((c) => c.spec.id === "stop")!;
    const pageErr = await ctx.newPage();
    await pageErr.route(`**/api/reports/${stop.reportId}/decision`, (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }));
    await pageErr.goto(`${BASE}/reports/${stop.reportId}`, { waitUntil: "networkidle" });
    await pageErr.getByText("투자 결정 요약을 불러오지 못했습니다").first().waitFor({ timeout: 30000 });
    assert((await pageErr.getByTestId("vc-decision-signal").count()) === 0 && (await pageErr.getByRole("button", { name: "다시 시도" }).count()) === 1, "API 실패 시 오류 상태+재시도(정상 decision처럼 표시하지 않음)");
    await pageErr.close();

    const pageSlow = await ctx.newPage();
    await pageSlow.route(`**/api/reports/${stop.reportId}/decision`, async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue(); });
    await pageSlow.goto(`${BASE}/reports/${stop.reportId}`, { waitUntil: "domcontentloaded" });
    await pageSlow.getByText("투자 결정 요약을 불러오는 중").waitFor({ timeout: 30000 });
    assert((await pageSlow.getByTestId("vc-decision-signal").count()) === 0 && (await pageSlow.getByTestId("vc-driver").count()) === 0, "로딩 중에는 이전/기본 decision이 노출되지 않음");
    await pageSlow.waitForSelector('[data-testid="vc-decision-workspace"][data-state="ready"]', { timeout: 30000 });
    await pageSlow.close();

    const pageGate = await ctx.newPage();
    await pageGate.route(`**/api/reports/${stop.reportId}/decision`, async (r) => {
      const real = await r.fetch();
      const json = await real.json();
      json.data.gate = { ok: false, reason: "TEST_GATE_FAILURE" };
      await r.fulfill({ response: real, body: JSON.stringify(json), headers: { ...real.headers(), "content-length": undefined as never } });
    });
    await pageGate.goto(`${BASE}/reports/${stop.reportId}`, { waitUntil: "networkidle" });
    await pageGate.waitForSelector('[data-testid="vc-decision-workspace"][data-state="gate-failed"]', { timeout: 30000 });
    assert((await pageGate.getByTestId("vc-decision-signal").count()) === 0 && (await pageGate.getByTestId("vc-driver").count()) === 0 && (await pageGate.getByTestId("vc-contradiction").count()) >= 1, "gate 실패 시 검증 안 된 요약은 숨기되 상충은 계속 표시");
    await pageGate.close();
    console.log("✅ 로딩 중 decision 미노출 / API 오류 시 오류 상태 / gate 실패 시 요약 숨김+상충 유지");

    // ── 키보드 접근·포커스 표시 ─────────────────────────────────────
    await page.goto(`${BASE}/reports/${stop.reportId}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="vc-decision-workspace"][data-state="ready"]', { timeout: 30000 });
    let reached: { inside: boolean; ring: boolean; text: string } | null = null;
    for (let i = 0; i < 80 && !reached; i++) {
      await page.keyboard.press("Tab");
      const st = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const ws = document.querySelector('[data-testid="vc-decision-workspace"]');
        if (!el || !ws || !ws.contains(el)) return null;
        const cs = getComputedStyle(el);
        return { inside: true, ring: cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0), text: (el.textContent ?? "").trim().slice(0, 30) };
      });
      if (st) reached = st;
    }
    assert(!!reached && reached.ring, `키보드 Tab으로 결정 워크스페이스 안의 요소(${reached?.text})에 도달하고 포커스 링이 보여야 함`);
    console.log(`✅ 키보드 Tab으로 워크스페이스 도달('${reached!.text}'), 포커스 링 표시`);

    const relevant = consoleErrors.filter((e) => !e.includes("ERR_TUNNEL_CONNECTION_FAILED") && !e.includes("Text content did not match") && !e.includes("Text content does not match") && !e.includes("error while hydrating") && !e.includes("Failed to load resource: the server responded with a status of 500"));
    assert(relevant.length === 0, `콘솔 에러: ${JSON.stringify(relevant.slice(0, 4))}`);
    console.log("\n✅ VC 결정 정합성 E2E 전체 통과\n");
  } finally {
    await browser.close();
    await prisma.deal.deleteMany({ where: { name: { contains: tag } } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("\n❌ 실패:", e);
  await prisma.deal.deleteMany({ where: { companyName: { startsWith: "PARITY-" } } }).catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
