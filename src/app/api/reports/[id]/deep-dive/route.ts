import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runDeepDive } from "@/lib/deep-dive";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  reportReadWhere,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

/** 저장된 최신 딥다이브 결과만 조회 (검색·AI 호출 없음, 무료) */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportReadWhere(session.user.id, teamId) },
    select: { deepDive: true },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: report.deepDive });
}

/** 새로 검증(또는 재검증) — 주장당 검색 1~2회 + AI 호출 1회 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportWriteWhere(session.user.id, teamId, role) },
    include: {
      sections: { orderBy: { order: "asc" } },
      deal: { select: { companyName: true } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
  }

  const rate = await checkRateLimit(
    `deep-dive:${session.user.id}`,
    RATE_LIMITS.deepDive.limit,
    RATE_LIMITS.deepDive.windowMs
  );
  if (!rate.allowed) {
    // 얼마나 기다려야 하는지 안 알려주면 사용자는 계속 누르게 된다.
    // 딥다이브는 1회에 AI를 최대 5번 부르는 비싼 작업이라 한도 자체는
    // 유지하되, 남은 시간을 분 단위로 알려준다.
    const mins = Math.ceil(rate.retryAfterSec / 60);
    return NextResponse.json(
      {
        error: `딥다이브 요청 한도를 모두 썼습니다 (시간당 ${RATE_LIMITS.deepDive.limit}회). 약 ${mins}분 후 다시 시도해 주세요.`,
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const result = await runDeepDive({
    companyName: report.deal.companyName,
    sections: report.sections.map((s) => ({
      sectionKey: s.sectionKey,
      content: s.content,
    })),
  });

  const saved = await prisma.reportDeepDive.upsert({
    where: { reportId: report.id },
    create: {
      reportId: report.id,
      claims: result.claims as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
    },
    update: {
      claims: result.claims as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
    },
  });

  return NextResponse.json({ data: saved });
}
