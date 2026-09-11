/**
 * 실행시간 예산·월 한도 경계 검증.
 *
 * 배경(실제로 있었던 문제):
 * - Hobby 플랜은 함수 실행시간이 60초로 강제 상한이었는데, AI 호출 타임아웃이
 *   150초로 잡혀 있어서 느린 호출 한 번이면 함수가 강제 종료됐다. 그렇게
 *   죽으면 상태 정리를 못 해 보고서가 GENERATING에 갇힌다.
 * - 시간 예산을 환경변수로 받는데 `Number("")`는 0, `Number("30s")`는 NaN이라
 *   오타 하나로 자체 중단 장치가 통째로 무력화되거나(NaN) 아무 섹션도 만들지
 *   못하는(0) 상태가 된다.
 * - 월 한도를 서버 로컬(UTC) 기준으로 세서, 한국 시간으로 달이 바뀐 뒤에도
 *   9시간 동안 지난달 사용량이 함께 잡혔다.
 *
 * 2026-09-11 Pro 전환: vercel.json의 maxDuration을 60초 → 240초로,
 * report-generation.ts의 GENERATION_BUDGET_MS 기본값을 40초 → 180초로
 * 올렸다(Vercel Pro 실제 지원 한도는 최대 800초지만, 실측 섹션당 17~20초
 * 기준 4개 섹션을 안정적으로 처리할 수 있는 값만 필요해 240초로 보수적으로
 * 잡음). 이 테스트의 "함수 상한" 기준값도 함께 갱신 — vercel.json은 JSON이라
 * TS에서 직접 import할 수 없으므로, 값이 바뀌면 이 상수도 같이 바꿔야 한다.
 *
 * Usage: npm run test:runtime-budget
 */
import {
  envDurationMs,
  REQUEST_TIMEOUT_MS,
  AI_CALL_BUDGET_MS,
} from "../src/lib/claude";
import { STALE_GENERATION_MS } from "../src/lib/report-generation";
import { kstStartOfMonth } from "../src/lib/utils";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** vercel.json의 report generation 관련 route(maxDuration) — 값이 바뀌면 여기도 같이 바꿀 것 */
const FUNCTION_LIMIT_MS = 240_000;
/** report-generation.ts의 GENERATION_BUDGET_MS 코드 기본값과 동일하게 유지 */
const DEFAULT_GENERATION_BUDGET_MS = 180_000;

function testEnvDurationParsing() {
  assert(envDurationMs("30000", 1000) === 30_000, "정상 숫자 문자열을 못 읽음");
  assert(envDurationMs(undefined, 1000) === 1000, "미설정 시 기본값이 아님");
  // 빈 문자열: Number("")는 0 — 예산 0이면 아무 작업도 시작 못 한다
  assert(envDurationMs("", 1000) === 1000, "빈 문자열이 0으로 새어 들어감");
  // 오타: Number("30s")는 NaN — 모든 시간 비교가 false가 되어 자체 중단 불능
  assert(envDurationMs("30s", 1000) === 1000, "NaN이 그대로 새어 들어감");
  assert(envDurationMs("-5000", 1000) === 1000, "음수가 그대로 새어 들어감");
  assert(envDurationMs("0", 1000) === 1000, "0이 그대로 새어 들어감");
  console.log("✅ 시간 예산 환경변수 파싱: 빈 문자열·오타·음수는 기본값으로 폴백");
}

function testAiTimeoutFitsFunctionLimit() {
  assert(
    REQUEST_TIMEOUT_MS < FUNCTION_LIMIT_MS,
    `AI 1회 호출 타임아웃(${REQUEST_TIMEOUT_MS}ms)이 함수 상한(${FUNCTION_LIMIT_MS}ms) 이상 — ` +
      "느린 호출 한 번으로 함수가 강제 종료된다"
  );
  assert(
    AI_CALL_BUDGET_MS < FUNCTION_LIMIT_MS,
    `AI 호출 총 예산(${AI_CALL_BUDGET_MS}ms)이 함수 상한 이상 — 재시도가 함수를 넘긴다`
  );
  assert(
    REQUEST_TIMEOUT_MS <= AI_CALL_BUDGET_MS,
    "1회 타임아웃이 총 예산보다 길다 — 총 예산이 무의미해짐"
  );
  console.log(
    `✅ AI 호출 타임아웃·총 예산이 함수 실행시간 상한(${FUNCTION_LIMIT_MS / 1000}초) 안에 들어옴`
  );
}

/**
 * 보고서 생성 루프는 "남은 시간 ≥ 1회 타임아웃"일 때만 새 섹션을 시작한다.
 * 최악의 경우 = 마지막 시작 가능 시점 + 재시도까지 다 쓴 시간.
 */
function testWorstCaseRunFitsFunctionLimit() {
  const budget = Number(
    process.env.REPORT_GENERATION_BUDGET_MS ?? DEFAULT_GENERATION_BUDGET_MS
  );
  const latestStart = budget - REQUEST_TIMEOUT_MS;
  const worstCase = latestStart + AI_CALL_BUDGET_MS;
  assert(
    worstCase <= FUNCTION_LIMIT_MS,
    `최악의 경우 실행시간 ${worstCase}ms가 함수 상한 ${FUNCTION_LIMIT_MS}ms 초과 ` +
      `(예산 ${budget} - 타임아웃 ${REQUEST_TIMEOUT_MS} + 총예산 ${AI_CALL_BUDGET_MS})`
  );
  assert(
    latestStart > 0,
    "예산이 1회 타임아웃보다 짧아 섹션을 하나도 시작할 수 없다"
  );
  console.log(
    `✅ 최악의 경우(${worstCase}ms)에도 함수 상한 안에서 스스로 멈춤 — 강제 종료 없음`
  );
}

function testStaleWindowIsNotAbsurdlyLong() {
  // 죽은 게 확실한 생성 때문에 15분을 기다리게 하면 안 된다.
  assert(
    STALE_GENERATION_MS >= 90_000,
    "stale 판정이 너무 짧다 — 정상 진행 중인 생성을 죽은 것으로 오판할 수 있다"
  );
  assert(
    STALE_GENERATION_MS <= 5 * 60 * 1000,
    `stale 판정이 ${STALE_GENERATION_MS}ms — 함수가 죽었을 때 너무 오래 잠긴다(함수 상한 ${FUNCTION_LIMIT_MS / 1000}초보다 훨씬 길면 안 됨)`
  );
  console.log(
    `✅ 멈춘 생성 재시도 대기시간이 ${STALE_GENERATION_MS / 1000}초 (예전 15분에서 단축)`
  );
}

function testKstMonthBoundary() {
  // 한국시간 9월 1일 02:00 = UTC 8월 31일 17:00.
  // 이 시점의 "이번 달 시작"은 한국시간 9월 1일 00:00 = UTC 8월 31일 15:00 이어야 한다.
  const utcAug31_17h = new Date(Date.UTC(2026, 7, 31, 17, 0, 0));
  const start = kstStartOfMonth(utcAug31_17h);
  assert(
    start.toISOString() === "2026-08-31T15:00:00.000Z",
    `KST 9/1 02:00의 월 시작이 ${start.toISOString()} — 8/31 15:00Z 이어야 함`
  );
  assert(
    start <= utcAug31_17h,
    "월 시작이 현재보다 미래 — 사용량이 0으로 잘못 집계된다"
  );

  // 한국시간 8월 31일 23:00 = UTC 8월 31일 14:00 → 아직 8월
  const utcAug31_14h = new Date(Date.UTC(2026, 7, 31, 14, 0, 0));
  assert(
    kstStartOfMonth(utcAug31_14h).toISOString() === "2026-07-31T15:00:00.000Z",
    "KST 8/31 23:00인데 9월로 넘어가 버림"
  );

  // 연말 경계: 한국시간 1월 1일 05:00 = UTC 12월 31일 20:00
  const utcDec31_20h = new Date(Date.UTC(2026, 11, 31, 20, 0, 0));
  assert(
    kstStartOfMonth(utcDec31_20h).toISOString() === "2026-12-31T15:00:00.000Z",
    "연말 경계에서 연도·월이 어긋남"
  );
  console.log("✅ 월 한도 기준이 한국 시간 기준 (매월 1일 0~9시 오집계 없음)");
}

function main() {
  console.log("\n=== DealMind 실행시간 예산·월 경계 테스트 ===\n");
  testEnvDurationParsing();
  testAiTimeoutFitsFunctionLimit();
  testWorstCaseRunFitsFunctionLimit();
  testStaleWindowIsNotAbsurdlyLong();
  testKstMonthBoundary();
  console.log("\n✅ 실행시간 예산·월 경계 테스트 통과\n");
}

main();
