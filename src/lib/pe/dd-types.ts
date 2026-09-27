/**
 * PE Due Diligence Framework — 타입(PR-G).
 *
 * ## 역할 분리(§19)
 *
 * Evidence Lineage(PR-F, evidence-lineage-types.ts)는 "근거가 무엇인가?"를
 * 다룬다(Source→Evidence→Claim→Financial Fact→QoE Adjustment→QoE Result→
 * LBO Bridge). 이 파일은 그 근거들로부터 **어떤 DD issue가 구조화됐는가**를
 * 다룬다 — DD Finding은 PR-F의 그래프 위에 얹히는 새로운 레이어이지,
 * PR-F를 대체하거나 근거 데이터를 복제하지 않는다. `PEDDFinding`은 evidence/
 * claim을 ID로만 참조한다(§6).
 *
 * ## Audit 결론(§0) — 재사용 가능한 것 / 재사용하면 안 되는 것
 *
 * - `src/lib/deal-scoring-evidence.ts`의 `RiskFlag`/`KeyRisk`/
 *   `InvestmentSignal`("STRONG"/"PROMISING"/"CAUTION"/"HIGH_RISK")은 VC
 *   DealScore 투자매력도 판단에 강하게 결합돼 있다 — 재사용하지 않는다
 *   (§21, DealScore 변경 금지와 같은 이유로 이 파일도 건드리지 않음).
 * - `MaSectionKey`(schema.prisma)에 `DD_SUMMARY`/`RISK_FACTORS` 값이 이미
 *   있지만, 이건 "PE 리포트의 어느 섹션인가"라는 다른 층위의 분류(보고서
 *   목차)다 — "이 finding이 어느 DD 영역에 속하는가"라는 이 파일의
 *   taxonomy와 목적이 다르므로 재사용하지 않는다.
 * - `MaDocumentType`에 `DD_MATERIAL`이 있어 "DD 자료"라는 문서 종류는 이미
 *   인식되지만, DD *finding*을 표현하는 타입은 저장소 어디에도 없었다 —
 *   이 파일이 그 공백을 새로 채운다.
 * - `CanonicalLineItem`(financial-types.ts, PR-B)을 Financial Impact의
 *   `metric`으로 그대로 재사용한다 — 새 재무 지표 목록을 만들지 않는다.
 * - `MaFinancialSourceType`(PR-B)은 evidence-lineage-types.ts의
 *   `PEEvidenceSource.sourceType`이 이미 쓰고 있으므로, DD finding의
 *   evidence는 그 Source/Evidence 노드를 그대로 참조하면 된다 — DD 전용
 *   source 타입을 새로 만들 필요가 없다.
 *
 * ## 상태 목록 표기 정정(§0, 명시)
 *
 * 스펙 §5(요약)는 "OPEN"을, §14/§15(상세 lifecycle)는 "DRAFT"를 초기
 * 상태로 쓴다 — 두 표기가 서로 다르다. §14가 "DRAFT finding은 evidence가
 * 없을 수 있다"처럼 DRAFT에 구체적 의미를 명시적으로 부여하므로, 더 상세한
 * 쪽을 따라 **DRAFT**를 채택했다(OPEN은 §5의 요약 표기에서만 쓰인 것으로
 * 판단). 상태 개수(7개)는 두 절이 일치한다.
 */

import type { CanonicalLineItem } from "./financial-types";
import type { PEEvidenceLineage } from "./evidence-lineage-types";

// ─────────────────────────────────────────────────────────────
// DD Domain Taxonomy(§2) — 분류 체계일 뿐, 영역별 분석 엔진은 만들지 않는다.
// ─────────────────────────────────────────────────────────────

export const PE_DD_CATEGORIES = [
  "FINANCIAL",
  "COMMERCIAL",
  "OPERATIONAL",
  "LEGAL",
  "TAX",
  "HR",
  "TECHNOLOGY",
  "IT_SECURITY",
  "REGULATORY",
  "ESG",
  "MANAGEMENT",
  "OTHER",
] as const;
export type PEDDCategory = (typeof PE_DD_CATEGORIES)[number];

/**
 * 카테고리 하위의 구체적 주제(예: FINANCIAL의 "Revenue quality"/"EBITDA
 * quality"/"Working capital", COMMERCIAL의 "Customer concentration"/
 * "Churn" 등, §2 예시)는 이 PR에서 고정 enum으로 만들지 않는다 — 자유
 * 문자열(`PEDDFinding.subCategory`)로 남겨 향후 확장을 막지 않는다(§2:
 * "영역별 상세 분석 로직을 만들지 않는다"). 아래는 §2가 제시한 예시일
 * 뿐이며 검증 대상이 아니다:
 *   FINANCIAL: Revenue quality, EBITDA quality, Working capital, Capex,
 *              Debt, Cash, Accounting policy
 *   COMMERCIAL: Customer concentration, Churn, Pricing, Market growth,
 *               Competitive position, Pipeline
 *   LEGAL: Litigation, Change of control, Material contracts, IP ownership
 */
export type PEDDSubCategory = string;

// ─────────────────────────────────────────────────────────────
// Severity(§4) — 투자 찬반 판단이 아니라 "문제의 심각도"만 표현한다.
// ─────────────────────────────────────────────────────────────

export const PE_DD_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
/**
 * - CRITICAL: 거래 구조 또는 투자 판단을 근본적으로 변경할 수 있는 문제
 * - HIGH: valuation/leverage/EBITDA/deal structure/downside에 실질적인
 *         영향을 줄 가능성이 높은 문제
 * - MEDIUM: 중요하지만 즉각적인 거래 중단 수준은 아닌 문제
 * - LOW: 관리 가능한 경미한 이슈
 * - INFO: 참고사항
 *
 * 이 값 자체가 "투자해야 한다/하지 말아야 한다"는 결론을 담지 않는다 —
 * 그 해석은 향후 PE IC Agent의 몫이다(§16, 이 PR에서 만들지 않음).
 */
export type PEDDSeverity = (typeof PE_DD_SEVERITIES)[number];

// ─────────────────────────────────────────────────────────────
// Finding Status / Lifecycle(§5, §15)
// ─────────────────────────────────────────────────────────────

export const PE_DD_FINDING_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "CONFIRMED",
  "MITIGATED",
  "ACCEPTED",
  "REJECTED",
  "CLOSED",
] as const;
/**
 * - DRAFT: 초기 작성 상태. evidence/claim이 아직 없을 수 있다(정상 — §14).
 * - IN_REVIEW: 검토 중.
 * - CONFIRMED: 검토 결과 실제 issue로 확인됨. evidence 또는 claim이
 *   최소 1건 있어야 한다(requiresEvidenceForStatus 참고).
 * - MITIGATED: 이슈에 대한 대응조치가 이루어진 상태(이슈 자체가 없었던
 *   게 아니라, 이슈는 있었고 대응이 완료됨).
 * - ACCEPTED: 이슈가 존재하지만 현재 기준으로 수용된 상태(이슈가 사라진
 *   게 아니다).
 * - REJECTED: **"문제가 발생하지 않았다"는 뜻이 아니다.** "검토 결과 이
 *   관찰을 finding으로 인정하지 않음"이라는 의미다.
 * - CLOSED: 해당 DD item이 종결된 상태(최종 상태 — 여기서 다른 상태로
 *   되돌아가는 전이는 허용하지 않는다, 예: CLOSED → DRAFT는 invalid).
 */
export type PEDDFindingStatus = (typeof PE_DD_FINDING_STATUSES)[number];

/**
 * CONFIRMED 이상(이슈로 확정된 이후)의 상태는 evidence 또는 claim 근거가
 * 최소 1건 있어야 한다는 게 이 도메인의 lifecycle 원칙이다(§14) — DRAFT/
 * IN_REVIEW/REJECTED는 근거가 없어도 구조적으로 정상이다(REJECTED는 "근거
 * 불충분해서 기각"인 경우가 오히려 흔하다).
 */
export function requiresEvidenceForStatus(status: PEDDFindingStatus): boolean {
  return status === "CONFIRMED" || status === "MITIGATED" || status === "ACCEPTED" || status === "CLOSED";
}

// ─────────────────────────────────────────────────────────────
// Financial / LBO Impact Reference(§7, §8) — 이미 계산된 값을 가리킬 뿐,
// 이 PR에서 revenue/EBITDA/EV/IRR impact를 계산하지 않는다.
// ─────────────────────────────────────────────────────────────

export type PEDDImpactDirection = "INCREASE" | "DECREASE" | "UNCERTAIN";

/** 이미 계산된 재무 영향을 lineage에 연결하기만 한다 — 금액을 여기서 계산하지 않는다. */
export interface PEDDFinancialImpactReference {
  metric: CanonicalLineItem;
  amount: number;
  currency: string;
  financialPeriodId: string;
  direction: PEDDImpactDirection;
  /** 이 impact의 근거가 된 QoE Adjustment(evidence-lineage-types.ts
   * PEQoEAdjustmentReference.id) — 알 때만 채운다. */
  sourceAdjustmentId?: string;
}

export const PE_DD_LBO_IMPACT_TARGETS = [
  "ENTRY_EBITDA",
  "NET_DEBT",
  "INTEREST_RATE",
  "EXIT_MULTIPLE",
  "EXIT_EBITDA",
  "MOIC",
  "IRR",
] as const;
export type PEDDLboImpactTarget = (typeof PE_DD_LBO_IMPACT_TARGETS)[number];

/** "이 finding이 LBO의 어떤 입력/결과와 연결되는가"만 표현한다 — MOIC/IRR을
 * 여기서 계산하지 않는다(lbo-model.ts는 이 PR에서 전혀 import하지 않음). */
export interface PEDDLboImpactReference {
  affectedTarget: PEDDLboImpactTarget;
  /** evidence-lineage-types.ts PELboBridgeLineageReference.id — 알 때만 채운다. */
  lboBridgeLineageId?: string;
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// DD Finding(§3) — 핵심 객체.
// ─────────────────────────────────────────────────────────────

export interface PEDDFinding {
  id: string;
  category: PEDDCategory;
  subCategory?: PEDDSubCategory;
  title: string;
  description: string;
  severity: PEDDSeverity;
  status: PEDDFindingStatus;
  /** evidence-lineage-types.ts PEEvidenceItem.id 참조만 — evidence 데이터를 복제하지 않는다. */
  evidenceIds: string[];
  /** evidence-lineage-types.ts PEClaim.id 참조만. */
  claimIds: string[];
  /** evidence-lineage-types.ts PEFinancialPeriodIdentity.id — 재무기간과 무관한
   * finding(예: 순수 LEGAL 이슈)은 비워둘 수 있다. */
  financialPeriodId?: string;
  owner?: string;
  resolution?: string;
  financialImpact?: PEDDFinancialImpactReference;
  lboImpact?: PEDDLboImpactReference;
  /** 호출자가 명시적으로 제공할 때만 채운다 — Date.now() 등 환경 의존값을
   * 이 코어가 스스로 생성하지 않는다(evidence-lineage.ts와 동일 원칙). */
  createdAt?: string;
}

// ─────────────────────────────────────────────────────────────
// DD Case — Finding 목록 + 그 근거가 되는 PR-F Evidence Lineage를 함께 묶는다.
// evidence-lineage-types.ts의 PEEvidenceLineage를 그대로 참조한다(복제 없음).
// ─────────────────────────────────────────────────────────────

export interface PEDDCase {
  lineage: PEEvidenceLineage;
  findings: PEDDFinding[];
}

export type PEDDValidationIssue =
  | { rule: "dangling_evidence"; findingId: string; evidenceId: string }
  | { rule: "dangling_claim"; findingId: string; claimId: string }
  | { rule: "dangling_period"; findingId: string; financialPeriodId: string }
  | { rule: "dangling_adjustment"; findingId: string; adjustmentId: string }
  | { rule: "dangling_lbo_bridge"; findingId: string; lboBridgeLineageId: string }
  | { rule: "period_mismatch"; findingId: string; detail: string }
  | { rule: "currency_mismatch"; findingId: string; detail: string }
  | { rule: "missing_evidence_for_status"; findingId: string; status: PEDDFindingStatus }
  | { rule: "invalid_lbo_target"; findingId: string; target: string }
  | { rule: "lineage_invalid"; detail: string };

export type PEDDValidationResult =
  | { status: "ok" }
  | { status: "invalid"; issues: PEDDValidationIssue[] };
