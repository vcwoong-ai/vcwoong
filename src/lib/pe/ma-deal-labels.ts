/** MADeal(PE 트랙) enum → 한글 라벨. deal-labels.ts(VC)와 동일한 성격이지만
 * 완전히 분리된 파일이다 — VC/PE 라벨을 한 파일에서 관리하면 한쪽 문구
 * 수정이 다른 쪽 화면에 실수로 영향을 줄 수 있다(ma-team-access.ts와 같은
 * 분리 이유). */
import type { MaDealType, MaDealStatus, MaAdjustmentStatus } from "@prisma/client";

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
