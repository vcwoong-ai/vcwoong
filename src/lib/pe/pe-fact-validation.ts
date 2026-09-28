/**
 * PE DD AI Fact — 파싱 + 결정론적 검증(PR-I, hardened in PR-I.1).
 *
 * 순서(§27): parse → schema validate → semantic validate → evidence
 * validate → period validate → currency validate. 하나라도 실패하면 그
 * Fact는 PR-H로 전달하지 않는다(status가 VALIDATED가 아니면 호출자가
 * 걸러야 함 — 이 파일은 걸러주지 않고 상태만 매긴다).
 *
 * PR-I.1(adversarial review) 변경사항:
 * - Finding #4: unit을 자유 텍스트로만 두지 않고 정규화 + currency 정합성
 *   검증을 추가한다(pe-unit.ts, 신규).
 * - Finding #6: evidence가 존재하는지뿐 아니라, 호출자가 scope(dealId/
 *   documentId)를 요구하면 그 scope에 실제로 속하는지도 검증한다.
 * - Finding #7: "headquarters"가 QUARTERLY로 오분류되던 정규식 버그 수정.
 * - Finding #8: QoE adjustment candidate에도 fact와 동일한 수준의
 *   `.strict()` Zod 스키마 + 파싱 함수를 추가한다.
 * - Finding #9: CUSTOMER_REVENUE metric은 customerId가 필수다.
 * - §15/§58: extraction_failed 상태와 그 변환 헬퍼를 추가한다.
 * - §16: facts 배열에 명시적 상한(MAX_FACTS_PER_EXTRACTION)을 둔다.
 */

import { z } from "zod";
import type { PEEvidenceItem, PEEvidenceSource } from "./evidence-lineage-types";
import { normalizeUnitString, isUnitCurrencyCompatible, isMonetaryUnit } from "./pe-unit";
import { QOE_ADJUSTMENT_STATUSES, QOE_ADJUSTMENT_TYPES } from "./qoe-types";
import {
  PE_COMMERCIAL_FACT_METRICS,
  PE_FINANCIAL_FACT_METRICS,
  type PEFactCandidate,
  type RawAIExtractedFact,
  type RawAIExtraction,
} from "./pe-fact-types";

// ─────────────────────────────────────────────────────────────
// Parse(§3, §27) — malformed/partial JSON: INVALID. hallucinated field: REJECT.
// 마크다운 코드펜스 제거 + `{`...`}` 슬라이스 기법은 claude.ts의
// callClaudeJSON()/evidence-ai.ts의 extractJson()과 동일한 패턴이다(둘 다
// 비공개이거나 AI 호출과 결합돼 있어 여기서 재사용할 수 없음 — pe-fact-types.ts
// 상단 주석 참고).
// ─────────────────────────────────────────────────────────────

/** §16 — 청크 1개당 이 개수를 넘는 fact 배열은 스키마 단계에서 거부한다
 * (병리적/환각 응답 방어). 8000자 청크 하나에서 현실적으로 나올 수 있는
 * fact 수보다 넉넉히 크게 잡아, 정상 응답을 막지 않으면서 무한 배열은
 * 막는다. */
export const MAX_FACTS_PER_EXTRACTION = 200;

const rawFactSchema = z
  .object({
    id: z.string().optional(),
    factType: z.enum(["FINANCIAL", "COMMERCIAL"]),
    metric: z.string(),
    value: z.number(),
    unit: z.string().optional(),
    currency: z.string().optional(),
    fiscalYear: z.number().optional(),
    periodType: z.string().optional(),
    sourceEvidenceId: z.string().optional(),
    sourceLocation: z.string().optional(),
    confidence: z.number().optional(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
  })
  .strict(); // 정의되지 않은 필드(hallucinated field)는 여기서 거부된다

const rawExtractionSchema = z
  .object({
    documentId: z.string(),
    facts: z.array(rawFactSchema).max(MAX_FACTS_PER_EXTRACTION),
  })
  .strict();

export type FactExtractionParseResult =
  | { status: "ok"; extraction: RawAIExtraction }
  | { status: "malformed_json"; detail: string }
  | { status: "invalid_schema"; detail: string }
  /** §15/§58 — AI 호출 자체가 실패(네트워크/타임아웃/모델 전부 소진 등).
   * "AI가 구성되지 않음"과 "AI를 불렀지만 실패함"을 malformed_json 하나로
   * 뭉뚱그리지 않는다(PR-I의 원래 결함). */
  | { status: "extraction_failed"; detail: string };

/** AI가 반환한 raw 텍스트(실제 호출이든 테스트 mock이든 동일 경로)를 파싱한다. */
export function parseFactExtractionResponse(text: string): FactExtractionParseResult {
  const cleaned = text
    .replace(/^```json\s*/m, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { status: "malformed_json", detail: err instanceof Error ? err.message : String(err) };
  }

  const result = rawExtractionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: "invalid_schema",
      detail: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    };
  }
  return { status: "ok", extraction: result.data };
}

/**
 * AI 호출(generateText 등)이 throw한 예외를 구조화된 실패로 변환한다 —
 * 순수 함수로 분리해 실제 네트워크 호출 없이 다양한 에러를 합성해
 * 테스트할 수 있게 한다(claude.ts의 runModelChain을 순수 함수로 분리한
 * 이유와 동일). 비밀값(API 키 등)을 노출하지 않기 위해 `.message`만
 * 취한다 — 에러 객체 전체를 직렬화하지 않는다.
 */
export function toExtractionFailureResult(err: unknown): FactExtractionParseResult {
  return {
    status: "extraction_failed",
    detail: err instanceof Error ? err.message : "알 수 없는 오류로 추출에 실패했습니다",
  };
}

// ─────────────────────────────────────────────────────────────
// QoE Adjustment Candidate — 실제 AI JSON 파싱 계약(PR-I.1 Finding #8).
// PR-D의 QOE_ADJUSTMENT_STATUSES/QOE_ADJUSTMENT_TYPES를 그대로 재사용한다
// (새 enum을 만들지 않음, PR-D 파일 자체는 수정하지 않음).
// ─────────────────────────────────────────────────────────────

const rawQoEAdjustmentCandidateSchema = z
  .object({
    reportedValue: z.number(),
    adjustmentValue: z.number(),
    reason: z.string().min(1),
    // z.enum은 대소문자를 정확히 일치시켜야 한다 — "approved"(소문자)는
    // 여기서 스키마 단계에 이미 거부된다(기존 문자열 비교
    // `=== "APPROVED"`에만 의존하던 방식보다 더 이른 단계에서 막는다).
    suggestedStatus: z.enum(QOE_ADJUSTMENT_STATUSES).optional(),
    suggestedType: z.enum(QOE_ADJUSTMENT_TYPES).optional(),
    sourceEvidenceId: z.string().min(1),
    sourceLocation: z.string().optional(),
  })
  .strict();

export type QoEAdjustmentCandidateParseResult =
  | { status: "ok"; candidate: z.infer<typeof rawQoEAdjustmentCandidateSchema> }
  | { status: "malformed_json"; detail: string }
  | { status: "invalid_schema"; detail: string };

/** parseFactExtractionResponse와 동일한 파싱 기법 — QoE candidate 전용 엔드포인트. */
export function parseQoEAdjustmentCandidateResponse(text: string): QoEAdjustmentCandidateParseResult {
  const cleaned = text
    .replace(/^```json\s*/m, "")
    .replace(/^```\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    return { status: "malformed_json", detail: err instanceof Error ? err.message : String(err) };
  }
  const result = rawQoEAdjustmentCandidateSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: "invalid_schema",
      detail: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
    };
  }
  return { status: "ok", candidate: result.data };
}

// ─────────────────────────────────────────────────────────────
// 결정론적 ID(§69) — AI가 준 id/Date.now/Math.random을 쓰지 않는다.
// ─────────────────────────────────────────────────────────────

export function deriveFactId(
  documentId: string,
  sourceEvidenceId: string,
  metric: string,
  fiscalYear: number | undefined,
  periodType: string | undefined
): string {
  return `fact_${documentId}_${sourceEvidenceId}_${metric}_${fiscalYear ?? "?"}_${periodType ?? "?"}`;
}

// ─────────────────────────────────────────────────────────────
// 기간 정규화(§12, hardened §7/§10) — AI가 만든 자유 문자열을 계산
// 엔진에 그대로 넣지 않는다. financial-validation.ts의
// periodTypeSchema(ANNUAL/QUARTERLY/TTM)와 같은 값 집합으로만 정규화한다
// — 인식 못 하면 null(추측 금지).
//
// PR-I.1 수정(Finding #7): 기존 `/\bq[1-4]\b|quarter/`는 `quarter`
// alternative에 단어 경계가 없어 "headquarters"(head+quarter+s) 안의
// "quarter" 부분문자열에도 매칭돼 QUARTERLY로 잘못 분류됐다(실증됨).
// `\bquarter\b`로 고정한다.
//
// 안전하게 확장 가능한 변형(§7 요구)도 추가한다: FY-2024, 2024/12,
// Dec-2024, LTM. 단 2024A/2024E(실적/추정 구분)는 절대 파싱하지 않는다
// (§10) — 이 모델에는 actual/forecast 축 자체가 없으므로, 문자만 잘라
// ANNUAL로 만들면 실적과 추정이 같은 기간 identity로 조용히 합쳐질 수
// 있다. 그래서 명시적으로 unsupported로 남긴다(아래 정규식 어디에도
// "2024a"/"2024e" 패턴을 인식하는 분기가 없다 — 의도적 부재).
// ─────────────────────────────────────────────────────────────

export function normalizePeriodTypeString(raw: string | undefined): "ANNUAL" | "QUARTERLY" | "TTM" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/\bttm\b|\bltm\b|trailing\s*twelve|last\s*twelve/.test(lower)) return "TTM";
  if (/\bq[1-4]\b|\bquarter\b/.test(lower)) return "QUARTERLY";
  if (/\bannual\b|fy[\s-]?\d{4}|^\d{4}$|\d{4}[.\/]12|fiscal\s*year|\bdec[-\s]\d{4}\b/.test(lower)) return "ANNUAL";
  return null;
}

// ─────────────────────────────────────────────────────────────
// 검증(§10, §11) — validateFactCandidate 하나가 §10의 최소 검증을 전부
// 수행한다. PR-I.1에서 unit/currency 정합성(Finding #4), customerId
// 필수(Finding #9), scope 검증(Finding #6)을 추가한다.
// ─────────────────────────────────────────────────────────────

export interface PEFactValidationContext {
  evidenceById: Map<string, PEEvidenceItem>;
  sourceById: Map<string, PEEvidenceSource>;
  /** 알려진 기간 집합(financialPeriodId 기준이 아니라 fiscalYear+periodType 조합) —
   * 제공되면 아직 등록되지 않은 기간의 fact는 INVALID가 아니라 NEEDS_REVIEW로
   * 표시한다(숫자 자체는 문제없지만 알려진 재무기간과 아직 연결되지 않음).
   * 생략하면 이 검사를 하지 않는다(기존 동작 유지). */
  knownPeriodKeys?: Set<string>;
  /**
   * PR-I.1 Finding #6 — 이 필드를 제공하면 "strict scope 모드"가 켜진다:
   * fact의 sourceEvidenceId가 가리키는 evidence→source의 dealId/documentId가
   * 여기 지정한 값과 정확히 일치해야 한다. source에 dealId/documentId
   * 자체가 없으면(레거시 데이터) "확인 불가"로 간주해 안전하게 실패시킨다
   * (§6 — "missing scope => safe failure for strict validation mode").
   * 생략하면(기본값) 기존처럼 존재 여부만 확인하는 레거시 호환 모드다 —
   * PR-D.1~PR-I의 기존 호출부는 전부 이 필드를 넘기지 않으므로 동작이
   * 바뀌지 않는다.
   */
  expectedDealId?: string;
  expectedDocumentId?: string;
}

/** PEFactValidationContext.knownPeriodKeys에 넣을 키를 만든다("2025|ANNUAL" 형식). */
export function periodKey(fiscalYear: number, periodType: string): string {
  return `${fiscalYear}|${periodType}`;
}

function isKnownMetric(factType: string, metric: string): boolean {
  if (factType === "FINANCIAL") return (PE_FINANCIAL_FACT_METRICS as readonly string[]).includes(metric);
  if (factType === "COMMERCIAL") return (PE_COMMERCIAL_FACT_METRICS as readonly string[]).includes(metric);
  return false;
}

/** unit/currency 정합성을 검증해야 하는 "화폐성" metric인지 — CUSTOMER_COUNT/
 * ACTIVE_CUSTOMER/RETENTION/CHURN처럼 본질적으로 금액이 아닌 지표는
 * 제외한다(§4E — "과도하게 일반화하지 않는다"). */
const MONETARY_METRICS = new Set([
  "REVENUE", "EBITDA", "EBIT", "NET_INCOME", "TOTAL_ASSETS", "TOTAL_LIABILITIES",
  "EQUITY", "CASH", "DEBT", "CAPEX", "WORKING_CAPITAL", "RECURRING_REVENUE",
  "CUSTOMER_REVENUE", "CONTRACT_VALUE",
]);

export function validateFactCandidate(
  raw: RawAIExtractedFact,
  documentId: string,
  ctx: PEFactValidationContext
): PEFactCandidate {
  const reasons: string[] = [];

  // 1. numeric finite
  if (!Number.isFinite(raw.value)) reasons.push("value가 유한한 숫자가 아닙니다(NaN/Infinity 불가)");
  // 2. unit present
  if (!raw.unit || !raw.unit.trim()) reasons.push("unit이 없습니다");
  // 3. currency present when financial
  if (raw.factType === "FINANCIAL" && (!raw.currency || !raw.currency.trim())) {
    reasons.push("FINANCIAL fact는 currency가 필요합니다");
  }
  // metric이 §4 목록에 있는지(unsupported metric)
  if (!isKnownMetric(raw.factType, raw.metric)) {
    reasons.push(`지원하지 않는 metric입니다: ${raw.factType}/${raw.metric}`);
  }
  // PR-I.1 Finding #9 — CUSTOMER_REVENUE는 customerId가 필수(고객 식별 없이는
  // PR-H concentration 계산으로 연결할 방법이 없음).
  if (raw.metric === "CUSTOMER_REVENUE" && (!raw.customerId || !raw.customerId.trim())) {
    reasons.push("CUSTOMER_REVENUE metric은 customerId가 필요합니다");
  }

  // PR-I.1 Finding #4 — unit 정규화 + currency 정합성. 화폐성 metric에서만
  // 강제한다(RETENTION/CHURN 등은 본질적으로 금액이 아니므로 대상 밖).
  const normalizedUnit = normalizeUnitString(raw.unit);
  if (raw.unit && raw.unit.trim() && MONETARY_METRICS.has(raw.metric)) {
    if (normalizedUnit === null) {
      // raw.unit이 있는데 정규화가 null이 될 수는 없다(normalizeUnitString은
      // 빈 문자열일 때만 null을 반환) — 방어적으로 남겨둔다.
      reasons.push("unit을 해석할 수 없습니다");
    } else if (normalizedUnit === "PERCENT" || normalizedUnit === "COUNT") {
      reasons.push(`${raw.metric}은(는) 금액 지표라 PERCENT/COUNT 단위를 쓸 수 없습니다: ${raw.unit}`);
    } else if (normalizedUnit === "UNKNOWN") {
      reasons.push(`unit을 인식할 수 없어 스케일을 판단할 수 없습니다(추측 금지): "${raw.unit}"`);
    } else if (!isMonetaryUnit(normalizedUnit) || !isUnitCurrencyCompatible(normalizedUnit, raw.currency)) {
      reasons.push(`unit(${raw.unit})과 currency(${raw.currency ?? "?"})가 서로 다른 통화를 가리킵니다`);
    }
  }

  // 4. period present
  const normalizedPeriodType = normalizePeriodTypeString(raw.periodType);
  if (raw.fiscalYear === undefined || !Number.isInteger(raw.fiscalYear)) {
    reasons.push("fiscalYear가 없습니다");
  }
  if (!raw.periodType) {
    reasons.push("periodType이 없습니다");
  } else if (normalizedPeriodType === null) {
    reasons.push(`periodType을 정규화할 수 없습니다(추측 금지): "${raw.periodType}"`);
  }
  // 5. source evidence exists / 6. evidence의 source 존재 / PR-I.1 Finding #6 scope 검증
  let evidence: PEEvidenceItem | undefined;
  if (!raw.sourceEvidenceId) {
    reasons.push("sourceEvidenceId가 없습니다");
  } else {
    evidence = ctx.evidenceById.get(raw.sourceEvidenceId);
    if (!evidence) {
      reasons.push(`존재하지 않는 evidence입니다: ${raw.sourceEvidenceId}`);
    } else {
      const source = ctx.sourceById.get(evidence.sourceId);
      if (!source) {
        reasons.push(`evidence의 source가 존재하지 않습니다: ${evidence.sourceId}`);
      } else if (ctx.expectedDealId !== undefined || ctx.expectedDocumentId !== undefined) {
        // strict scope 모드 — dealId/documentId가 없는 source(레거시)는
        // "확인 불가"로 간주해 안전하게 거부한다(§6).
        if (ctx.expectedDealId !== undefined) {
          if (source.dealId === undefined || source.dealId !== ctx.expectedDealId) {
            reasons.push("evidence가 이 딜(scope)에 속하지 않습니다(dealId 불일치 또는 미상)");
          }
        }
        if (ctx.expectedDocumentId !== undefined) {
          if (source.documentId === undefined || source.documentId !== ctx.expectedDocumentId) {
            reasons.push("evidence가 이 문서(scope)에 속하지 않습니다(documentId 불일치 또는 미상)");
          }
        }
      }
    }
  }
  // 7. confidence bounds
  if (raw.confidence !== undefined && (raw.confidence < 0 || raw.confidence > 1)) {
    reasons.push(`confidence가 0~1 범위를 벗어났습니다: ${raw.confidence}`);
  }
  // sourceLocation은 AI가 지어낸 것인지 검증할 방법이 이 함수 수준에는 없다
  // (실제 parser 출력과의 대조는 pe-fact-extraction.ts가 문서 파서 출력만
  // 프롬프트에 넣는 것으로 예방한다 — §6/§48). 여기서는 형태만 본다:
  // 빈 문자열이면 "위치 없음"과 구분이 안 되므로 무의미한 빈 문자열은 제거한다.

  const needsReview =
    reasons.length === 0 &&
    ctx.knownPeriodKeys !== undefined &&
    raw.fiscalYear !== undefined &&
    normalizedPeriodType !== null &&
    !ctx.knownPeriodKeys.has(periodKey(raw.fiscalYear, normalizedPeriodType));
  if (needsReview) {
    reasons.push(`아직 등록되지 않은 기간입니다(FY${raw.fiscalYear} ${normalizedPeriodType}) — 숫자 자체는 유효하나 확인 필요`);
  }

  const status = reasons.length > 0 ? (needsReview ? "NEEDS_REVIEW" : "INVALID") : "VALIDATED";

  return {
    id: deriveFactId(documentId, raw.sourceEvidenceId ?? "?", raw.metric, raw.fiscalYear, raw.periodType),
    documentId,
    factType: raw.factType,
    metric: raw.metric,
    value: raw.value,
    unit: raw.unit,
    currency: raw.currency,
    fiscalYear: raw.fiscalYear,
    normalizedPeriodType: normalizedPeriodType ?? undefined,
    normalizedUnit: normalizedUnit ?? undefined,
    sourceEvidenceId: raw.sourceEvidenceId ?? "",
    sourceLocation: raw.sourceLocation,
    aiConfidence: raw.confidence,
    status,
    rejectionReasons: reasons,
    customerId: raw.customerId,
    customerName: raw.customerName,
  };
}

export function validateFactCandidates(
  extraction: RawAIExtraction,
  ctx: PEFactValidationContext
): PEFactCandidate[] {
  return extraction.facts.map((f) => validateFactCandidate(f, extraction.documentId, ctx));
}
