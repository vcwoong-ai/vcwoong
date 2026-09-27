/**
 * MAFinancialAdjustment DB row ↔ PR-D QoEAdjustmentInput 매핑 — PR-D.1.
 *
 * PR-D의 계산 로직(qoe.ts)은 이 PR에서 수정하지 않는다. 이 파일은 그
 * 계산에 들어가는 입력을 DB row에서 손실 없이 만들어주는 순수 매핑
 * 함수만 담는다 — DB 호출은 하지 않는다(Prisma가 생성한 타입만 가져다
 * 쓸 뿐, prisma client 인스턴스를 import하지 않음).
 *
 * status/adjustmentType이 이번 PR에서 실제 컬럼(schema.prisma의
 * MAFinancialAdjustment.status/adjustmentType, MaAdjustmentStatus/
 * MaAdjustmentType enum)으로 추가됐으므로, DB에서 읽은 row를 그대로
 * QoEAdjustmentInput에 대입할 수 있다(값 집합이 정확히 일치 — 두 enum이
 * qoe-types.ts의 QOE_ADJUSTMENT_STATUSES/QOE_ADJUSTMENT_TYPES와 동일한
 * 문자열 리터럴을 쓰도록 스키마를 설계했기 때문에 별도 변환表가 필요 없음).
 */

import type { MAFinancialAdjustment as MAFinancialAdjustmentRow } from "@prisma/client";
import type { QoEAdjustmentInput } from "./qoe-types";
import type { CanonicalLineItem } from "./financial-types";

/**
 * DB row 1건을 QoE Engine 입력으로 변환한다. sourceName/sourceLocation의
 * null→undefined 변환 외에는 아무 값도 바꾸지 않는다(lossless) — status가
 * APPROVED인 row만 이후 qoe.ts의 `toApprovedAdjustmentInputs()`를 통과해
 * 실제 계산에 반영된다.
 */
export function toQoEAdjustmentInput(row: MAFinancialAdjustmentRow): QoEAdjustmentInput {
  return {
    metric: row.metric as CanonicalLineItem,
    reportedValue: row.reportedValue,
    adjustmentValue: row.adjustmentValue,
    reason: row.reason,
    adjustmentType: row.adjustmentType,
    status: row.status,
    sourceType: row.source,
    sourceName: row.sourceName ?? undefined,
    sourceLocation: row.sourceLocation ?? undefined,
  };
}

/** 여러 row를 한 번에 변환한다(재무기간 1개에 속한 adjustment 전체를 조회한 뒤 사용). */
export function toQoEAdjustmentInputs(
  rows: MAFinancialAdjustmentRow[]
): QoEAdjustmentInput[] {
  return rows.map(toQoEAdjustmentInput);
}
