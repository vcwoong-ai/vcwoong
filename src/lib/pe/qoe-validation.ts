/**
 * QoE Adjustment 입력 검증(Zod).
 *
 * 새 validation framework를 만들지 않는다 — PR-B의
 * `financialAdjustmentInputSchema`(financial-validation.ts, 수정하지 않음)를
 * `.extend()`해서 status/adjustmentType만 추가한다. amount(NaN/Infinity)·
 * source·reason 검증은 전부 PR-B 스키마가 이미 하는 것을 그대로 물려받는다.
 */

import { z } from "zod";
import { financialAdjustmentInputSchema } from "./financial-validation";
import { QOE_ADJUSTMENT_STATUSES, QOE_ADJUSTMENT_TYPES } from "./qoe-types";

export const qoeAdjustmentStatusSchema = z.enum(QOE_ADJUSTMENT_STATUSES);
export const qoeAdjustmentTypeSchema = z.enum(QOE_ADJUSTMENT_TYPES);

export const qoeAdjustmentInputSchema = financialAdjustmentInputSchema.extend({
  status: qoeAdjustmentStatusSchema,
  adjustmentType: qoeAdjustmentTypeSchema,
});

export type QoEAdjustmentInputValidated = z.infer<typeof qoeAdjustmentInputSchema>;
