/**
 * 팀 협업 접근 범위.
 *
 * 딜과 양식은 `teamId`가 설정되면 팀 전체가 볼 수 있다.
 * 조회는 "내 것 + 팀에 공유된 것", 삭제 같은 파괴적 작업은 소유자만 가능하다.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export interface AccessScope {
  userId: string;
  teamId: string | null;
}

export async function getAccessScope(userId: string): Promise<AccessScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });
  return { userId, teamId: user?.teamId ?? null };
}

/** 내 소유이거나 내 팀에 공유된 리소스 (Deal·Template 공용 where 조각) */
export function ownedOrShared(scope: AccessScope) {
  if (!scope.teamId) return { userId: scope.userId };
  return { OR: [{ userId: scope.userId }, { teamId: scope.teamId }] };
}

/** Report처럼 deal을 통해 접근하는 리소스용 where 조각 */
export async function dealScope(userId: string) {
  return { deal: ownedOrShared(await getAccessScope(userId)) };
}

export const INVITE_TTL_DAYS = 14;

export function generateInviteCode(): string {
  return randomBytes(9).toString("base64url").toUpperCase();
}

export function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
