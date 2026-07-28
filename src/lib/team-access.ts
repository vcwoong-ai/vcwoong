/**
 * 팀 협업 접근 제어.
 *
 * 역할 정책:
 * - READ: 본인 소유 또는 팀 공유 리소스 → 전원
 * - EDIT: 본인 소유, 또는 팀 공유 + ADMIN/PARTNER
 * - DELETE / SHARE: 본인 소유만
 * - ANALYST: 공유 리소스 조회만 (편집 불가)
 */

import { prisma } from "@/lib/prisma";
import type { Prisma, UserRole } from "@prisma/client";

export interface TeamContext {
  teamId: string | null;
  teamName: string | null;
  role: UserRole | string;
}

/** ADMIN·PARTNER만 공유 리소스 편집 가능 */
export function canEditShared(role: string): boolean {
  return role === "ADMIN" || role === "PARTNER";
}

export function canManageTeam(role: string): boolean {
  return canEditShared(role);
}

export async function getUserTeamContext(userId: string): Promise<TeamContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      teamId: true,
      team: { select: { id: true, name: true } },
    },
  });

  return {
    teamId: user?.teamId ?? null,
    teamName: user?.team?.name ?? null,
    role: user?.role ?? "ANALYST",
  };
}

/** 본인 소유 또는 팀 공유 리소스 */
export function dealReadWhere(
  userId: string,
  teamId: string | null
): Prisma.DealWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function templateReadWhere(
  userId: string,
  teamId: string | null
): Prisma.TemplateWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function reportReadWhere(
  userId: string,
  teamId: string | null
): Prisma.ReportWhereInput {
  return { deal: dealReadWhere(userId, teamId) };
}

/**
 * 편집 가능 범위.
 * - 본인 소유: 항상
 * - 팀 공유: ADMIN/PARTNER만
 */
export function dealWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.DealWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function templateWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.TemplateWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

/** 소유자만 (삭제·공유 토글) */
export function dealOwnerWhere(userId: string): Prisma.DealWhereInput {
  return { userId };
}

export function templateOwnerWhere(userId: string): Prisma.TemplateWhereInput {
  return { userId };
}

export function permissionDeniedMessage(action: "edit" | "delete" | "share"): string {
  switch (action) {
    case "edit":
      return "편집 권한이 없습니다. 팀 공유 리소스는 파트너·관리자만 수정할 수 있습니다.";
    case "delete":
      return "삭제 권한이 없습니다. 소유자만 삭제할 수 있습니다.";
    case "share":
      return "공유 설정은 소유자만 변경할 수 있습니다.";
  }
}
