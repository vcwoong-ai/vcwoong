import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDealScore } from "@/lib/deal-scoring";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  dealReadWhere,
  dealWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

/** 저장된 최신 점수만 조회 (AI 호출 없음, 무료) */
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
    select: { score: true },
  });

  if (!deal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: deal.score });
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
      documents: { select: { name: true, parsedText: true } },
      reports: {
        where: { status: { in: ["DRAFT", "FINAL"] } },
        orderBy: { generatedAt: "desc" },
        take: 1,
        include: { sections: { select: { content: true } } },
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
    },
  });

  return NextResponse.json({ data: saved });
}
