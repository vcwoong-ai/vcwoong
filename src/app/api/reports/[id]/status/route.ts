import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProgress } from "@/lib/generation-progress";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { SECTION_META } from "@/types";

/**
 * 생성 진행 상태 조회 (짧은 폴링용).
 *
 * SSE(/progress)는 함수를 수백 초 열어두는 구조라 서버리스에서 연결이 쉽게
 * 끊기고, 한 번 끊기면 화면이 곧장 실패로 보였다. 이 라우트는 매 요청이
 * 즉시 끝나므로 훨씬 안정적이다.
 *
 * 진행 상태는 in-memory에 있으면 그걸 쓰고(현재 작업 중인 섹션명 포함),
 * 없으면 DB에 저장된 섹션 수로 계산한다. 섹션은 완성 즉시 저장되므로
 * 다른 함수 인스턴스에서도 실제 진행률을 볼 수 있다.
 */
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
    select: {
      status: true,
      updatedAt: true,
      _count: { select: { sections: true } },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: "보고서를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const total = SECTION_META.length;
  const memory = getProgress(params.id);
  const completed = Math.max(report._count.sections, memory?.completed ?? 0);

  // 생성이 끝났는지는 DB 상태가 기준 — in-memory는 인스턴스마다 다를 수 있다.
  const isGenerating = report.status === "GENERATING";
  const done = !isGenerating && report._count.sections > 0;

  return NextResponse.json({
    data: {
      status: done ? "completed" : isGenerating ? "generating" : "error",
      completed,
      total,
      currentSection: memory?.currentSection ?? "AI 분석 진행 중",
      reportStatus: report.status,
      error:
        !isGenerating && report._count.sections === 0
          ? "생성된 섹션이 없습니다. 다시 시도해 주세요."
          : undefined,
    },
  });
}
