/**
 * 자동 checkpoint resume이 report-generation rate limit(사용자당 1시간
 * 10회)을 소모하는 문제 수정 검증.
 *
 * 배경(Production 진단으로 확인된 사실): POST /api/deals/[id]/reports(신규
 * 생성)와 POST /api/reports/[id]/run(재개/재시도)이 동일 카운터
 * (`report-gen:${userId}`)를 공유하는데, report-generation.ts는 함수
 * 실행시간 상한 때문에 한 번의 생성이 여러 invocation(체크포인트)으로
 * 나뉘는 게 정상 구조다. 브라우저가 체크포인트마다 사용자 조작 없이 스스로
 * 거는 /run 자동 재개 호출까지 이 카운터에 합산되면서, 사용자가 실제로는
 * 1번만 생성 요청했는데도 429("보고서 생성 요청이 너무 잦습니다")가 났다.
 *
 * 수정: /run에 trigger("user"|"auto") 파라미터를 추가해, 자동 재개
 * (trigger="auto")만 rate limit에서 제외한다. mode="restart"(재생성 버튼)는
 * trigger 값과 무관하게 항상 카운트한다. 실제 rate limit 값(limit/window)은
 * 전혀 바꾸지 않았다 — 카운트 여부를 가르는 조건만 추가했다.
 *
 * DB(Neon)가 없는 이 테스트 환경에서는 checkRateLimit() 자체(실제 카운터
 * 증감)를 직접 실행할 수 없다 — 대신 (1) 카운트 여부를 결정하는 순수 함수
 * isAutoResumeExemptFromRateLimit()를 직접 호출해 진리표를 검증하고,
 * (2) 각 라우트/컴포넌트가 실제로 그 함수와 올바른 trigger 값을 쓰도록
 * 배선돼 있는지 소스 정적 검사로 확인한다 — tools/test-cost-performance-
 * routing.ts가 이미 쓰는 것과 같은 방법이다.
 *
 * Usage: npm run test:auto-resume-rate-limit
 */
import * as fs from "fs";
import * as path from "path";
import { isAutoResumeExemptFromRateLimit, RATE_LIMITS } from "../src/lib/rate-limit";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function readSource(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

const RUN_ROUTE = "src/app/api/reports/[id]/run/route.ts";
const CREATE_ROUTE = "src/app/api/deals/[id]/reports/route.ts";
const CRON_ROUTE = "src/app/api/cron/resume-generations/route.ts";
const WIZARD = "src/components/reports/report-wizard.tsx";
const PAGE_CLIENT = "src/app/reports/[id]/report-page-client.tsx";

/** A. 신규 보고서 생성(POST /api/deals/[id]/reports)은 여전히 무조건 카운트한다 */
function testNewReportCreationAlwaysCountsRateLimit() {
  const source = readSource(CREATE_ROUTE);
  assert(
    /checkRateLimit\(\s*`report-gen:\$\{session\.user\.id\}`/.test(source),
    "신규 보고서 생성 라우트가 report-gen rate limit을 더 이상 호출하지 않음"
  );
  assert(
    !/isAutoResumeExemptFromRateLimit/.test(source),
    "신규 보고서 생성 라우트에 auto-resume 예외 로직이 잘못 배선됨 — 이 경로는 항상 카운트해야 한다"
  );
  console.log("✅ A. POST /api/deals/[id]/reports — 여전히 무조건 report-gen rate limit을 소모함(변경 없음)");
}

/** B. 사용자 명시적 재생성(mode=restart)은 trigger 값과 무관하게 항상 카운트한다 */
function testExplicitRestartAlwaysCounts() {
  assert(
    isAutoResumeExemptFromRateLimit("restart", "auto") === false,
    "mode=restart인데 trigger=auto라는 이유로 rate limit이 면제됨 — 재생성 버튼은 항상 명시적 조작이라 반드시 카운트해야 한다"
  );
  assert(
    isAutoResumeExemptFromRateLimit("restart", "user") === false,
    "mode=restart(trigger=user)가 카운트되지 않음"
  );
  assert(
    isAutoResumeExemptFromRateLimit("resume", "user") === false,
    "trigger=user(명시적 재시도)가 카운트되지 않음"
  );
  assert(
    isAutoResumeExemptFromRateLimit("resume", undefined) === false,
    "trigger 누락(구버전 호출/알 수 없는 값)이 기본값으로 면제됨 — fail-safe 방향이 반대(우회 허용)로 되어 있음"
  );

  const pageSource = readSource(PAGE_CLIENT);
  const regenBlock = pageSource.match(/handleRegenerate = async[\s\S]*?\n  \};/);
  assert(Boolean(regenBlock), "handleRegenerate 함수를 찾지 못함");
  assert(
    /mode:\s*"restart"/.test(regenBlock![0]),
    "handleRegenerate가 mode:'restart'를 보내지 않음(재생성 계약 깨짐)"
  );
  assert(
    !/trigger:\s*"auto"/.test(regenBlock![0]),
    "handleRegenerate(사용자가 누르는 '재생성' 버튼)가 trigger:'auto'를 보냄 — 명시적 조작인데 자동으로 위장돼 rate limit이 새로 빠짐"
  );
  console.log("✅ B. 사용자 명시적 재생성/재시도(restart, 또는 trigger 없는 resume) — 기존대로 항상 rate limit 카운트");
}

/** C. 자동 checkpoint resume(trigger=auto, mode=resume)만 정확히 면제된다 */
function testAutoResumeIsExempt() {
  assert(
    isAutoResumeExemptFromRateLimit("resume", "auto") === true,
    "trigger=auto, mode=resume(순수 자동 재개)가 여전히 rate limit에 걸림 — 원래 버그가 고쳐지지 않음"
  );
  console.log("✅ C. 자동 checkpoint resume(mode=resume, trigger=auto) — rate limit 카운트하지 않음");
}

/** D. cron(/api/cron/resume-generations)은 원래도 지금도 rate limit을 전혀 쓰지 않는다 */
function testCronNeverUsesRateLimit() {
  const source = readSource(CRON_ROUTE);
  assert(
    !/checkRateLimit/.test(source),
    "cron 라우트가 checkRateLimit을 참조함 — cron은 사용자 세션이 없어 이 rate limit 대상이 아니어야 한다"
  );
  console.log("✅ D. cron 자동 재개 — report-gen rate limit과 무관함(기존과 동일, 변경 없음)");
}

/**
 * E. 사용자 직접 요청(trigger 없음/"user")이 10회를 넘으면 기존대로 429 —
 * limit/window 숫자 자체를 바꾸지 않았는지(요구사항 6) + /run의 429 응답
 * 분기가 isAutoResumeExemptFromRateLimit로만 게이팅되고 그 외에는 그대로
 * 남아 있는지 정적으로 확인한다(실제 DB 카운팅은 이 환경에서 재현 불가).
 */
function testUserExceedingLimitStillReturns429() {
  assert(
    RATE_LIMITS.reportGeneration.limit === 10,
    `reportGeneration.limit이 10이 아님(${RATE_LIMITS.reportGeneration.limit}) — rate limit 숫자 자체를 바꾸지 말라는 요구사항 위반`
  );
  assert(
    RATE_LIMITS.reportGeneration.windowMs === 60 * 60 * 1000,
    `reportGeneration.windowMs가 1시간이 아님 — rate limit 숫자 자체를 바꾸지 말라는 요구사항 위반`
  );

  const source = readSource(RUN_ROUTE);
  const gate = source.match(
    /if \(!isAutoResumeExemptFromRateLimit\(mode, trigger\)\) \{[\s\S]*?\n  \}/
  );
  assert(Boolean(gate), "run/route.ts에서 isAutoResumeExemptFromRateLimit로 게이팅된 rate limit 블록을 찾지 못함");
  assert(
    /checkRateLimit\(\s*`report-gen:\$\{session\.user\.id\}`/.test(gate![0]),
    "게이팅 블록 안에서 checkRateLimit이 report-gen 키로 호출되지 않음"
  );
  assert(
    /status: 429/.test(gate![0]) && /보고서 생성 요청이 너무 잦습니다/.test(gate![0]),
    "게이팅 블록 안에서 기존 429 응답(문구 포함)이 사라짐 — 사용자 직접 요청에 대한 rate limit 자체가 없어짐"
  );
  console.log("✅ E. 사용자 직접 요청 초과 시 기존과 동일하게 429(limit=10/1시간 불변, 응답 문구 불변)");
}

/** F. 자동 resume이 몇 번을 반복해도(체크포인트가 아무리 많아도) 카운트되지 않는다 */
function testRepeatedAutoResumeNeverCounts() {
  for (let i = 0; i < 50; i++) {
    assert(
      isAutoResumeExemptFromRateLimit("resume", "auto") === true,
      `${i + 1}번째 반복에서 자동 재개가 rate limit 대상이 됨 — 체크포인트가 잦은 보고서에서 여전히 429가 날 수 있음`
    );
  }
  console.log("✅ F. 자동 resume을 50회 반복해도 매번 rate limit 면제 — 체크포인트가 많은 보고서도 429로 막히지 않음");
}

/**
 * G. 자동 resume 요청에서도 인증(getServerSession)/권한(reportWriteWhere) 검증은
 * 그대로 수행된다 — trigger/mode 파싱이 인증 체크보다 먼저 오지 않는지,
 * 인증·권한 검증 코드 자체가 삭제되지 않았는지 순서를 정적으로 확인한다.
 */
function testAutoResumeStillEnforcesAuthAndPermission() {
  const source = readSource(RUN_ROUTE);
  const authIdx = source.indexOf("getServerSession(authOptions)");
  const triggerParseIdx = source.indexOf("runSchema.safeParse");
  const permissionIdx = source.indexOf("reportWriteWhere(session.user.id");
  const rateGateIdx = source.indexOf("isAutoResumeExemptFromRateLimit(mode, trigger)");

  assert(authIdx !== -1, "getServerSession(authOptions) 인증 체크가 사라짐");
  assert(triggerParseIdx !== -1, "trigger/mode 파싱 코드를 찾지 못함");
  assert(permissionIdx !== -1, "reportWriteWhere 권한 필터가 사라짐");
  assert(rateGateIdx !== -1, "rate limit 게이팅 코드를 찾지 못함");

  assert(
    authIdx < triggerParseIdx,
    "인증 체크(getServerSession)보다 trigger 파싱이 먼저 실행됨 — 인증 안 된 요청도 trigger를 읽을 수 있음"
  );
  assert(
    triggerParseIdx < permissionIdx,
    "권한 필터(reportWriteWhere)가 trigger 파싱보다 먼저 있음 — 예상한 순서(인증 → 파싱 → 리포트 조회/권한)와 다름"
  );
  assert(
    permissionIdx < rateGateIdx,
    "rate limit 게이팅이 권한 검증보다 먼저 실행됨 — 권한 없는 사용자의 요청에도 rate limit 로직이 먼저 도는 구조로 바뀜"
  );
  console.log("✅ G. 자동 resume 요청도 기존과 동일한 순서로 인증(getServerSession)·권한(reportWriteWhere) 검증을 그대로 거침");
}

/**
 * H. claimPendingGeneration(generation lock) 로직 자체는 이번 수정과
 * 무관하게 그대로다 — report-generation.ts의 claim 함수가 trigger 개념을
 * 전혀 모르고(수정되지 않았고), run/route.ts가 여전히 그 함수를 호출하는지
 * 확인한다.
 */
function testGenerationLockUntouched() {
  const genSource = readSource("src/lib/report-generation.ts");
  const claimFn = genSource.match(
    /export async function claimPendingGeneration\([\s\S]*?\n\}/
  );
  assert(Boolean(claimFn), "claimPendingGeneration 함수를 찾지 못함");
  assert(
    !/trigger/.test(claimFn![0]),
    "claimPendingGeneration이 trigger 개념을 참조함 — generation lock 로직을 건드리지 말라는 요구사항 위반"
  );

  const runSource = readSource(RUN_ROUTE);
  assert(
    /const claimedOk = await claimPendingGeneration\(report\.id\);/.test(runSource),
    "run/route.ts가 claimPendingGeneration 호출을 더 이상 하지 않음 — generation lock이 빠짐"
  );
  const rateGateIdx = runSource.indexOf("isAutoResumeExemptFromRateLimit(mode, trigger)");
  const claimIdx = runSource.indexOf("claimPendingGeneration(report.id)");
  assert(
    rateGateIdx < claimIdx,
    "rate limit 게이팅보다 claimPendingGeneration(락 선점)이 먼저 실행되는 순서로 바뀜 — 기존 순서(rate limit → quota → lock)와 다름"
  );
  console.log("✅ H. claimPendingGeneration(generation lock) 로직 불변 — trigger 개념과 무관, 호출 순서도 기존과 동일");
}

/** 클라이언트 배선: 자동 재개 호출부만 trigger:"auto"를 보내고, 사용자 명시 호출부는 보내지 않는다 */
function testClientWiringSendsCorrectTrigger() {
  const wizardSource = readSource(WIZARD);
  const wizardAutoResume = wizardSource.match(
    /action === "auto-resume"[\s\S]*?fetch\(`\/api\/reports\/\$\{id\}\/run`[\s\S]*?\}\)\.catch/
  );
  assert(Boolean(wizardAutoResume), "report-wizard.tsx의 auto-resume fetch 블록을 찾지 못함");
  assert(
    /trigger:\s*"auto"/.test(wizardAutoResume![0]),
    "report-wizard.tsx의 자동 재개 호출이 trigger:'auto'를 보내지 않음 — 여전히 rate limit을 소모함"
  );

  const pageSource = readSource(PAGE_CLIENT);
  const pagePollAutoResume = pageSource.match(
    /action === "auto-resume"[\s\S]*?fetch\(`\/api\/reports\/\$\{report\.id\}\/run`[\s\S]*?\}\)\.catch/
  );
  assert(Boolean(pagePollAutoResume), "report-page-client.tsx GeneratingView의 auto-resume fetch 블록을 찾지 못함");
  assert(
    /trigger:\s*"auto"/.test(pagePollAutoResume![0]),
    "report-page-client.tsx GeneratingView의 폴링 auto-resume 호출이 trigger:'auto'를 보내지 않음"
  );

  assert(
    /handleStartGeneration\("auto"\)/.test(pageSource),
    "report-page-client.tsx의 checkpoint 자동 이어서 생성(useEffect)이 handleStartGeneration('auto')를 호출하지 않음"
  );
  assert(
    /onClick=\{\(\) => handleStartGeneration\(\)\}/.test(pageSource),
    "사용자가 직접 누르는 '생성 시작/이어서 생성' 버튼이 handleStartGeneration()을 기본값(user)으로 호출하지 않음"
  );
  console.log(
    "✅ 클라이언트 배선: report-wizard.tsx/report-page-client.tsx의 자동 재개 호출만 trigger:'auto', 버튼 클릭은 기본값(user)"
  );
}

async function main() {
  console.log("\n=== DealMind 자동 checkpoint resume — report-gen rate limit 면제 회귀 테스트 ===\n");
  testNewReportCreationAlwaysCountsRateLimit();
  testExplicitRestartAlwaysCounts();
  testAutoResumeIsExempt();
  testCronNeverUsesRateLimit();
  testUserExceedingLimitStillReturns429();
  testRepeatedAutoResumeNeverCounts();
  testAutoResumeStillEnforcesAuthAndPermission();
  testGenerationLockUntouched();
  testClientWiringSendsCorrectTrigger();
  console.log("\n✅ 자동 resume rate limit 면제 회귀 테스트 전체 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});
