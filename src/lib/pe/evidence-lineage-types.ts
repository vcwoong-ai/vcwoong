/**
 * PE Evidence Lineage — 타입(PR-F).
 *
 * ## 왜 evidence.ts(VC)를 재사용하지 않는가(§15 audit 결론)
 *
 * `src/lib/evidence.ts`의 `EvidenceSource`/`NumericClaim`/`EvidenceReport`는
 * "AI가 생성한 보고서 본문에서 숫자를 정규식으로 추출해 업로드 문서 원문과
 * 대조"하는 VC 전용 파이프라인에 강하게 결합돼 있다 — `sectionKey`(VC
 * SectionKey), `ClaimConfidence`("HIGH"/"MEDIUM"/"LOW"/"UNSUPPORTED" — AI
 * 의미체계), `matchMethod`("ai_semantic" 포함), `deep-dive.ts` 의존, 보고서
 * 텍스트 정규식 매칭 로직이 전부 그 목적 하나에 묶여 있다. PE Evidence
 * Lineage는 반대로 "이미 구조화된 재무 숫자(QoE/LBO)가 어떤 ID 체인을 거쳐
 * 어떤 원천에 도달하는가"를 다루는 결정론적 그래프이지, 자유 텍스트에서
 * 숫자를 뽑아내는 문제가 아니다 — 목적과 데이터 형태가 다르므로 VC
 * 파이프라인에 억지로 끼워 맞추지 않고 PE 전용 타입을 새로 둔다(evidence.ts는
 * 이 PR에서 전혀 수정하지 않음).
 *
 * 대신 실제로 재사용 가능한 것은 재사용한다:
 * - `MaFinancialSourceType`(financial-types.ts, PR-B) — sourceType을 위해
 *   새 enum을 만들지 않고 그대로 쓴다.
 * - `CanonicalLineItem`(financial-types.ts) — Financial Fact의 metric.
 * - `QoEAdjustmentInput`/`QoEAdjustmentStatus`/`QoEAdjustmentType`(qoe-types.ts,
 *   PR-D) — Adjustment Reference가 그대로 확장(extends)한다. 필드를
 *   재정의하지 않는다.
 * - `QoEToLboBridgeProvenance`(qoe-lbo-bridge.ts, PR-E) — LBO 경계 lineage는
 *   이 타입을 그대로 감싸 쓴다. 새 provenance 구조를 만들지 않는다.
 *
 * ## Source(sourceLocation undefined 허용) — DART 계약 보존(§13)
 *
 * dart-adapter.ts가 이미 확립한 계약(`sourceLocation`을 페이지 번호 등으로
 * 추정해서 채우지 않고 그냥 비워둠)을 이 타입들도 그대로 따른다 —
 * `sourceLocation?`은 선택 필드이고, undefined는 "정보 없음"이 아니라
 * "알 수 없는 게 정상"인 상태다.
 *
 * ## 기간 identity(§11)
 *
 * `MAFinancialPeriod`(schema.prisma)의 실제 필드(fiscalYear/periodType/
 * currency)를 그대로 가져와 `PEFinancialPeriodIdentity`로 등록한다. Fact/
 * Adjustment/QoEResult는 `financialPeriodId`만 참조하고(MAFinancialLineItem/
 * MAFinancialAdjustment의 실제 DB 모양과 동일 — fiscalYear/periodType을
 * 중복 저장하지 않음), fiscalYear/periodType/currency 비교가 필요하면
 * `periods` 레지스트리를 통해서만 한다 — 여러 곳에 중복 저장된 사본이
 * 서로 어긋나는 버그 클래스를 구조적으로 없앤다.
 */

import type { CanonicalLineItem, MaFinancialSourceType } from "./financial-types";
import type { QoEAdjustmentInput, QoEAdjustmentStatus } from "./qoe-types";
import type { QoEToLboBridgeProvenance } from "./qoe-lbo-bridge";

export type PEFinancialPeriodType = "ANNUAL" | "QUARTERLY" | "TTM";

/** MAFinancialPeriod(schema.prisma)의 실제 identity 필드만 그대로 옮긴다. */
export interface PEFinancialPeriodIdentity {
  id: string;
  fiscalYear: number;
  periodType: PEFinancialPeriodType;
  currency: string;
}

/** "정보가 어디서 왔는가" — DART/업로드문서/Excel/수기입력(MaFinancialSourceType 그대로). */
export interface PEEvidenceSource {
  id: string;
  sourceType: MaFinancialSourceType;
  sourceName: string;
  /** 알 때만 채운다 — 추정 금지(dart-adapter.ts와 동일 계약) */
  sourceLocation?: string;
  /** 예: DART 접수번호, 문서 스토리지 키 등 — 알 때만 */
  externalReference?: string;
  /** 호출자가 명시적으로 제공할 때만 채운다 — 이 코어는 Date.now() 등
   * 환경 의존적 값을 스스로 생성하지 않는다(§14, 결정론 유지). */
  createdAt?: string;
  /**
   * PR-I.1(adversarial review Finding #6)에서 추가 — 이 source가 속한
   * 딜/문서. 선택 필드라 기존 PR-F 계약(§10 검증 등)을 바꾸지 않는다 —
   * 값이 없는 기존 source는 그대로 "scope 미상"으로 남고, strict scope
   * 검증(pe-fact-validation.ts의 PEFactValidationContext.expectedDealId/
   * expectedDocumentId)을 쓰지 않는 한 동작에 영향이 없다. PR-F 자체의
   * validatePEEvidenceLineage()는 이 필드를 검증하지 않는다(소유권 검증은
   * PE 레이어— pe-fact-validation.ts — 의 책임으로 유지).
   */
  dealId?: string;
  documentId?: string;
}

/** Source 안에서 특정 사실을 뒷받침하는 근거 한 건(예: PDF 42페이지의 문장). */
export interface PEEvidenceItem {
  id: string;
  sourceId: string;
  /** Source.sourceLocation보다 더 구체적인 위치(예: "23페이지 표3") — 알 때만 */
  locator?: string;
  /** 원문 발췌 — 알 때만, 지어내지 않는다 */
  excerpt?: string;
  /** 0 <= confidence <= 1. 범위를 벗어나면 createEvidenceItem()이 즉시 reject한다. */
  confidence?: number;
}

export type PEClaimType = "numeric" | "qualitative";

/** Evidence가 뒷받침하는 주장(자연어 assertion) — Financial Fact와 별개 개념(§2). */
export interface PEClaim {
  id: string;
  statement: string;
  claimType: PEClaimType;
  /** 이 주장이 특정 재무기간에 관한 것이면 채운다 — 기간 비교(§11)에 쓰인다.
   * 기간과 무관한 주장(예: 정성적 서술)은 비워둘 수 있다. */
  financialPeriodId?: string;
  /** evidence 없는 claim은 구조적으로 허용한다(evidence.ts의 status:"unverified"
   * 선례를 따름 — §10 rule 9) — 다만 findUnsupportedClaims()로 별도 추적 가능. */
  evidenceIds: string[];
}

/**
 * 정규화된 재무 숫자 하나의 lineage reference. 값 자체를 재계산하지 않는다
 * (financial-normalization.ts/normalizeFinancialPeriod()가 이미 계산한 값을
 * 그대로 참조) — 이 타입은 "그 값이 어떤 evidence/claim에서 왔는가"만 담는다.
 */
export interface PEFinancialFactReference {
  id: string;
  financialPeriodId: string;
  metric: CanonicalLineItem;
  value: number;
  currency: string;
  sourceClaimIds: string[];
  evidenceIds: string[];
}

/**
 * QoE Adjustment의 lineage reference. `QoEAdjustmentInput`(qoe-types.ts,
 * PR-D)을 그대로 확장한다 — 필드를 재정의하거나 새 adjustment 모델을
 * 만들지 않는다(§7). `id`/`financialPeriodId`/`normalizedValue`/근거 ID만
 * 추가한다. `normalizedValue`는 새로 계산하지 않고
 * `computeAdjustmentNormalizedValue()`(financial-normalization.ts, PR-B,
 * 수정하지 않음)를 그대로 호출해 채운다(evidence-lineage.ts 참고).
 */
export interface PEQoEAdjustmentReference extends QoEAdjustmentInput {
  id: string;
  financialPeriodId: string;
  normalizedValue: number;
  evidenceIds: string[];
  claimIds: string[];
}

/**
 * `calculateAdjustedEbitda()`(qoe.ts, PR-D, 수정하지 않음) 결과가 어떤
 * adjustment/기간을 기반으로 만들어졌는지 추적하는 참조. baseEbitdaKrw/
 * adjustedEbitdaKrw는 QoEResult에서 그대로 옮긴 값이며 여기서 다시
 * 계산하지 않는다(§8).
 */
export interface PEQoEResultLineageReference {
  id: string;
  financialPeriodId: string;
  baseEbitdaKrw: number;
  /** APPROVED 상태인 adjustment의 id만(qoe.ts의 APPROVED-only 계약을 그대로 반영) */
  approvedAdjustmentIds: string[];
  adjustedEbitdaKrw: number;
}

/**
 * qoe-lbo-bridge.ts(PR-E, 수정하지 않음)의 `QoEToLboBridgeProvenance`를
 * 그대로 감싼다 — 새 provenance 구조를 만들지 않는다(§9).
 */
export interface PELboBridgeLineageReference {
  id: string;
  qoeResultLineageId: string;
  provenance: QoEToLboBridgeProvenance;
}

/** 전체 lineage 그래프 — 결정론적 순수 데이터, DB에 저장하지 않는다(§0). */
export interface PEEvidenceLineage {
  periods: PEFinancialPeriodIdentity[];
  sources: PEEvidenceSource[];
  evidence: PEEvidenceItem[];
  claims: PEClaim[];
  financialFacts: PEFinancialFactReference[];
  adjustments: PEQoEAdjustmentReference[];
  qoeResults: PEQoEResultLineageReference[];
  lboBridges: PELboBridgeLineageReference[];
}

/** §10의 "반드시 reject" 규칙을 판별 가능한 유니온으로 표현한다(FinancialCalcResult와
 * 같은 status 판별 패턴 — 새 에러 프레임워크를 만들지 않음). */
export type LineageValidationIssue =
  | { rule: "dangling_source"; entityId: string; sourceId: string }
  | { rule: "dangling_evidence"; entityId: string; evidenceId: string }
  | { rule: "dangling_claim"; entityId: string; claimId: string }
  | { rule: "dangling_period"; entityId: string; financialPeriodId: string }
  | { rule: "dangling_adjustment"; entityId: string; adjustmentId: string }
  | { rule: "dangling_qoe_result"; entityId: string; qoeResultId: string }
  | { rule: "period_mismatch"; entityId: string; detail: string }
  | { rule: "currency_mismatch"; entityId: string; detail: string }
  | { rule: "invalid_confidence"; entityId: string; confidence: number }
  | { rule: "non_approved_in_result"; entityId: string; adjustmentId: string; status: QoEAdjustmentStatus }
  | { rule: "cycle_detected"; cycle: string[] }
  | { rule: "duplicate_id"; id: string; entityTypes: string[] };

export type LineageValidationResult =
  | { status: "ok" }
  | { status: "invalid"; issues: LineageValidationIssue[] };
