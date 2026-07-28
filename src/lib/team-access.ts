/**
 * 팀 협업 접근 제어.
 * teamId가 설정된 딜·양식은 같은 팀 구성원이 조회·편집할 수 있다.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface TeamContext {
  teamId: string | null;
  teamName: string | null;
  role: string;
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

/** 쓰기·삭제는 소유자만 (팀원은 공유된 리소스 편집 가능) */
export function dealWriteWhere(
  userId: string,
  teamId: string | null
): Prisma.DealWhereInput {
  return dealReadWhere(userId, teamId);
}

export function templateWriteWhere(
  userId: string,
  teamId: string | null
): Prisma.TemplateWhereInput {
  return templateReadWhere(userId, teamId);
}
