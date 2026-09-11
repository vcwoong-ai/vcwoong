import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { evaluateReport } from "@/lib/report-quality";
import { extractSharedFacts } from "@/lib/shared-facts";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const DEFAULT_MAX_SECTIONS = 3;
const DEFAULT_SCORE_THRESHOLD = 70;

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

/**
 * GET /api/reports/[id]/improve-weak
 *
 * 품질 점수가 낮은 섹션 "목록"만 계산해서 돌려준다 — AI 호출 없음(순수
 * evaluateReport 계산).
 *
 * 예전엔 이 라우트가 POST로 최대 5개 섹션을 한 HTTP 요청 안에서 순차로
 * AI 재생성까지 했다. 섹션 하나의 AI 호출 예산(AI_CALL_BUDGET_MS,
 * 기본 40초)만으로도 2개면 이미 함수 실행시간 상한(Hobby maxDuration=60초)을
 * 넘길 수 있어, 실제 프로덕션에서 FUNCTION_INVOCATION_TIMEOUT으로 죽는
 * 사고가 났다 — 그렇게 죽으면 응답 body가 비거나 JSON이 아닌 채로 끊기고,
 * 프론트가 조건 없이 response.json()을 불러 "Unexpected end of JSON
 * input"이 사용자에게 그대로 노출됐다.
 *
 * 지금은 이 라우트가 "무엇을 개선해야 하는지"만 계산한다 — AI 호출이
 * 없으니 quota/rate-limit도 필요 없다(비용은 실제 재생성 쪽에서만 든다).
 * 실제 개선(AI 재생성)은 프론트가 이 목록을 받아, 이미 존재하는 단일 섹션
 * 라우트(POST /api/reports/[id]/sections/regenerate)를 대상 섹션마다 한
 * 번씩 순차 호출해서 수행한다 — 요청 하나당 AI 호출이 정확히 1번이라
 * 기존 단일 섹션 재생성과 동일한 안전한 시간 예산 안에서 항상 끝난다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const maxSections = clampInt(
    searchParams.get("maxSections"),
    1,
    5,
    DEFAULT_MAX_SECTIONS
  );
  const scoreThreshold = clampInt(
    searchParams.get("scoreThreshold"),
    0,
    100,
    DEFAULT_SCORE_THRESHOLD
  );

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const report = await prisma.report.findFirst({
    where: { id: params.id, ...reportWriteWhere(session.user.id, teamId, role) },
    include: {
      deal: {
        include: {
          documents: { select: { name: true, parsedText: true } },
        },
      },
      sections: { orderBy: { order: "asc" } },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  if (!report.sections.length) {
    return NextResponse.json(
      { error: "개선할 섹션이 없습니다" },
      { status: 400 }
    );
  }

  const deal = report.deal;
  const facts = extractSharedFacts({
    companyName: deal.companyName,
    sector: deal.sector,
    investRound: deal.investRound ?? undefined,
    investAmount: deal.investAmount ?? undefined,
    valuation: deal.valuation ?? undefined,
    documents: deal.documents,
  });

  const summary = evaluateReport(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
    {
      investAmount: facts.investAmount,
      valuation: facts.valuation,
      metrics: facts.metrics,
      terms: facts.terms,
      clinicalPhase: facts.clinicalPhase,
    }
  );

  const titleBySectionKey = new Map(
    report.sections.map((s) => [s.sectionKey as string, s.title])
  );

  const targets = [...summary.sections]
    .filter((s) => s.score < scoreThreshold)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxSections)
    .map((s) => ({
      sectionKey: s.sectionKey,
      title: titleBySectionKey.get(s.sectionKey) ?? s.sectionKey,
      score: s.score,
      issues: s.issues,
      warnings: s.warnings,
    }));

  return NextResponse.json({
    data: {
      targets,
      beforeScore: summary.overallScore,
      scoreThreshold,
    },
  });
}
