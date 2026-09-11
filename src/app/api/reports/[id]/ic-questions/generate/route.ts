import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeterministicIcQuestions, toIcQuestionsResult } from "@/lib/ic-questions";
import { refineIcQuestionsWithAI } from "@/lib/ic-questions-ai";
import type { ScoreEvidenceAssessment } from "@/lib/deal-scoring-evidence";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

// 후보 도출(Risk Flag/Evidence/Score) 자체는 전부 결정적이라 AI 호출이 없고,
// 문장 다듬기만 배치 1회 호출한다 — 그래도 AI 호출 라우트라 다른 라우트와
// 동일하게 60초로 맞춰둔다(Hobby 플랜 기본 10초로는 부족할 수 있음).
export const maxDuration = 60;

/**
 * POST /api/reports/[id]/ic-questions/generate
 * DealScore.evidenceAssessment(Phase 4, 이미 계산돼 저장돼 있음)만 갖고
 * IC 질문 후보를 결정적으로 뽑고, 문장만 배치 1회 AI로 다듬는다(실패해도
 * deterministic 문장 그대로 반환). 결과는 ReportIcQuestions에 upsert해서
 * GET이 재호출 없이 읽을 수 있게 한다.
 *
 * 리포트 생성 파이프라인(/reports/[id]/run)과는 별도 호출이라 그 타임아웃
 * 문제(Phase 1)를 재현하지 않는다 — 사용자가 필요할 때만 누르는 버튼.
 */
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
      deal: {
        select: {
          investAmount: true,
          valuation: true,
          score: { select: { rationale: true, evidenceAssessment: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  if (!report.deal.score?.evidenceAssessment) {
    return NextResponse.json(
      { error: "먼저 딜 스코어를 계산해야 IC 질문을 생성할 수 있습니다." },
      { status: 400 }
    );
  }

  const rate = await checkRateLimit(
    `ic-questions:${session.user.id}`,
    RATE_LIMITS.icQuestions.limit,
    RATE_LIMITS.icQuestions.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "IC 질문 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const assessment = report.deal.score
    .evidenceAssessment as unknown as ScoreEvidenceAssessment;
  const rationale = (report.deal.score.rationale ?? {}) as unknown as Partial<
    Record<ScoreDimensionKey, string>
  >;

  const deterministic = buildDeterministicIcQuestions(rationale, assessment, {
    investAmount: report.deal.investAmount,
    valuation: report.deal.valuation,
  });

  const refined = await refineIcQuestionsWithAI(deterministic);
  const modelUsed = refined.some((q) => q.source === "ai_refined")
    ? "ai_refined"
    : "deterministic";

  await prisma.reportIcQuestions.upsert({
    where: { reportId: report.id },
    create: {
      reportId: report.id,
      questions: refined as unknown as import("@prisma/client").Prisma.InputJsonValue,
      modelUsed,
    },
    update: {
      questions: refined as unknown as import("@prisma/client").Prisma.InputJsonValue,
      modelUsed,
    },
  });

  return NextResponse.json({ data: toIcQuestionsResult(refined, modelUsed) });
}
