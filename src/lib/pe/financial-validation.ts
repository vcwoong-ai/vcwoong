/**
 * PE 재무 정규화 API 입력 검증(Zod).
 *
 * 거부 대상: 유효하지 않은 연도, 잘못된 기간(종료일 < 시작일), 지원하지
 * 않는 periodType, 통화 미기재, 깨진 숫자(NaN/Infinity), 유효하지 않은
 * statementType/lineItem, statementType과 lineItem이 서로 안 맞는 조합
 * (예: REVENUE인데 statementType이 BALANCE_SHEET).
 */

import { z } from "zod";
import {
  CANONICAL_LINE_ITEMS,
  LINE_ITEM_STATEMENT_TYPE,
  type CanonicalLineItem,
} from "./financial-types";

const currentYear = new Date().getUTCFullYear();

/** 재무제표 실무상 유효할 만한 범위 — 지나치게 관대하게 열어두지 않는다 */
const fiscalYearSchema = z
  .number()
  .int()
  .min(1990, "유효하지 않은 연도입니다")
  .max(currentYear + 1, "유효하지 않은 연도입니다");

const periodTypeSchema = z.enum(["ANNUAL", "QUARTERLY", "TTM"]);

const statementTypeSchema = z.enum([
  "INCOME_STATEMENT",
  "BALANCE_SHEET",
  "CASH_FLOW",
]);

const sourceTypeSchema = z.enum([
  "UPLOADED_DOCUMENT",
  "EXCEL",
  "DART",
  "MANUAL",
]);

const lineItemSchema = z.enum(
  CANONICAL_LINE_ITEMS as unknown as [CanonicalLineItem, ...CanonicalLineItem[]]
);

/** NaN/Infinity를 명시적으로 거부한다 — z.number()는 기본적으로 NaN을 통과시키지 않지만
 * Infinity는 통과시키므로 finite 체크를 추가한다. */
const financeNumberSchema = z.number().finite("숫자가 유효하지 않습니다(NaN/Infinity 불가)");

const currencySchema = z
  .string()
  .trim()
  .min(1, "통화를 지정해야 합니다")
  .max(10);

const sourceLineageSchema = z.object({
  source: sourceTypeSchema,
  sourceName: z.string().max(255).optional(),
  sourceLocation: z.string().max(255).optional(),
});

export const financialLineItemInputSchema = sourceLineageSchema
  .extend({
    statementType: statementTypeSchema,
    lineItem: lineItemSchema,
    value: financeNumberSchema,
    currency: currencySchema,
    isNormalized: z.boolean().optional(),
  })
  .superRefine((item, ctx) => {
    if (LINE_ITEM_STATEMENT_TYPE[item.lineItem] !== item.statementType) {
      ctx.addIssue({
        code: "custom",
        message: `${item.lineItem}은(는) ${LINE_ITEM_STATEMENT_TYPE[item.lineItem]}에 속하며 ${item.statementType}에 속하지 않습니다`,
        path: ["statementType"],
      });
    }
  });

export const financialAdjustmentInputSchema = sourceLineageSchema.extend({
  metric: lineItemSchema,
  reportedValue: financeNumberSchema,
  adjustmentValue: financeNumberSchema,
  reason: z.string().trim().min(1, "조정 사유(reason)가 필요합니다"),
});

export const createFinancialPeriodSchema = z
  .object({
    fiscalYear: fiscalYearSchema,
    periodType: periodTypeSchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    currency: currencySchema,
    lineItems: z.array(financialLineItemInputSchema).min(1, "최소 1개 계정값이 필요합니다"),
    adjustments: z.array(financialAdjustmentInputSchema).optional(),
  })
  .refine((data) => data.endDate.getTime() > data.startDate.getTime(), {
    message: "종료일은 시작일보다 이후여야 합니다",
    path: ["endDate"],
  })
  .refine(
    (data) => data.lineItems.every((item) => item.currency === data.currency),
    {
      message: "line item 통화가 기간 통화와 일치해야 합니다",
      path: ["lineItems"],
    }
  );

export type CreateFinancialPeriodInput = z.infer<typeof createFinancialPeriodSchema>;
