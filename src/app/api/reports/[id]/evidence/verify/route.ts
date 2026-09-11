import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { traceReportEvidence } from "@/lib/evidence";
import { verifyClaimsWithAI, verdictsToMap, mergeVerdicts } from "@/lib/evidence-ai";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getUserTeamContext,
  reportWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

// deterministic 매칭이 UNSUPPORTED로 남긴 claim 중 최대 5개만 AI로 재확인한다
// (evidence-ai.ts의 verifyClaimsWithAI와 동일한 상한). AI 호출 라우트라
// Hobby 플랜 기본 실행시간(10초)으로는 부족해 다른 AI 호출 라우트와 같이
// 60초로 맞춰둔다.
export const maxDuration = 60;

/**
 * POST /api/reports/[id]/evidence/verify
 * 근거를 못 찾은 claim만 골라 AI로 재확인하고, 결과를 캐시(ReportEvidenceCheck)에
 * 저장한다. 이후 GET /evidence는 이 캐시를 읽기만 하므로 재호출 시 AI 비용이
 * 다시 나가지 않는다.
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
      sections: { orderBy: { order: "asc" } },
      deal: {
        include: {
          documents: { select: { id: true, name: true, parsedText: true } },
        },
      },
      evidenceCheck: { select: { verdicts: true } },
    },
  });

  if (!report) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  const rate = await checkRateLimit(
    `evidence-verify:${session.user.id}`,
    RATE_LIMITS.evidenceVerify.limit,
    RATE_LIMITS.evidenceVerify.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "근거 AI 검증 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const existingVerdicts = verdictsToMap(report.evidenceCheck?.verdicts);
  const before = traceReportEvidence(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
    report.deal.documents,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation },
    existingVerdicts
  );

  const unsupported = before.claims.filter((c) => c.confidence === "UNSUPPORTED");
  if (unsupported.length === 0) {
    return NextResponse.json({ data: before });
  }

  const fresh = await verifyClaimsWithAI(
    unsupported,
    report.deal.documents,
    5
  );
  const merged = mergeVerdicts(report.evidenceCheck?.verdicts, fresh);

  await prisma.reportEvidenceCheck.upsert({
    where: { reportId: report.id },
    create: {
      reportId: report.id,
      verdicts: merged as unknown as import("@prisma/client").Prisma.InputJsonValue,
      modelUsed: "ai_semantic",
    },
    update: {
      verdicts: merged as unknown as import("@prisma/client").Prisma.InputJsonValue,
      modelUsed: "ai_semantic",
    },
  });

  const after = traceReportEvidence(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
    report.deal.documents,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation },
    verdictsToMap(merged)
  );

  return NextResponse.json({
    data: { ...after, documentCount: report.deal.documents.length, checkedNow: fresh.length },
  });
}
