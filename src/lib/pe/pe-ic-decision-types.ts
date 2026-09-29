/**
 * PE IC Decision — 순수 타입(PR #108).
 *
 * 이 파일은 판단하지 않는다. `buildPEDecisionReadiness()`(PR #103)/
 * `calculateAdjustedEbitda()`(PR-D)/`bridgeQoEToLboEntryEbitda()`(PR-E)/
 * `validatePEDDCase()`/`validatePEEvidenceLineage()`(PR-F/PR-G)가 이미
 * 계산·검증한 결과를 하나의 "IC가 읽는 결정 패키지" 모양으로 담는
 * 타입만 정의한다. 새 재무/QoE/LBO 계산, 새 readiness 판정, 새 evidence
 * 검증 로직은 이 파일에도, 이 파일을 조립하는 pe-ic-decision.ts에도 없다.
 *
 * ## BUY/PASS가 아니다(§0, 최우선 원칙)
 *
 * `PEICProcessState`는 "IC가 지금 이 딜을 검토할 준비가 됐는가"라는
 * 프로세스 상태이지, "이 딜에 투자해야 하는가"라는 투자 판단이 아니다.
 * `buildPEDecisionReadiness()`의 `ReadinessState`(READY/PARTIAL/MISSING/
 * NOT_STARTED/BLOCKED)를 그대로 재사용하는 이름이 아니라 IC 프로세스
 * 어휘(READY_FOR_IC/PARTIALLY_READY/NOT_READY/BLOCKED)로 감싸는 이유는,
 * "READY"라는 단어가 화면 문맥에 따라 "투자하기 좋다"로 오독될 위험을
 * 없애기 위함이다 — 의미는 여전히 readiness 엔진의 판정 그대로다.
 */

import type { PEDecisionDomainKey, PEDecisionReadiness } from "./pe-decision-readiness";
import type { PEDDCategory, PEDDSeverity, PEDDFindingStatus } from "./dd-types";

// ── A. IC 프로세스 상태(투자 판단 아님) ──────────────────────────────────

export const PE_IC_PROCESS_STATES = ["READY_FOR_IC", "PARTIALLY_READY", "NOT_READY", "BLOCKED"] as const;
export type PEICProcessState = (typeof PE_IC_PROCESS_STATES)[number];

// ── B. Investment Thesis ─────────────────────────────────────────────────

/**
 * §4 상태 정의 — 반드시 evidence-lineage.ts의 실제 연결 상태에서만
 * 결정론적으로 유도한다(AI가 지어낸 신뢰도 아님):
 * - SUPPORTED: 근거(evidence)가 최소 1건 연결돼 있고, 그 근거들의
 *   confidence가 명시된 경우 전부 0.5 이상이며, 관련 재무기간에
 *   factConflict가 없다.
 * - PARTIALLY_SUPPORTED: 근거는 있지만 연결된 근거 중 confidence가
 *   명시적으로 0.5 미만인 것이 있다(근거 자체가 스스로 약하다고 표시함).
 * - UNSUPPORTED: 연결된 근거가 0건이다.
 * - CONTRADICTED: 이 주장이 가리키는 재무기간에 실제 factConflict가
 *   존재한다(값이 상충하는데 그 위에 주장을 세울 수 없음).
 */
export const PE_THESIS_STATUSES = ["SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "CONTRADICTED"] as const;
export type PEThesisStatus = (typeof PE_THESIS_STATUSES)[number];

export type PEThesisMateriality = "MATERIAL" | "INFORMATIONAL";

export interface PEThesisItem {
  /** evidence-lineage-types.ts PEClaim.id — 새 id 체계를 만들지 않는다 */
  id: string;
  statement: string;
  status: PEThesisStatus;
  materiality: PEThesisMateriality;
  supportingEvidenceIds: string[];
  supportingClaimIds: string[];
  financialPeriodId?: string;
}

// ── C. Key Investment Drivers ────────────────────────────────────────────

/** Driver 자체의 상태는 thesis item과 같은 어휘를 쓴다(§5) — 별도 신뢰도
 * 체계를 만들지 않는다. `buildPEInvestmentDrivers()`는 오직 SUPPORTED
 * thesis item만 driver로 승격한다(§5 "지어낸 driver 금지"). */
export interface PEInvestmentDriver {
  id: string;
  title: string;
  description: string;
  status: Extract<PEThesisStatus, "SUPPORTED">;
  evidenceIds: string[];
  /** 알 때만 채운다 — 이 driver가 어느 재무 지표와 관련 있는지(추정 아님) */
  financialRelevance?: string;
}

// ── D. Thesis Breakers / Risks ───────────────────────────────────────────

/**
 * §6 — thesis breaker는 일반 리스크 목록이 아니다. 반드시 실제 소스에서
 * 유도된다: PEDDFinding(CRITICAL/HIGH, 아직 CLOSED/REJECTED 아님) 또는
 * CONTRADICTED thesis item, 또는 "필요한 원천 데이터 자체가 없어 지금은
 * 확인할 수 없다"는 정직한 상태(CANNOT_BE_ESTABLISHED — 절대 추정하지
 * 않는다, §6 고객 집중도 예시 그대로).
 */
export const PE_THESIS_BREAKER_STATES = [
  "OPEN",
  "MITIGATED",
  "ACCEPTED",
  "CANNOT_BE_ESTABLISHED",
] as const;
export type PEThesisBreakerState = (typeof PE_THESIS_BREAKER_STATES)[number];

export type PEThesisBreakerSourceType = "DD_FINDING" | "CONTRADICTED_THESIS" | "STRUCTURAL_DATA_GAP";

export interface PEThesisBreaker {
  id: string;
  sourceType: PEThesisBreakerSourceType;
  /** 어떤 조건이 성립하면 thesis가 깨지는가 */
  condition: string;
  whyItMatters: string;
  evidenceIds: string[];
  currentState: PEThesisBreakerState;
  decisionImpact: string;
  verificationRequired: string;
}

// ── E. IC Questions ───────────────────────────────────────────────────────
// 실제 생성 로직(buildICQuestions)은 pe-ic-questions.ts에 있다 — 타입만
// 여기 둔다(pe-ic-questions.ts가 이 파일의 PEThesisItem을 입력으로 쓰므로,
// 순환 참조를 피하려고 ICQuestion 자체는 여기서 정의하고 pe-ic-questions.ts가
// 그대로 재수출한다).

export const PE_IC_QUESTION_PRIORITIES = ["P0", "P1", "P2"] as const;
export type PEICQuestionPriority = (typeof PE_IC_QUESTION_PRIORITIES)[number];

export type ICQuestionSourceType = "BLOCKER" | "FACT_CONFLICT" | "MISSING_INFO" | "DD_FINDING" | "UNSUPPORTED_THESIS";

export interface ICQuestion {
  /** blocker/missingInformation code, factConflict 조합, DD finding id, 또는 thesis claim id — 추적용 유일 키(= source id) */
  code: string;
  sourceType: ICQuestionSourceType;
  domainLabel: string;
  priority: PEICQuestionPriority;
  question: string;
  whyItMatters: string;
  requiredEvidence: string;
  decisionImpact: string;
}

// ── F. Snapshot 참조 타입(전부 이미 계산된 값을 옮겨 담을 뿐) ────────────

export interface PEICFinancialSnapshot {
  latestPeriodLabel: string | null;
  revenue: import("./financial-types").FinancialCalcResult;
  ebitda: import("./financial-types").FinancialCalcResult;
  netDebt: import("./financial-types").FinancialCalcResult;
  hasConflict: boolean;
  conflictCount: number;
}

export interface PEICQoESnapshot {
  hasData: boolean;
  reportedEbitda?: import("./financial-types").FinancialCalcResult;
  adjustedEbitda?: import("./financial-types").FinancialCalcResult;
  approvedAdjustmentCount: number;
  totalAdjustmentCount: number;
  /** buildPEDecisionReadiness()의 qoeReviewTrackingLimitation을 그대로 옮긴다(§7 원칙 유지) */
  reviewTrackingLimitation: string;
}

export interface PEICLboSnapshot {
  entryEbitdaStatus: "ok" | "not_available";
  entryEbitdaInEok?: number;
  /**
   * `computeLboEntryEbitda()`(ma-deal-dashboard.ts)는 readiness와 무관하게
   * "이 재무기간의 EBITDA만으로 브릿지가 계산 가능한가"만 답한다 — REVENUE
   * 등 다른 계정에 factConflict가 있어도 EBITDA 자체가 단일 값이면
   * entryEbitdaStatus는 여전히 "ok"로 나온다(계산 가능 여부와 신뢰 가능
   * 여부는 별개 질문). 이 필드는 그 간극을 메운다 — readiness의 LBO
   * 도메인이 BLOCKED면 true. true일 때 UI/메모는 값을 숨기지 않되(값
   * 자체는 실제 계산 결과이므로) "상위 데이터 모순으로 신뢰할 수 없다"는
   * 경고를 반드시 같이 보여줘야 한다(PR #108 최종 리뷰에서 발견 — Executive
   * Summary는 경고하는데 LBO 섹션만 보면 숫자가 신뢰 가능한 것처럼
   * 보이는 문제).
   */
  upstreamBlocked: boolean;
  /** IC가 아직 LBO 탭에서 가정을 입력하지 않았으면 true(§9 — MOIC/IRR 지어내지 않음) */
  assumptionsMissing: boolean;
  missingAssumptionLabels: string[];
}

export interface PEICDdSnapshot {
  findingCount: number;
  openMaterialFindingCount: number;
  confirmedFindingCount: number;
  mitigatedFindingCount: number;
  byCategory: Partial<Record<PEDDCategory, number>>;
  /** ddCase.findings를 그대로 옮긴 것 — 새 목록이 아니다. 메모(pe-ic-memo.ts)의
   * 카테고리별 섹션(8/9)이 이 배열을 그대로 필터링해서 쓴다. */
  findings: import("./dd-types").PEDDFinding[];
}

export interface PEICEvidenceSnapshot {
  evidenceCount: number;
  sourceCount: number;
  claimCount: number;
  unsupportedClaimCount: number;
}

// ── G. 최종 IC Decision 패키지 ────────────────────────────────────────────

export interface PEICDecision {
  dealId: string;
  processState: PEICProcessState;
  /** IC 화면/메모가 그대로 보여줄 3~5개 사실 기반 근거 문장(요약, 템플릿 조합 — AI 아님) */
  processStateReasons: string[];
  thesis: PEThesisItem[];
  drivers: PEInvestmentDriver[];
  breakers: PEThesisBreaker[];
  questions: ICQuestion[];
  financial: PEICFinancialSnapshot;
  qoe: PEICQoESnapshot;
  lbo: PEICLboSnapshot;
  dd: PEICDdSnapshot;
  evidence: PEICEvidenceSnapshot;
  /** buildPEDecisionReadiness() 결과 원본 — UI/메모가 도메인별 상세가 필요하면 여기서 읽는다(재판정 없음) */
  readiness: PEDecisionReadiness;
  materialMissingInfoDomains: PEDecisionDomainKey[];
}

export const PE_DD_FINDING_MATERIAL_SEVERITIES: readonly PEDDSeverity[] = ["CRITICAL", "HIGH"];
export const PE_DD_FINDING_OPEN_STATUSES: readonly PEDDFindingStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "CONFIRMED",
  "MITIGATED",
  "ACCEPTED",
];
