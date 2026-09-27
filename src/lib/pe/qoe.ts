/**
 * QoE(Quality of Earnings) / EBITDA Normalization Engine — PR-D.
 *
 * Reported EBITDA + APPROVED QoE Adjustments = Adjusted EBITDA.
 *
 * 이 파일은 PR-B의 정규화 엔진(financial-normalization.ts)을 **수정하지
 * 않고 그대로 재사용**한다 — `deriveEbitda`/`deriveAdjustedEbitda`는 이미
 * PR-B에 존재하며 결정적 순수 함수다. 이 파일이 새로 하는 일은 딱 하나:
 * QoE Adjustment의 status(DRAFT/PROPOSED/APPROVED/REJECTED) 중
 * **APPROVED만 걸러서** PR-B 엔진에 넘기는 것뿐이다. AI 호출·외부 API
 * 호출·통화 환산·D&A 추정은 전혀 하지 않는다.
 */

import { normalizeFinancialPeriod } from "./financial-normalization";
import type {
  FinancialAdjustmentInput,
  FinancialCalcResult,
  FinancialLineItemInput,
} from "./financial-types";
import type { QoEAdjustmentInput } from "./qoe-types";

/**
 * APPROVED 상태의 QoE adjustment만 PR-B 엔진이 받는 형태
 * (FinancialAdjustmentInput — status 없음)로 변환한다. PROPOSED/DRAFT/
 * REJECTED는 여기서 걸러진다 — 공식 Adjusted EBITDA에는 절대 포함되지 않는다.
 *
 * 중복 입력(예: 같은 +10 조정이 두 번 들어옴)은 여기서 임의로 제거하지
 * 않는다 — 각 레코드를 독립된 입력으로 취급한다(AI/fuzzy matching으로
 * "중복 같아 보이는 것"을 지우면 실제로 서로 다른 두 건의 조정을 사용자
 * 몰래 없앨 위험이 있다). 중복 여부 판단은 사람이 하는 검토·승인 단계의
 * 책임이다.
 */
export function toApprovedAdjustmentInputs(
  adjustments: QoEAdjustmentInput[]
): FinancialAdjustmentInput[] {
  return adjustments
    .filter((a) => a.status === "APPROVED")
    .map((a) => ({
      metric: a.metric,
      reportedValue: a.reportedValue,
      adjustmentValue: a.adjustmentValue,
      reason: a.reason,
      sourceType: a.sourceType,
      sourceName: a.sourceName,
      sourceLocation: a.sourceLocation,
    }));
}

export interface QoEResult {
  /** PR-B deriveEbitda() 그대로 — Reported/Derived EBITDA(조정 전) */
  baseEbitda: FinancialCalcResult;
  /** PR-B deriveAdjustedEbitda() 그대로, 단 APPROVED adjustment만 전달됨 */
  adjustedEbitda: FinancialCalcResult;
  /** 참고용 — 실제로 반영된(APPROVED) 조정 합계(baseEbitda가 missing이면 계산 의미 없음) */
  approvedAdjustmentTotal: number;
  /** 감사·표시용 — status 포함 전체 조정 목록(반영 여부와 무관하게 원본 그대로 보존) */
  allAdjustments: QoEAdjustmentInput[];
}

/**
 * Adjusted EBITDA = Base EBITDA + Σ(APPROVED adjustment.adjustmentValue).
 *
 * PR-B의 공개 진입점 `normalizeFinancialPeriod()`를 그대로 호출한다(내부
 * `Lookup`/`buildLookup`은 financial-normalization.ts 밖으로 공개돼 있지
 * 않으므로, 그 비공개 구조에 기대는 대신 이미 공개된 함수를 그대로 쓴다) —
 * 재무기간 1개(periodCurrency + lineItems)와, status로 걸러진 APPROVED
 * adjustment만 건네준다.
 *
 * - Base EBITDA 자체가 missing_input/currency_mismatch면 그 상태를 그대로
 *   반환한다(0으로 대체하지 않음 — PR-B deriveEbitda의 계약을 그대로 따름).
 * - PROPOSED/REJECTED/DRAFT adjustment는 절대 합산되지 않는다(애초에
 *   normalizeFinancialPeriod에 전달되지도 않음).
 * - adjustments가 비어있거나 전부 APPROVED가 아니면 Adjusted EBITDA = Base EBITDA.
 */
export function calculateAdjustedEbitda(
  periodCurrency: string,
  lineItems: FinancialLineItemInput[],
  adjustments: QoEAdjustmentInput[]
): QoEResult {
  const approved = toApprovedAdjustmentInputs(adjustments);
  const summary = normalizeFinancialPeriod({
    periodCurrency,
    lineItems,
    adjustments: approved,
  });
  const approvedAdjustmentTotal = approved.reduce((sum, a) => sum + a.adjustmentValue, 0);

  return {
    baseEbitda: summary.ebitda,
    adjustedEbitda: summary.adjustedEbitda,
    approvedAdjustmentTotal,
    allAdjustments: adjustments,
  };
}

/**
 * 비정상적으로 큰 조정을 표시할 수 있는지 검토(§10 Test 9)한 결과 —
 * threshold를 이 함수 안에 제품 정책으로 고정하지 않는다. 호출자가 명시적
 * 비율을 넘겨야 하며, 넘기지 않으면 아무것도 flag하지 않는다(기본값 없음
 * = 정책 미확정 상태를 그대로 드러냄).
 */
export function isAdjustmentLargeRelativeToBase(
  baseEbitdaValue: number,
  adjustmentValue: number,
  ratioThreshold: number
): boolean {
  if (baseEbitdaValue === 0) return adjustmentValue !== 0;
  return Math.abs(adjustmentValue / baseEbitdaValue) >= ratioThreshold;
}

// ─────────────────────────────────────────────────────────────
// LBO Integration Contract(설계만 — PR #90 lbo-model.ts는 이 PR에서
// 수정하지 않는다. 실제 연결은 PR-E에서 진행)
// ─────────────────────────────────────────────────────────────

/**
 * QoE Engine의 출력이 향후 LBO Input(PR #90 `LboAssumptions.entryEbitda`)에
 * 어떻게 연결될 수 있는지 설계한 계약 타입. 이 타입 자체는 아무것도
 * 계산하지 않으며, PR-E가 실제 어댑터를 만들 때 참고용으로만 존재한다.
 *
 * ## INTEGRATION_GAP(그대로 연결할 수 없음 — 단위 불일치)
 *
 * PR #90의 `LboAssumptions.entryEbitda`는 코드 주석상 **"억원"** 단위를
 * 가정한다("인수 시점 연간 EBITDA (억원)"). 반면 이 QoE Engine의
 * `adjustedEbitda`는 PR-B의 원본 최소 단위 저장 원칙(financial-types.ts)을
 * 그대로 따라 **원(raw KRW won)** 단위다. 즉 이 값을 그대로
 * `LboAssumptions.entryEbitda`에 대입하면 10^8배 단위 오류가 발생한다.
 *
 * 이 PR에서는 이 변환을 하지 않는다(LBO Engine도, QoE Engine도 수정하지
 * 않음) — PR-E가 두 단위 체계를 명시적으로 잇는 어댑터를 만들어야 한다.
 */
export interface QoEToLboBridge {
  /** 예: "FY2025" */
  period: string;
  /** QoE Engine의 baseEbitda — 원 단위(raw KRW won), missing이면 null */
  baseEbitda: number | null;
  approvedAdjustmentTotal: number;
  /** QoE Engine의 adjustedEbitda — 원 단위(raw KRW won), missing이면 null.
   * PR #90 LboAssumptions.entryEbitda(억원 단위)에 넣으려면 1억으로
   * 나누는 변환이 필요하다 — 이 타입은 그 변환을 하지 않는다(INTEGRATION_GAP). */
  adjustedEbitda: number | null;
  currency: string;
  source: "QOE_ENGINE";
}

export function buildQoEToLboBridge(
  period: string,
  currency: string,
  result: QoEResult
): QoEToLboBridge {
  return {
    period,
    baseEbitda: result.baseEbitda.status === "ok" ? result.baseEbitda.value : null,
    approvedAdjustmentTotal: result.approvedAdjustmentTotal,
    adjustedEbitda: result.adjustedEbitda.status === "ok" ? result.adjustedEbitda.value : null,
    currency,
    source: "QOE_ENGINE",
  };
}
