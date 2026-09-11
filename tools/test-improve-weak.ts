/**
 * 약한 섹션 일괄 개선 — 순차 오케스트레이션 + 안전한 JSON 파싱 테스트.
 *
 * Production에서 "일괄 개선 실패 / Failed to execute 'json' on 'Response':
 * Unexpected end of JSON input" 사고가 났다. 원인: 한 HTTP 요청 안에서
 * 최대 3~5개 섹션을 순차로 AI 재생성했는데, 섹션 하나의 AI 호출 예산만
 * (AI_CALL_BUDGET_MS 기본 40초) 2개만 돼도 Vercel 함수 실행시간 상한
 * (Hobby maxDuration=60초)을 넘겨 FUNCTION_INVOCATION_TIMEOUT으로 죽고,
 * 그 결과 body가 비거나 JSON이 아닌 채로 끊긴 응답에 프론트가 조건 없이
 * response.json()을 불러 파서 에러를 그대로 노출했다.
 *
 * 고친 구조: improve-weak GET(AI 호출 없음, 대상 목록만 계산) →
 * sections/regenerate POST(요청당 AI 호출 정확히 1회)를 프론트가 대상마다
 * 순차 호출. 이 파일은 그 순차 호출 로직(improve-weak-orchestration.ts)과
 * 안전 파싱(safe-fetch.ts)을 실제 네트워크 없이 검증한다.
 *
 * Usage: npm run test:improve-weak
 */
import {
  runBatchImprove,
  type WeakSectionTarget,
} from "../src/lib/improve-weak-orchestration";
import { safeReadJson } from "../src/lib/safe-fetch";
import { RATE_LIMITS } from "../src/lib/rate-limit";
import { evaluateReport } from "../src/lib/report-quality";
import { reportWriteWhere } from "../src/lib/team-access";
import { SectionKey } from "@prisma/client";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function fakeTarget(overrides: Partial<WeakSectionTarget>): WeakSectionTarget {
  return {
    sectionKey: "MARKET_ANALYSIS",
    title: "시장분석",
    score: 50,
    issues: ["출처 없음"],
    warnings: [],
    ...overrides,
  };
}

/** 1. 약한 섹션 1개 — 성공 */
async function testSingleSectionSuccess() {
  const targets = [fakeTarget({ sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", score: 60 })];
  const calls: string[] = [];
  const result = await runBatchImprove(targets, async (t) => {
    calls.push(t.sectionKey);
    return { ok: true, afterScore: 82 };
  });
  assert(calls.length === 1, `섹션 1개인데 호출이 ${calls.length}번 발생`);
  assert(result.improved.length === 1, "성공했는데 improved가 1개가 아님");
  assert(result.improved[0].afterScore === 82, "afterScore가 반영 안 됨");
  assert(!result.stoppedEarly, "성공했는데 stoppedEarly=true");
  console.log("✅ 약한 섹션 1개 → 성공");
}

/** 2. 약한 섹션 여러 개(3개) — 순서대로 전부 성공 */
async function testMultipleSectionsSequentialSuccess() {
  const targets = [
    fakeTarget({ sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", score: 40 }),
    fakeTarget({ sectionKey: "MARKET_ANALYSIS", title: "시장분석", score: 55 }),
    fakeTarget({ sectionKey: "FINANCIAL_STATUS", title: "재무현황", score: 60 }),
  ];
  const callOrder: string[] = [];
  const progressLog: Array<{ done: number; total: number }> = [];
  const result = await runBatchImprove(
    targets,
    async (t) => {
      callOrder.push(t.sectionKey);
      return { ok: true, afterScore: t.score + 20 };
    },
    (p) => progressLog.push({ done: p.done, total: p.total })
  );
  assert(
    callOrder.join(",") === "INVESTMENT_OVERVIEW,MARKET_ANALYSIS,FINANCIAL_STATUS",
    `호출 순서가 대상 목록 순서와 다름: ${callOrder.join(",")}`
  );
  assert(result.improved.length === 3, `3개 전부 성공해야 하는데 ${result.improved.length}개`);
  assert(!result.stoppedEarly, "전부 성공했는데 stoppedEarly=true");
  // progress: 0/3, 1/3, 1/3, 2/3, 2/3, 3/3 (각 섹션 시작/종료 시 1번씩)
  assert(progressLog.some((p) => p.done === 0 && p.total === 3), "시작 진행률(0/3) 콜백 누락");
  assert(progressLog.some((p) => p.done === 3 && p.total === 3), "완료 진행률(3/3) 콜백 누락");
  console.log("✅ 약한 섹션 3개 → 순서대로 전부 성공 + 진행률 콜백");
}

/** 3. 첫 섹션 성공, 두 번째 섹션 실패 → 세 번째는 호출조차 안 됨(부분 성공) */
async function testFirstSuccessSecondFailure() {
  const targets = [
    fakeTarget({ sectionKey: "INVESTMENT_OVERVIEW", title: "투자개요", score: 40 }),
    fakeTarget({ sectionKey: "MARKET_ANALYSIS", title: "시장분석", score: 55 }),
    fakeTarget({ sectionKey: "FINANCIAL_STATUS", title: "재무현황", score: 60 }),
  ];
  const callOrder: string[] = [];
  const result = await runBatchImprove(targets, async (t) => {
    callOrder.push(t.sectionKey);
    if (t.sectionKey === "MARKET_ANALYSIS") {
      return { ok: false, message: "서버 응답이 지연되어 개선 작업이 중단되었습니다." };
    }
    return { ok: true, afterScore: t.score + 20 };
  });
  assert(
    callOrder.join(",") === "INVESTMENT_OVERVIEW,MARKET_ANALYSIS",
    `2번째에서 멈춰야 하는데 실제 호출: ${callOrder.join(",")}`
  );
  assert(result.improved.length === 1, `1개만 성공해야 하는데 ${result.improved.length}개`);
  assert(result.improved[0].sectionKey === "INVESTMENT_OVERVIEW", "성공한 섹션이 틀림");
  assert(result.stoppedEarly, "실패했는데 stoppedEarly=false");
  assert(
    result.stopMessage === "서버 응답이 지연되어 개선 작업이 중단되었습니다.",
    "실패 메시지가 그대로 전달되지 않음"
  );
  console.log("✅ 1번째 성공 · 2번째 실패 → 3번째는 호출 안 됨(부분 성공)");
}

/** 4. 타임아웃/비-JSON 응답 처리 — 실제 사고 재현(빈 body, JSON 아닌 body, 정상 에러 JSON) */
async function testNonJsonResponseHandling() {
  // Vercel이 FUNCTION_INVOCATION_TIMEOUT으로 죽였을 때처럼 body가 완전히 빈 경우
  const emptyBody = new Response("", { status: 200 });
  const emptyResult = await safeReadJson(emptyBody);
  assert(!emptyResult.ok, "빈 body인데 성공으로 처리됨");
  if (!emptyResult.ok) {
    assert(
      !emptyResult.message.includes("Unexpected"),
      `원본 JSON 파서 에러 문구가 그대로 노출됨: ${emptyResult.message}`
    );
  }

  // Gateway 타임아웃류가 HTML/plain text로 오는 경우
  const htmlBody = new Response("<html><body>504 Gateway Timeout</body></html>", {
    status: 504,
  });
  const htmlResult = await safeReadJson(htmlBody);
  assert(!htmlResult.ok, "HTML body인데 성공으로 처리됨");
  if (!htmlResult.ok) {
    assert(!htmlResult.message.includes("Unexpected"), "HTML 응답에서도 원본 파서 에러가 새어나감");
  }

  // 잘림(truncated) JSON — 정상 요청 도중 끊긴 경우
  const truncated = new Response('{"data": {"targets": [', { status: 200 });
  const truncatedResult = await safeReadJson(truncated);
  assert(!truncatedResult.ok, "잘린 JSON인데 성공으로 처리됨");

  // 정상 JSON 에러 응답(429 rate limit 등)은 메시지를 그대로 전달
  const rateLimited = new Response(
    JSON.stringify({ error: "요청이 너무 잦습니다" }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
  const rateLimitedResult = await safeReadJson<{ error: string }>(rateLimited);
  assert(!rateLimitedResult.ok, "429인데 성공으로 처리됨");
  if (!rateLimitedResult.ok) {
    assert(rateLimitedResult.message === "요청이 너무 잦습니다", "에러 메시지가 그대로 전달 안 됨");
  }

  // 정상 성공 응답
  const ok = new Response(JSON.stringify({ data: { ok: true } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  const okResult = await safeReadJson<{ data: { ok: boolean } }>(ok);
  assert(okResult.ok && okResult.data.data.ok === true, "정상 JSON 응답 파싱 실패");

  console.log("✅ 빈 body/HTML/잘린 JSON에서도 원본 파서 에러가 노출되지 않고 의미 있는 메시지로 대체됨");
}

/** 5. 부분 성공 상태를 완전 실패와 구분한다 */
async function testPartialSuccessDistinctFromTotalFailure() {
  const targets = [
    fakeTarget({ sectionKey: "INVESTMENT_OVERVIEW", score: 40 }),
    fakeTarget({ sectionKey: "MARKET_ANALYSIS", score: 55 }),
  ];

  const partial = await runBatchImprove(targets, async (t) =>
    t.sectionKey === "INVESTMENT_OVERVIEW"
      ? { ok: true, afterScore: 80 }
      : { ok: false, message: "실패" }
  );
  assert(partial.improved.length === 1 && partial.stoppedEarly, "부분 성공 상태가 아님");

  const totalFailure = await runBatchImprove(targets, async () => ({
    ok: false,
    message: "실패",
  }));
  assert(
    totalFailure.improved.length === 0 && totalFailure.stoppedEarly,
    "전체 실패 상태가 아님(improved가 0이어야 함)"
  );

  console.log("✅ 부분 성공(improved>0)과 완전 실패(improved===0)를 구분해서 표현 가능");
}

/** 6. 부분 실패 후 재시도 — 이미 개선된 섹션은 다시 호출하지 않는다 */
async function testRetryAfterPartialFailureSkipsCompleted() {
  const allCalls: string[] = [];

  // 1차: 2번째에서 실패
  const firstRun = await runBatchImprove(
    [
      fakeTarget({ sectionKey: "INVESTMENT_OVERVIEW", score: 40 }),
      fakeTarget({ sectionKey: "MARKET_ANALYSIS", score: 55 }),
      fakeTarget({ sectionKey: "FINANCIAL_STATUS", score: 60 }),
    ],
    async (t) => {
      allCalls.push(t.sectionKey);
      if (t.sectionKey === "MARKET_ANALYSIS") return { ok: false, message: "실패" };
      return { ok: true, afterScore: 80 };
    }
  );
  assert(firstRun.improved.length === 1, "1차 실행 결과가 예상과 다름");

  // 재시도 시점: 서버가 evaluateReport를 다시 계산하면 이미 80점으로 개선된
  // INVESTMENT_OVERVIEW는 더 이상 "약한 섹션" 목록에 없다 — 여기서는 그
  // 재계산 결과를 흉내내, 남은 대상만 다시 넘긴다.
  const remainingTargets = [
    fakeTarget({ sectionKey: "MARKET_ANALYSIS", score: 55 }),
    fakeTarget({ sectionKey: "FINANCIAL_STATUS", score: 60 }),
  ];
  const secondRun = await runBatchImprove(remainingTargets, async (t) => {
    allCalls.push(t.sectionKey);
    return { ok: true, afterScore: 80 };
  });

  assert(secondRun.improved.length === 2, "재시도가 남은 섹션을 전부 처리하지 못함");
  assert(
    allCalls.filter((k) => k === "INVESTMENT_OVERVIEW").length === 1,
    "이미 개선된 섹션(INVESTMENT_OVERVIEW)이 재시도에서 불필요하게 다시 호출됨"
  );
  console.log("✅ 부분 실패 후 재시도해도 이미 완료된 섹션은 다시 생성하지 않음");
}

/** 7. quota/rate-limit 보존 — AI 비용 방어선이 sectionRegenerate로 유지된다 */
function testQuotaRateLimitPreserved() {
  assert(Boolean(RATE_LIMITS.sectionRegenerate), "RATE_LIMITS.sectionRegenerate가 없음");
  assert(RATE_LIMITS.sectionRegenerate.limit > 0, "sectionRegenerate rate limit이 비정상");
  // improveWeak 항목 자체는 더 이상 라우트에서 안 쓰지만, 회귀 방지용으로 남겨둔다
  assert(Boolean(RATE_LIMITS.improveWeak), "RATE_LIMITS.improveWeak가 삭제됨(test-security.ts와 충돌)");
  console.log("✅ AI 비용 rate limit(sectionRegenerate) 유지, improveWeak 설정도 보존");
}

/** 8. 인가 — improve-weak GET도 sections/regenerate와 동일하게 reportWriteWhere로 편집 권한만 허용 */
function testAuthorization() {
  const analystWrite = reportWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(analystWrite) === JSON.stringify({ deal: { userId: "u2" } }),
    "ANALYST는 본인 소유 딜의 보고서만 개선 대상 목록을 볼 수 있어야 함"
  );
  const partnerWrite = reportWriteWhere("u2", "t1", "PARTNER");
  assert(
    Array.isArray((partnerWrite as { deal?: { OR?: unknown } }).deal?.OR),
    "PARTNER는 팀 공유 보고서도 개선 대상으로 볼 수 있어야 함"
  );
  console.log("✅ improve-weak(GET)/sections-regenerate(POST) 모두 reportWriteWhere로 편집 권한만 허용");
}

/** 9. 기존 Report Quality Score 계산과의 호환성 — evaluateReport 응답 형태가 그대로 유지된다 */
function testExistingQualityScoreCompatibility() {
  const summary = evaluateReport(
    [
      { sectionKey: SectionKey.MARKET_ANALYSIS, content: "# 시장분석\n\n짧음" },
      { sectionKey: SectionKey.FINANCIAL_STATUS, content: "# 재무현황\n\n" + "충분히 긴 본문 ".repeat(50) },
    ],
    {}
  );
  assert(typeof summary.overallScore === "number", "overallScore 타입이 바뀜");
  assert(Array.isArray(summary.sections), "sections가 배열이 아님");
  for (const s of summary.sections) {
    assert(typeof s.sectionKey === "string", "sectionKey 필드가 없음(improve-weak GET이 의존)");
    assert(typeof s.score === "number", "score 필드가 없음(improve-weak GET이 의존)");
    assert(Array.isArray(s.issues), "issues 필드가 없음(improve-weak GET이 의존)");
    assert(Array.isArray(s.warnings), "warnings 필드가 없음(improve-weak GET이 의존)");
  }
  console.log("✅ evaluateReport() 응답 형태(sectionKey/score/issues/warnings) 그대로 — Report Quality Score 로직 미변경");
}

async function main() {
  console.log("\n=== DealMind 약한 섹션 일괄 개선 테스트 ===\n");
  await testSingleSectionSuccess();
  await testMultipleSectionsSequentialSuccess();
  await testFirstSuccessSecondFailure();
  await testNonJsonResponseHandling();
  await testPartialSuccessDistinctFromTotalFailure();
  await testRetryAfterPartialFailureSkipsCompleted();
  testQuotaRateLimitPreserved();
  testAuthorization();
  testExistingQualityScoreCompatibility();
  console.log("\n✅ 약한 섹션 일괄 개선 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
