/**
 * PE 트랙(MADeal) 팀 협업 접근 제어.
 *
 * team-access.ts의 dealReadWhere/dealWriteWhere/dealOwnerWhere와 동일한
 * 패턴을 MADeal에 그대로 복제한다 — team-access.ts 자체는 수정하지 않는다
 * (VC와 PE가 같은 파일을 공유하면 한쪽 변경이 다른 쪽에 영향을 줄 수 있어
 * 완전히 분리했다. PE Track Phase 2 Blueprint §15, PR-A 구현 명세 §8 참고).
 *
 * 역할 정책은 team-access.ts와 동일:
 * - READ: 본인 소유 또는 팀 공유 리소스 → 전원
 * - WRITE: 본인 소유, 또는 팀 공유 + ADMIN/PARTNER
 * - DELETE(소프트: status=ARCHIVED로만 처리, 하드 삭제 API 없음): 본인 소유만
 * - ANALYST: 공유 리소스 조회만(편집 불가)
 *
 * MADealMember(DD Reviewer/External Advisor 같은 딜 단위 세분화 권한)는
 * 이번 PR 범위가 아니다 — 실제 DD 대상이 생기는 PR에서 별도 설계한다.
 */

import type { Prisma } from "@prisma/client";
import { canEditShared } from "@/lib/team-access";

/** 본인 소유 또는 팀 공유 MADeal */
export function maDealReadWhere(
  userId: string,
  teamId: string | null
): Prisma.MADealWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

/**
 * 편집 가능 범위.
 * - 본인 소유: 항상
 * - 팀 공유: ADMIN/PARTNER만(team-access.ts의 canEditShared 재사용)
 */
export function maDealWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.MADealWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

/** 소유자만 */
export function maDealOwnerWhere(userId: string): Prisma.MADealWhereInput {
  return { userId };
}
