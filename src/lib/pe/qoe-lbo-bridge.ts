/**
 * QoE Adjusted EBITDA → LBO Entry EBITDA 브릿지 — PR-E.
 *
 * qoe.ts(PR-D)의 문서 주석이 이미 지적한 단위 불일치(INTEGRATION_GAP)를
 * 실제로 잇는 어댑터. 이 파일 밖의 어떤 계산 로직도 수정하지 않는다:
 * - financial-normalization.ts(PR-B)/qoe.ts(PR-D) 계산 로직은 그대로 재사용
 * - lbo-model.ts(PR #90, `claude/lbo-model-n158z3` 브랜치)는 순수 계산
 *   엔진으로 남겨둔다 — DB/QoE/단위환산을 모르는 채로 `LboAssumptions`만
 *   받는 구조를 유지해야 하므로, 이 브릿지가 대신 그 입력을 준비한다.
 *
 * ## 단위 경계(§3)
 *
 * QoE 쪽(raw KRW 원) ←→ LBO 쪽(억원, `LboAssumptions.entryEbitda`) 변환은
 * **오직 이 파일에서만** 일어난다. QoE·재무정규화·LBO 엔진 내부 단위는
 * 이 PR에서 절대 바꾸지 않는다.
 *
 * ## 정밀도 정책(§4)
 *
 * `entryEbitdaKrw / 100_000_000`(억원 = 10^8원) 나눗셈 결과를 그대로
 * 쓴다 — Math.round/floor/ceil을 이 변환에 적용하지 않는다(예:
 * 12,550,000,000원 → 125.5, 정수로 반올림하지 않음). `LboAssumptions`는
 * 자체 검증 없이 평범한 JS `number`를 받고(lbo-model.ts 확인됨), 그
 * 파일 내부의 `round()`는 *계산 결과*(entryEv 등)에만 적용되지 *입력*
 * (entryEbitda)에는 적용되지 않는다 — 따라서 입력 단계에서 이 브릿지가
 * 임의로 반올림할 근거가 없다. 이 레포는 어디에도 decimal.js 같은
 * 고정소수 라이브러리를 쓰지 않으므로(fund-analytics.ts 등 기존 코드
 * 확인됨), 여기서도 새로 들이지 않고 동일하게 IEEE754 number 나눗셈만
 * 쓴다 — 이는 기존 레포 전체의 한계를 그대로 따르는 것이며 이 PR이
 * 새로 만드는 위험이 아니다.
 *
 * ## 기간 바인딩(§6)
 *
 * 별도의 "기간" 개념을 새로 만들지 않는다 — `MAFinancialPeriod`(PR-A/B,
 * schema.prisma)가 이미 갖는 `financialPeriodId`/`fiscalYear`/`periodType`
 * 3개 필드를 그대로 받는다(재무기간 조회 API — financials/route.ts —
 * 가 실제로 쓰는 값과 동일). QoEResult 자체는 어느 기간에서 나왔는지
 * 모르므로(qoe.ts가 period 개념을 갖지 않음 — 호출자가 재무기간 1개씩
 * 골라 넘기는 구조), 이 브릿지 호출 시 그 기간 식별자를 명시적으로
 * 같이 받아 결과에 그대로 실어 보낸다 — 다른 기간의 QoEResult와 섞일
 * 방법이 타입상 없다(호출 1번 = 기간 식별자 1개 + QoEResult 1개).
 *
 * ## LBO 엔진 순수성(§11)
 *
 * 이 파일은 lbo-model.ts를 **import하지 않는다** — MOIC/IRR/Entry EV 등
 * 어떤 LBO 계산도 하지 않고, `LboAssumptions.entryEbitda`에 대입할 수
 * 있는 숫자 하나(entryEbitdaInEok)와 그 출처(provenance)만 준비한다.
 */

import type { QoEResult } from "./qoe";

/** 억원 = 10^8원. 이 상수 하나가 유일한 변환 지점이다. */
const KRW_PER_EOK = 100_000_000;

/**
 * 이 브릿지가 요구하는 통화. 현재 LBO 계약(`LboAssumptions.entryEbitda`
 * 주석 — "인수 시점 연간 EBITDA (억원)")이 KRW/억원을 전제하므로, 그 외
 * 통화는 임의 환산하지 않고 명시적으로 거부한다(§5 — FX API·가정 환율 없음).
 */
const REQUIRED_CURRENCY = "KRW" as const;

/**
 * `MAFinancialPeriod`의 실제 필드 이름·값 집합을 그대로 따른다
 * (schema.prisma 확인 — fiscalYear Int, periodType MaFinancialPeriodType,
 * financial-validation.ts의 periodTypeSchema와 동일한 리터럴 3개).
 * 병렬 기간 시스템을 새로 만들지 않기 위해 이 세 필드만 받는다.
 */
export interface QoEToLboBridgePeriodIdentity {
  financialPeriodId: string;
  fiscalYear: number;
  periodType: "ANNUAL" | "QUARTERLY" | "TTM";
}

/** 사람이 읽는 기간 라벨. 예: "FY2025"(ANNUAL), "FY2025 TTM". 식별의 진실은
 * 항상 구조화된 필드(fiscalYear/periodType/financialPeriodId) 쪽이며, 이
 * 라벨은 표시/로그용 파생값일 뿐이다. */
function formatFiscalPeriodLabel(period: QoEToLboBridgePeriodIdentity): string {
  return period.periodType === "ANNUAL"
    ? `FY${period.fiscalYear}`
    : `FY${period.fiscalYear} ${period.periodType}`;
}

const CURRENT_YEAR = new Date().getUTCFullYear();

/** financial-validation.ts의 fiscalYearSchema/periodTypeSchema와 같은
 * 범위·값 집합을 쓰지만, 그 파일의 비공개(export되지 않은) 상수를
 * import할 수 없어(PR-B 파일을 수정하지 않기 위해 export를 추가하지
 * 않음) 여기서 동일한 규칙을 다시 표현한다 — 계산 로직이 아니라 값
 * 검증 규칙 중복이며, 두 파일이 서로 다른 규칙을 갖지 않도록 정확히
 * 같은 리터럴/범위를 썼다. */
function validatePeriodIdentity(
  period: QoEToLboBridgePeriodIdentity
): { status: "ok" } | { status: "invalid_period"; detail: string } {
  if (!period.financialPeriodId || period.financialPeriodId.trim().length === 0) {
    return { status: "invalid_period", detail: "financialPeriodId가 비어 있습니다" };
  }
  if (
    !Number.isInteger(period.fiscalYear) ||
    period.fiscalYear < 1990 ||
    period.fiscalYear > CURRENT_YEAR + 1
  ) {
    return { status: "invalid_period", detail: `유효하지 않은 fiscalYear입니다: ${period.fiscalYear}` };
  }
  if (!["ANNUAL", "QUARTERLY", "TTM"].includes(period.periodType)) {
    return { status: "invalid_period", detail: `유효하지 않은 periodType입니다: ${period.periodType}` };
  }
  return { status: "ok" };
}

/**
 * LBO 엔진에 그대로 대입 가능한 부분 입력. `LboAssumptions`(PR #90,
 * lbo-model.ts) 전체를 조립하지 않는다 — entryMultiple/debtToEbitda 등
 * 나머지 가정은 이 PR의 책임이 아니다(§15 — LBO 계산 자체를 하지 않음).
 * `entryEbitdaInEok`는 `LboAssumptions.entryEbitda`에 그대로 대입한다.
 */
export interface LboEntryEbitdaInput {
  entryEbitdaInEok: number;
}

/** "이 LBO Entry EBITDA는 어디서 왔는가"에 답할 수 있는 최소 계보(§10).
 * MAFinancialAdjustment 레코드 전체를 복제하지 않고, QoEResult가 이미
 * 갖고 있는 합계(approvedAdjustmentTotal)만 재사용한다 — 개별 조정
 * 건별 참조가 필요하면 `qoeResult.allAdjustments`(qoe.ts, status 포함
 * 원본 그대로 보존됨)를 호출자가 별도로 조회할 수 있다. */
export interface QoEToLboBridgeProvenance {
  financialPeriodId: string;
  fiscalPeriod: string;
  fiscalYear: number;
  periodType: QoEToLboBridgePeriodIdentity["periodType"];
  currency: typeof REQUIRED_CURRENCY;
  qoeSource: "QOE_ENGINE";
  /** qoe.ts QoEResult.baseEbitda(원 단위, status="ok"일 때만) */
  baseEbitdaKrw: number;
  /** qoe.ts QoEResult.approvedAdjustmentTotal — APPROVED 조정 합계, 원 단위 */
  approvedAdjustmentTotalKrw: number;
  /** qoe.ts QoEResult.adjustedEbitda(원 단위, status="ok"일 때만) */
  adjustedEbitdaKrw: number;
  /** adjustedEbitdaKrw / 100,000,000 — lbo.entryEbitdaInEok와 동일값 */
  entryEbitdaInEok: number;
}

/**
 * 실패 계약(§13) — FinancialCalcResult(financial-types.ts)와 같은 패턴의
 * status 판별 유니온으로 표현한다(새 에러 프레임워크를 만들지 않음).
 *
 * - missing_input: QoE Adjusted EBITDA 계산에 필요한 계정이 없음(base
 *   EBITDA 자체가 missing_input인 경우도 여기로 합쳐진다 — qoe.ts의
 *   deriveAdjustedEbitda가 baseEbitda.status !== "ok"면 그 상태를 그대로
 *   전파하므로, adjustedEbitda가 missing_input이면 원인은 항상 base
 *   EBITDA 결측이다).
 * - invalid_qoe_result: QoE 계산 자체가 currency_mismatch를 반환함(예:
 *   line item 통화가 재무기간 통화와 다름) — "EBITDA가 아예 없음"과는
 *   다른 상태이므로 분리한다(§13 요구사항).
 * - unsupported_currency: QoE 계산은 성공했지만 재무기간 통화가 KRW가
 *   아님 — 이 브릿지는 어떤 환율도 가정하지 않고 변환을 거부한다.
 * - invalid_period: 기간 식별자 자체가 유효하지 않음(계약 위반에 가까움 —
 *   QoE 상태와 무관).
 *
 * INTEGRATION_GAP(qoe.ts가 언급한 원래 단위 불일치)은 이 브릿지가 바로
 * 그 갭을 해소하는 어댑터이므로 이 함수의 실행 경로에서는 발생하지
 * 않는다 — 별도 runtime 상태로 두지 않는다(도달 불가능한 상태를 타입에
 * 넣지 않음). §15에 향후 남은 갭을 별도로 정리한다.
 */
export type QoEToLboBridgeResult =
  | { status: "ok"; lbo: LboEntryEbitdaInput; provenance: QoEToLboBridgeProvenance }
  | { status: "missing_input"; missing: string[] }
  | { status: "invalid_qoe_result"; detail: string }
  | { status: "unsupported_currency"; currency: string }
  | { status: "invalid_period"; detail: string };

/**
 * QoE Adjusted EBITDA(원)를 LBO Entry EBITDA(억원)로 잇는다.
 *
 * @param period 이 QoEResult가 나온 재무기간의 식별자(MAFinancialPeriod 3필드)
 * @param periodCurrency 그 재무기간의 통화(MAFinancialPeriod.currency) — KRW가
 *   아니면 unsupported_currency
 * @param qoeResult qoe.ts `calculateAdjustedEbitda()`의 결과, 그대로(가공 없이)
 */
export function bridgeQoEToLboEntryEbitda(
  period: QoEToLboBridgePeriodIdentity,
  periodCurrency: string,
  qoeResult: QoEResult
): QoEToLboBridgeResult {
  const periodCheck = validatePeriodIdentity(period);
  if (periodCheck.status !== "ok") return periodCheck;

  if (qoeResult.adjustedEbitda.status === "missing_input") {
    return { status: "missing_input", missing: qoeResult.adjustedEbitda.missing };
  }
  if (qoeResult.adjustedEbitda.status === "currency_mismatch") {
    return { status: "invalid_qoe_result", detail: qoeResult.adjustedEbitda.detail };
  }
  // qoeResult.adjustedEbitda.status === "ok" 부터는 qoe.ts의
  // deriveAdjustedEbitda 계약상 baseEbitda.status도 반드시 "ok"다(§7 근거로
  // 위에서 이미 확인). 그래도 이 파일은 그 내부 구현을 신뢰만 하지 않고
  // 방어적으로 다시 확인한다 — baseEbitda가 어떤 이유로든 "ok"가 아니면
  // invalid_qoe_result로 명시적으로 실패시키고, adjustedEbitda 값을 대신
  // 쓰지 않는다(숫자를 지어내지 않음).
  if (qoeResult.baseEbitda.status !== "ok") {
    return {
      status: "invalid_qoe_result",
      detail: "adjustedEbitda는 ok이지만 baseEbitda가 ok가 아닙니다(QoE 엔진 불변조건 위반)",
    };
  }

  if (periodCurrency !== REQUIRED_CURRENCY) {
    return { status: "unsupported_currency", currency: periodCurrency };
  }

  const baseEbitdaKrw = qoeResult.baseEbitda.value;
  const adjustedEbitdaKrw = qoeResult.adjustedEbitda.value;
  const entryEbitdaInEok = adjustedEbitdaKrw / KRW_PER_EOK;

  return {
    status: "ok",
    lbo: { entryEbitdaInEok },
    provenance: {
      financialPeriodId: period.financialPeriodId,
      fiscalPeriod: formatFiscalPeriodLabel(period),
      fiscalYear: period.fiscalYear,
      periodType: period.periodType,
      currency: REQUIRED_CURRENCY,
      qoeSource: "QOE_ENGINE",
      baseEbitdaKrw,
      approvedAdjustmentTotalKrw: qoeResult.approvedAdjustmentTotal,
      adjustedEbitdaKrw,
      entryEbitdaInEok,
    },
  };
}
