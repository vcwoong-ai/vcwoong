/** MADeal(PE 트랙) enum → 한글 라벨. deal-labels.ts(VC)와 동일한 성격이지만
 * 완전히 분리된 파일이다 — VC/PE 라벨을 한 파일에서 관리하면 한쪽 문구
 * 수정이 다른 쪽 화면에 실수로 영향을 줄 수 있다(ma-team-access.ts와 같은
 * 분리 이유). */
import type { MaDealType, MaDealStatus, MaAdjustmentStatus } from "@prisma/client";
import type { ReadinessState, PEDecisionDomainKey } from "./pe-decision-readiness";

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
