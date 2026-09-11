import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toIcQuestionsResult, type IcQuestion } from "@/lib/ic-questions";
import { getUserTeamContext, reportReadWhere } from "@/lib/team-access";

/**
 * 저장된 IC 질문 결과만 읽는다 — AI 호출 없음. /generate가 먼저 실행돼
 * 캐시(ReportIcQuestions)가 있어야 값이 있고, 없으면 data: null을 돌려준다
 * (UI가 "아직 생성 전" 상태로 안내).
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
    select: { icQuestions: { select: { questions: true, modelUsed: true } } },
  });

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!report.icQuestions) {
    return NextResponse.json({ data: null });
  }

  const questions = report.icQuestions.questions as unknown as IcQuestion[];
  return NextResponse.json({
    data: toIcQuestionsResult(questions, report.icQuestions.modelUsed),
  });
}
