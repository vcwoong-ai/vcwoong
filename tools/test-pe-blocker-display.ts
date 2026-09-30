/**
 * PE 차단 요인 표시용 문구 다듬기 — 내부 id 제거, 계정 코드 한국어화, 원 → 억원.
 * 순수 함수 테스트(DB·네트워크 없음). 엔진 문구(fingerprint에 들어가는 값)는 건드리지 않는다는 점도 함께 검증한다.
 */
import { presentBlockerDetail, presentBlockerLabel, formatWonAsEok } from "../src/lib/pe/blocker-display";
import { buildPEDecisionReadiness } from "../src/lib/pe/pe-decision-readiness";

let pass = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  pass++;
  console.log(`✅ ${msg}`);
}

const engineDetail =
  "같은 기간(cmuo7rksg001f7do0bqk1hbhk)의 REVENUE(KRW)에 서로 다른 값이 존재합니다: 120000000000, 118000000000";
const shown = presentBlockerDetail(engineDetail);
assert(!/cmuo7rksg/.test(shown), "내부 재무기간 id가 화면 문구에서 사라짐");
assert(shown.includes("매출액(KRW)"), "REVENUE → 매출액");
assert(shown.includes("1,200억원") && shown.includes("1,180억원"), "원 단위 정수 → 억원(두 값 모두 보존)");
assert(!/120000000000|118000000000/.test(shown), "원 단위 정수가 화면에 남지 않음");
assert(shown.startsWith("같은 기간의"), `공백이 정리됨(실제: ${shown.slice(0, 12)})`);

assert(presentBlockerDetail("상위 QoE가 BLOCKED 상태라 LBO를 신뢰할 수 없습니다") === "상위 QoE가 차단됨 상태라 LBO를 신뢰할 수 없습니다", "BLOCKED → 차단됨")
assert(presentBlockerLabel("REVENUE 값 불일치") === "매출액 값 불일치", "label의 계정 코드 → 한국어");
assert(presentBlockerLabel("EBITDA 통화 불일치") === "EBITDA 통화 불일치", "EBITDA는 그대로");
assert(presentBlockerDetail("근거가 아직 없습니다") === "근거가 아직 없습니다", "패턴이 없는 문구는 그대로 통과");
assert(presentBlockerDetail("금액 1,200억원, 코드 20240101") === "금액 1,200억원, 코드 20240101", "이미 억원인 값·8자리 이하 숫자는 건드리지 않음");
assert(formatWonAsEok(118_500_000_000) === "1,185억원", "정확히 나누어 떨어지면 소수 없음");
assert(formatWonAsEok(150_000_000) === "1.5억원", "나누어 떨어지지 않으면 소수 1자리");
assert(formatWonAsEok(-30_000_000_000) === "-300억원", "음수 부호 보존");

// 엔진 문구는 그대로 — 표시 함수는 엔진을 바꾸지 않는다(fingerprint 보호)
const readiness = buildPEDecisionReadiness({
  periods: [
    {
      id: "cmuo7rksg001f7do0bqk1hbhk",
      fiscalYear: 2024,
      periodType: "ANNUAL",
      currency: "KRW",
      lineItems: [
        { id: "a", lineItem: "REVENUE", value: 120_000_000_000, currency: "KRW", source: "MANUAL" },
        { id: "b", lineItem: "REVENUE", value: 118_000_000_000, currency: "KRW", source: "DART" },
      ],
      adjustments: [],
      normalizedSummary: {
        revenue: { status: "ok", value: 120_000_000_000 } as never,
        ebitda: { status: "missing_input", missing: [] } as never,
        netDebt: { status: "missing_input", missing: [] } as never,
      },
    },
  ],
});
const engineBlocker = readiness.blockers.find((b) => b.code.startsWith("FINANCIAL_FACT_CONFLICT"));
assert(!!engineBlocker && engineBlocker.detail.includes("cmuo7rksg001f7do0bqk1hbhk"), "엔진 원문에는 여전히 id가 들어 있음(표시 함수만 다듬는다)");

console.log(`\n${pass}개 통과`);
