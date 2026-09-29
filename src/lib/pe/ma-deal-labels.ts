/** MADeal(PE 트랙) enum → 한글 라벨. deal-labels.ts(VC)와 동일한 성격이지만
 * 완전히 분리된 파일이다 — VC/PE 라벨을 한 파일에서 관리하면 한쪽 문구
 * 수정이 다른 쪽 화면에 실수로 영향을 줄 수 있다(ma-team-access.ts와 같은
 * 분리 이유). */
import type { MaDealType, MaDealStatus, MaAdjustmentStatus, MaDocumentType, MaFinancialSourceType } from "@prisma/client";
import type { ReadinessState, PEDecisionDomainKey } from "./pe-decision-readiness";
import type { PEDDCategory, PEDDSeverity, PEDDFindingStatus } from "./dd-types";
import type { PEThesisStatus, PEThesisBreakerState, PEICQuestionPriority, PEICProcessState } from "./pe-ic-decision-types";
import type { PEICReviewItemType, PEICReviewItemStatus, PEEvidenceRequestStatus, PEICReviewState } from "./pe-ic-review-types";

export const MA_DEAL_TYPE_LABEL: Record<MaDealType, string> = {
  BUYOUT: "바이아웃",
  GROWTH_EQUITY: "그로스에쿼티",
  CARVE_OUT: "카브아웃",
  MBO: "경영진 인수(MBO)",
  SECONDARY: "세컨더리",
  MINORITY: "소수지분",
};

export const MA_DEAL_STATUS_LABEL: Record<MaDealStatus, string> = {
  ACTIVE: "진행 중",
  ARCHIVED: "보관됨",
};

export const MA_ADJUSTMENT_STATUS_LABEL: Record<MaAdjustmentStatus, string> = {
  DRAFT: "초안",
  PROPOSED: "제안됨",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
};

/** pe-decision-readiness.ts의 ReadinessState(PR #103) — 상태 이름은 엔진이
 * 반환하는 값 그대로 쓰고, 여기서는 한글 라벨만 붙인다(새 상태를 만들지
 * 않음). "좋은/나쁜 투자"가 아니라 "데이터 준비 상태"를 뜻한다. */
export const READINESS_STATE_LABEL: Record<ReadinessState, string> = {
  READY: "준비됨",
  PARTIAL: "부분 준비",
  MISSING: "정보 없음",
  NOT_STARTED: "시작 전",
  BLOCKED: "차단됨(모순 확인 필요)",
};

/** pe-decision-readiness.ts의 PE_DECISION_DOMAINS(PR #103) — 도메인 키 → 한글 라벨 */
export const PE_DECISION_DOMAIN_LABEL: Record<PEDecisionDomainKey, string> = {
  FINANCIAL: "재무",
  QOE: "QoE",
  LBO: "LBO",
  DD: "실사(DD)",
  EVIDENCE: "근거 추적",
  COMMERCIAL: "상업 데이터",
  DART: "DART 공시",
};

/** MADocument.type(PR #106 Data Room에서 처음 사용) */
export const MA_DOCUMENT_TYPE_LABEL: Record<MaDocumentType, string> = {
  MANAGEMENT_ACCOUNTS: "경영 자료",
  DD_MATERIAL: "실사 자료",
  FINANCIAL_MODEL: "재무 모델",
  CONTRACT: "계약서",
  OTHER: "기타",
};

/** MAFinancialLineItem.source / PEEvidence.sourceType 공용(financial-types.ts, PR-B) */
export const MA_FINANCIAL_SOURCE_LABEL: Record<MaFinancialSourceType, string> = {
  UPLOADED_DOCUMENT: "업로드 문서",
  EXCEL: "엑셀",
  DART: "DART",
  MANUAL: "수기 입력",
};

/** dd-types.ts PE_DD_CATEGORIES(PR-G, IC 워크스페이스에서 처음 사용, PR #107) */
export const PE_DD_CATEGORY_LABEL: Record<PEDDCategory, string> = {
  FINANCIAL: "재무",
  COMMERCIAL: "상업",
  OPERATIONAL: "운영",
  LEGAL: "법무",
  TAX: "세무",
  HR: "인사",
  TECHNOLOGY: "기술",
  IT_SECURITY: "IT 보안",
  REGULATORY: "규제",
  ESG: "ESG",
  MANAGEMENT: "경영진",
  OTHER: "기타",
};

/** dd-types.ts PE_DD_SEVERITIES(PR-G, PR #107) — "투자 찬반"이 아니라 문제의 심각도 */
export const PE_DD_SEVERITY_LABEL: Record<PEDDSeverity, string> = {
  CRITICAL: "치명적",
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
  INFO: "참고",
};

/** dd-types.ts PE_DD_FINDING_STATUSES(PR-G, PR #107) */
export const PE_DD_FINDING_STATUS_LABEL: Record<PEDDFindingStatus, string> = {
  DRAFT: "초안",
  IN_REVIEW: "검토 중",
  CONFIRMED: "확인됨",
  MITIGATED: "완화됨",
  ACCEPTED: "수용됨",
  REJECTED: "기각됨",
  CLOSED: "종결됨",
};

/** pe-ic-decision-types.ts PEICProcessState(PR #108) — "투자해야 하는가"가
 * 아니라 "IC가 지금 검토할 준비가 됐는가"라는 프로세스 상태다. */
export const PE_IC_PROCESS_STATE_LABEL: Record<PEICProcessState, string> = {
  READY_FOR_IC: "IC 검토 가능",
  PARTIALLY_READY: "부분적으로 준비됨",
  NOT_READY: "아직 준비 안 됨",
  BLOCKED: "데이터 모순으로 차단됨",
};

/** pe-ic-decision-types.ts PEThesisStatus(PR #108) */
export const PE_THESIS_STATUS_LABEL: Record<PEThesisStatus, string> = {
  SUPPORTED: "근거 있음",
  PARTIALLY_SUPPORTED: "부분적으로 뒷받침됨",
  UNSUPPORTED: "근거 없음",
  CONTRADICTED: "상충하는 데이터 있음",
};

/** pe-ic-decision-types.ts PEThesisBreakerState(PR #108) */
export const PE_THESIS_BREAKER_STATE_LABEL: Record<PEThesisBreakerState, string> = {
  OPEN: "미해결",
  MITIGATED: "완화됨",
  ACCEPTED: "수용됨",
  CANNOT_BE_ESTABLISHED: "현재 확인 불가",
};

/** pe-ic-decision-types.ts PEICQuestionPriority(PR #108) */
export const PE_IC_QUESTION_PRIORITY_LABEL: Record<PEICQuestionPriority, string> = {
  P0: "P0 · 즉시 확인 필요",
  P1: "P1 · 중요",
  P2: "P2 · 참고",
};

/** pe-ic-review-types.ts PEICReviewItemType(PR #109) — ICQuestion을 워크플로
 * 관점으로 재분류한 8종 카테고리. 새 판단이 아니라 표시용 라벨만 붙인다. */
export const PE_IC_REVIEW_ITEM_TYPE_LABEL: Record<PEICReviewItemType, string> = {
  BLOCKER: "모순/차단",
  MISSING_INFORMATION: "정보 누락",
  IC_QUESTION: "IC 질문",
  DD_FOLLOWUP: "DD 후속조치",
  FINANCIAL_RECONCILIATION: "재무 데이터 대사",
  QOE_FOLLOWUP: "QoE 후속조치",
  LBO_ASSUMPTION: "LBO 가정",
  EVIDENCE_GAP: "근거 공백",
};

/** pe-ic-review-types.ts PEICReviewItemStatus(PR #109) — RESOLVED는 canonical
 * 조건이 실제로 사라졌을 때만 나온다(pe-ic-resolution.ts 주석 참고). */
export const PE_IC_REVIEW_ITEM_STATUS_LABEL: Record<PEICReviewItemStatus, string> = {
  OPEN: "미착수",
  IN_REVIEW: "검토 중",
  WAITING_FOR_EVIDENCE: "근거 대기",
  EVIDENCE_RECEIVED: "근거 접수됨",
  RESOLVED: "해소됨",
  REJECTED: "기각됨",
};

/** pe-ic-review-types.ts PEEvidenceRequestStatus(PR #109) */
export const PE_EVIDENCE_REQUEST_STATUS_LABEL: Record<PEEvidenceRequestStatus, string> = {
  REQUESTED: "요청함",
  RECEIVED: "자료 접수됨",
  UNDER_REVIEW: "검토 중",
  ACCEPTED: "승인됨",
  REJECTED: "반려됨",
};

/** pe-ic-review-types.ts PEICReviewState(PR #109) — buildPEICDecision().processState를
 * 그대로 옮긴 값이다(재판정 없음, PE_IC_PROCESS_STATE_LABEL과 동일 의미). */
export const PE_IC_REVIEW_STATE_LABEL: Record<PEICReviewState, string> = {
  READY_FOR_IC: "IC 검토 가능",
  PARTIALLY_READY: "부분적으로 준비됨",
  NOT_READY: "아직 준비 안 됨",
  BLOCKED: "데이터 모순으로 차단됨",
};
