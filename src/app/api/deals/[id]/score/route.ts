import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDealScore, computeSectorStageBenchmark } from "@/lib/deal-scoring";
import { SCORE_DIMENSIONS } from "@/lib/deal-scoring-shared";
import { traceReportEvidence } from "@/lib/evidence";
import { verdictsToMap } from "@/lib/evidence-ai";
import { buildScoreEvidenceAssessment } from "@/lib/deal-scoring-evidence";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  dealReadWhere,
  dealWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

// POST가 AI를 호출한다(GET은 저장된 값만 읽어 호출 없음) — 기본 함수
// 실행시간(플랫폼 기본값, Hobby 플랜은 10초)로는 부족해 다른 AI 호출
// 라우트와 동일하게 60초로 맞춰둔다.
export const maxDuration = 60;

/** 동일 섹터/스테이지 벤치마크에 필요한 최소 비교 대상 (deal-scoring-shared.ts와 동일 철학) */
const BENCHMARK_CANDIDATE_LIMIT = 200;

/**
 * 저장된 최신 점수 + (가능하면) 동일 섹터/스테이지 벤치마크를 조회한다.
 * 벤치마크는 이 계정(본인+팀 공유)이 실제로 채점한 딜만 비교 대상으로
 * 쓴다 — 외부 데이터 없음, AI 호출 없음.
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
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealReadWhere(session.user.id, teamId) },
    select: { score: true, sector: true, stage: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!deal.score) {
    return NextResponse.json({ data: null });
  }

  const comparables = await prisma.deal.findMany({
    where: {
      id: { not: params.id },
      sector: deal.sector,
      stage: deal.stage,
      ...dealReadWhere(session.user.id, teamId),
      score: { isNot: null },
    },
    select: { score: { select: { overall: true } } },
    take: BENCHMARK_CANDIDATE_LIMIT,
  });
  const comparableOveralls = comparables
    .map((d) => d.score?.overall)
    .filter((n): n is number => typeof n === "number");
  const benchmark = computeSectorStageBenchmark(deal.score.overall, comparableOveralls);

  return NextResponse.json({ data: deal.score, benchmark });
}

/** 새로 계산(또는 재계산) — AI 호출 1회 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealWriteWhere(session.user.id, teamId, role) },
    include: {
      documents: { select: { id: true, name: true, parsedText: true } },
      reports: {
        where: { status: { in: ["DRAFT", "FINAL"] } },
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: {
          sections: { select: { sectionKey: true, content: true } },
          evidenceCheck: { select: { verdicts: true } },
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: permissionDeniedMessage("edit") }, { status: 403 });
  }

  const rate = await checkRateLimit(
    `deal-score:${session.user.id}`,
    RATE_LIMITS.dealScoring.limit,
    RATE_LIMITS.dealScoring.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "스코어링 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const latestReport = deal.reports[0];
  const reportContent = latestReport?.sections
    .map((s) => s.content)
    .join("\n\n");
  const documentsText = deal.documents
    .map((d) => d.parsedText ?? "")
    .filter(Boolean)
    .join("\n\n");

  if (!reportContent && !documentsText) {
    return NextResponse.json(
      { error: "채점할 자료가 없습니다. 문서를 업로드하거나 보고서를 먼저 생성해 주세요." },
      { status: 400 }
    );
  }

  const result = await generateDealScore({
    companyName: deal.companyName,
    sector: deal.sector,
    stage: deal.stage,
    investRound: deal.investRound ?? undefined,
    investAmount: deal.investAmount ?? undefined,
    valuation: deal.valuation ?? undefined,
    reportContent,
    documentsText,
  });

  // Phase 3 Evidence Engine과 연결 — 새 AI 호출 없이, 이미 결정적으로 계산
  // 가능한 evidence.ts를 재사용한다. 보고서가 없으면(문서 원문만으로 채점)
  // claim에 sectionKey가 없어 근거 매핑 자체가 불가능하므로, 억지로 만들지
  // 않고 "no_report"로 명시한다.
  const scores = Object.fromEntries(
    SCORE_DIMENSIONS.map(({ key }) => [key, result[key]])
  ) as Record<(typeof SCORE_DIMENSIONS)[number]["key"], number>;

  const evidenceAssessment = latestReport
    ? buildScoreEvidenceAssessment(
        scores,
        result.rationale,
        traceReportEvidence(
          latestReport.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
          deal.documents,
          { investAmount: deal.investAmount, valuation: deal.valuation },
          verdictsToMap(latestReport.evidenceCheck?.verdicts)
        ).claims,
        "report_evidence"
      )
    : buildScoreEvidenceAssessment(scores, result.rationale, [], "no_report");

  const saved = await prisma.dealScore.upsert({
    where: { dealId: deal.id },
    create: {
      dealId: deal.id,
      overall: result.overall,
      marketSize: result.marketSize,
      team: result.team,
      product: result.product,
      businessModel: result.businessModel,
      financials: result.financials,
      moat: result.moat,
      rationale: result.rationale,
      modelUsed: result.modelUsed,
      evidenceAssessment: evidenceAssessment as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
    update: {
      overall: result.overall,
      marketSize: result.marketSize,
      team: result.team,
      product: result.product,
      businessModel: result.businessModel,
      financials: result.financials,
      moat: result.moat,
      rationale: result.rationale,
      modelUsed: result.modelUsed,
      evidenceAssessment: evidenceAssessment as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ data: saved });
}
