import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus } from "@prisma/client";
import { generateSectionsAsync } from "@/lib/report-generation";
import { checkQuota } from "@/lib/quotas";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

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
    where: {
      id: params.id,
      ...reportWriteWhere(session.user.id, teamId, role),
    },
    include: {
      deal: {
        include: {
          documents: { select: { name: true, parsedText: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
  }

  if (report.status === ReportStatus.GENERATING) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  if (report.deal.documents.length === 0) {
    return NextResponse.json(
      { error: "딜에 업로드된 문서가 없습니다. 먼저 IR 자료를 업로드해 주세요." },
      { status: 400 }
    );
  }

  const quota = await checkQuota(session.user.id, "report");
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  // 동시 요청이 둘 다 통과하지 않도록 조건부 업데이트로 락을 건다
  const claimed = await prisma.report.updateMany({
    where: { id: report.id, status: { not: ReportStatus.GENERATING } },
    data: { status: ReportStatus.GENERATING },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  // 응답을 먼저 보낸 뒤에도 Vercel이 함수를 바로 얼리지 않도록 생성 작업의
  // 수명을 연장한다. waitUntil 없이 fire-and-forget으로 두면 서버리스
  // 인스턴스가 응답 직후 정지되면서 생성이 중간에 끊길 수 있다.
  waitUntil(
    generateSectionsAsync(
      report.id,
      report.deal,
      report.agentType,
      undefined,
      session.user.id
    ).catch((err) => console.error("generateSectionsAsync failed:", err))
  );

  return NextResponse.json({ data: { id: report.id, status: "GENERATING" } });
}
