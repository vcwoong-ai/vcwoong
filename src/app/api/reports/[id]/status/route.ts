import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";
import { SECTION_META } from "@/types";

/**
 * 생성 진행 상태 조회 (짧은 폴링용).
 *
 * SSE(/progress)는 함수를 수백 초 열어두는 구조라 서버리스에서 연결이 쉽게
 * 끊기고, 한 번 끊기면 화면이 곧장 실패로 보였다. 이 라우트는 매 요청이
 * 즉시 끝나므로 훨씬 안정적이다.
 *
 * 진행 상태는 전부 DB에서 읽는다(완성된 섹션 수 + 현재 생성 중인 섹션명) —
 * 두 값 모두 Report/ReportSection 테이블에 있어 어느 서버리스 인스턴스가
 * 요청을 받아도 같은 값을 본다.
 *
 * "완료" 판정은 report.generatedAt 유무만 본다 — 이 값은 report-generation.ts의
 * 성공 경로에서만 채워진다. status만으로 판단하면(예전 버전) 시간 초과로
 * 스스로 멈춘 "부분 생성" 상태(status가 GENERATING이 아니고 섹션이 1개 이상
 * 있는 상태)를 완료로 잘못 표시하는 버그가 있었다.
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
      generatedAt: true,
      currentSectionTitle: true,
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
  const completed = report._count.sections;
  const isGenerating = report.status === "GENERATING";
  const done = report.generatedAt != null;

  return NextResponse.json({
    data: {
      status: done ? "completed" : isGenerating ? "generating" : "error",
      completed,
      total,
      currentSection: report.currentSectionTitle ?? "AI 분석 진행 중",
      reportStatus: report.status,
      error:
        !isGenerating && !done
          ? completed > 0
            ? `시간이 초과되어 ${completed}/${total} 섹션까지 생성됐습니다. "다시 시도"를 누르면 이어서 생성합니다.`
            : "생성된 섹션이 없습니다. 다시 시도해 주세요."
          : undefined,
    },
  });
}
