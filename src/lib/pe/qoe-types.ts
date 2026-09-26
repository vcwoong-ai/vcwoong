/**
 * QoE(Quality of Earnings) Adjustment — 타입.
 *
 * PR-B의 `FinancialAdjustmentInput`(financial-types.ts)을 그대로 재사용하는
 * 대신 확장한다 — `FinancialAdjustmentInput`에는 status/adjustmentType 개념이
 * 없으므로(그 파일 자체 주석에 "분류는 PR-D 범위"라고 이미 명시돼 있음),
 * 여기서 그 확장을 완성한다. PR-B 타입 자체는 수정하지 않는다.
 *
 * ## DB 스키마와의 관계(중요 — 최종 보고서 §3/§5/§18 참고)
 *
 * 현재 `MAFinancialAdjustment` Prisma 모델(PR-B)에는 `status`/`adjustmentType`
 * 컬럼이 없다(id/financialPeriodId/metric/reportedValue/adjustmentValue/
 * normalizedValue/reason/source/sourceName/sourceLocation/createdAt/
 * updatedAt만 존재 — 2026-09-22 schema.prisma 확인). 이 PR은 스키마를
 * 수정하지 않으므로, 아래 타입의 `status`/`adjustmentType`은 **아직 DB
 * 컬럼으로 뒷받침되지 않는 순수 계산 레이어의 입력 타입**이다 — 호출자가
 * (지금은 애플리케이션 메모리에서, 또는 향후 스키마 확장 후 DB에서) 값을
 * 채워 넣어야 한다. 실제 영속화가 필요해지면 별도 schema PR에서
 * `MAFinancialAdjustment.status`/`adjustmentType` 컬럼을 추가하는 것을
 * 권장한다(이 PR의 범위 밖).
 */

import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";

/**
 * Adjustment 생애주기. APPROVED만 공식 Adjusted EBITDA에 반영된다(qoe.ts
 * 참고) — DRAFT/PROPOSED는 검토 중, REJECTED는 기각되어 반영하지 않는다.
 */
export const QOE_ADJUSTMENT_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "APPROVED",
  "REJECTED",
] as const;
export type QoEAdjustmentStatus = (typeof QOE_ADJUSTMENT_STATUSES)[number];

/**
 * 조정 유형 — 부호 방향은 유형이 아니라 `adjustmentValue`의 부호 자체가
 * 결정한다(양수 = EBITDA 증가, 음수 = EBITDA 감소). 유형은 분류·근거
 * 표시용일 뿐 계산에는 관여하지 않는다.
 */
export const QOE_ADJUSTMENT_TYPES = [
  // 증가 방향으로 쓰이는 것이 일반적인 유형(강제 아님)
  "ONE_OFF_EXPENSE",
  "OWNER_COMPENSATION_NORMALIZATION",
  "RELATED_PARTY_NORMALIZATION",
  "RESTRUCTURING",
  "ONE_TIME_PROFESSIONAL_FEE",
  "NON_RECURRING_OPERATING_COST",
  // 감소 방향으로 쓰이는 것이 일반적인 유형(강제 아님)
  "ONE_OFF_INCOME",
  "NON_RECURRING_REVENUE",
  "UNSUSTAINABLE_MARGIN",
  "OTHER",
] as const;
export type QoEAdjustmentType = (typeof QOE_ADJUSTMENT_TYPES)[number];

/**
 * QoE Adjustment 1건의 계산 입력. PR-B의 FinancialAdjustmentInput과 같은
 * source lineage 필드(sourceType/sourceName/sourceLocation)를 그대로
 * 공유한다.
 *
 * 부호 규칙(단일 원칙): adjustmentValue > 0 → Adjusted EBITDA 증가,
 * adjustmentValue < 0 → Adjusted EBITDA 감소. adjustmentType은 부호를
 * 강제하지 않는다(오너 보수를 낮추는 정정처럼 "증가형" 유형이 음수로 쓰일
 * 수도 있음 — 실제 금액과 방향은 항상 adjustmentValue 부호가 유일한 진실).
 */
export interface QoEAdjustmentInput {
  /** 보통 "EBITDA" — PR-B deriveAdjustedEbitda가 반영하는 metric과 일치해야 함 */
  metric: CanonicalLineItem;
  reportedValue: number;
  adjustmentValue: number;
  reason: string;
  adjustmentType: QoEAdjustmentType;
  status: QoEAdjustmentStatus;
  sourceType: MaFinancialSourceType;
  sourceName?: string;
  sourceLocation?: string;
}
