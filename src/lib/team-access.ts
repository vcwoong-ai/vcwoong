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
  accountRole: UserRole | string;
  isTeamOwner: boolean;
}

/** ADMIN·PARTNER만 공유 리소스 편집 가능 */
export function canEditShared(role: string): boolean {
  return role === "ADMIN" || role === "PARTNER";
}

export function canManageTeam(role: string, isTeamOwner = false): boolean {
  return isTeamOwner || canEditShared(role);
}

/** 팀 관리 mutation은 같은 팀 행을 잠근 뒤 현재 소속/역할을 다시 읽는다. */
export async function lockTeamManagementContext(tx: Prisma.TransactionClient, userId: string, teamId: string) {
  const locked = await tx.team.updateMany({ where: { id: teamId }, data: { updatedAt: new Date() } });
  if (locked.count !== 1) return null;
  const [team, user] = await Promise.all([
    tx.team.findUnique({ where: { id: teamId }, select: { ownerUserId: true } }),
    tx.user.findFirst({ where: { id: userId, teamId }, select: { role: true, teamRole: true } }),
  ]);
  if (!team || !user) return null;
  return { ownerUserId: team.ownerUserId, isTeamOwner: team.ownerUserId === userId, role: user.teamRole ?? user.role };
}

export async function getUserTeamContext(userId: string): Promise<TeamContext> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      teamRole: true,
      teamId: true,
      team: { select: { id: true, name: true, ownerUserId: true } },
    },
  });

  const isTeamOwner = !!user?.teamId && user.team?.ownerUserId === userId;
  const accountRole = user?.role ?? "ANALYST";
  const teamRole = user?.teamRole ?? accountRole;
  return {
    teamId: user?.teamId ?? null,
    teamName: user?.team?.name ?? null,
    // 소유자의 권한은 현재 팀에만 적용되며 계정/JWT의 전역 역할은 바꾸지 않는다.
    role: isTeamOwner && teamRole === "ANALYST" ? "PARTNER" : teamRole,
    accountRole,
    isTeamOwner,
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

export function reportWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.ReportWhereInput {
  return { deal: dealWriteWhere(userId, teamId, role) };
}

/**
 * 본인 소유이거나 (팀 공유 + 편집 역할)이면 true.
 * UI에서 버튼 비활성화용.
 */
export function canEditResource(opts: {
  ownerUserId: string;
  resourceTeamId: string | null;
  currentUserId: string;
  currentTeamId: string | null;
  role: string;
}): boolean {
  if (opts.ownerUserId === opts.currentUserId) return true;
  if (
    opts.resourceTeamId &&
    opts.currentTeamId &&
    opts.resourceTeamId === opts.currentTeamId &&
    canEditShared(opts.role)
  ) {
    return true;
  }
  return false;
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

export function fundReadWhere(
  userId: string,
  teamId: string | null
): Prisma.FundWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function fundWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.FundWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function fundOwnerWhere(userId: string): Prisma.FundWhereInput {
  return { userId };
}

export function portfolioReadWhere(
  userId: string,
  teamId: string | null
): Prisma.PortfolioCompanyWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function portfolioWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.PortfolioCompanyWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function portfolioOwnerWhere(userId: string): Prisma.PortfolioCompanyWhereInput {
  return { userId };
}

export function inboundReadWhere(
  userId: string,
  teamId: string | null
): Prisma.InboundDealWhereInput {
  if (teamId) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function inboundWriteWhere(
  userId: string,
  teamId: string | null,
  role: string
): Prisma.InboundDealWhereInput {
  if (teamId && canEditShared(role)) {
    return { OR: [{ userId }, { teamId }] };
  }
  return { userId };
}

export function inboundOwnerWhere(userId: string): Prisma.InboundDealWhereInput {
  return { userId };
}

/** LP 리포트는 펀드 소유/공유를 따른다 */
export function lpReportReadWhere(
  userId: string,
  teamId: string | null
): Prisma.LpReportWhereInput {
  return { fund: fundReadWhere(userId, teamId) };
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
