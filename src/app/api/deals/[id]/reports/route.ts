import { NextRequest, NextResponse } from "next/server";
import { isAIConfigured, AIServiceUnavailableError } from "@/lib/claude";
import { waitUntil } from "@vercel/functions";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType, ReportStatus } from "@prisma/client";
import { inferAgentType } from "@/agents";
import {
  generateSectionsAsync,
  STALE_GENERATION_MS,
} from "@/lib/report-generation";
import { checkQuota } from "@/lib/quotas";
import { randomUUID } from "node:crypto";
import { activeGenerationWhere, staleGenerationWhere, GENERATION_LEASE_MS, publicGenerationReport } from "@/lib/report-generation-lease";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getUserTeamContext, dealWriteWhere, templateReadWhere, permissionDeniedMessage } from "@/lib/team-access";

const createReportSchema = z.object({
  agentType: z.nativeEnum(AgentType).optional(),
  additionalContext: z.string().optional(),
  templateId: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealWriteWhere(session.user.id, teamId, role) },
  });
  if (!deal) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  const reports = await prisma.report.findMany({
    where: { dealId: params.id },
    include: {
      sections: { orderBy: { order: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: reports.map(publicGenerationReport) });
}

export async function POST(
  request: NextRequest,
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
      documents: {
        select: { name: true, parsedText: true },
      },
    },
  });
  if (!deal) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  // 월 한도(quota)와 별개로, 짧은 시간에 몰아치는 생성을 막는다.
  // 생성 1건은 AI 호출 10회라 비용이 바로 나간다.
  const rate = await checkRateLimit(
    `report-gen:${session.user.id}`,
    RATE_LIMITS.reportGeneration.limit,
    RATE_LIMITS.reportGeneration.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "보고서 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  const quota = await checkQuota(deal.userId, "report").catch(() => null);
  if (!quota) return NextResponse.json({ error: "보고서 생성 한도를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: 429 });
  }

  if (deal.documents.length === 0) {
    return NextResponse.json(
      { error: "딜에 업로드된 문서가 없습니다. 먼저 IR 자료를 업로드해 주세요." },
      { status: 400 }
    );
  }

  // 서비스 미연결 시 새 보고서·복구 상태를 쓰거나 샘플을 생성하지 않는다.
  if (process.env.NODE_ENV === "production" && !isAIConfigured()) {
    return NextResponse.json({ error: new AIServiceUnavailableError().message }, { status: 503 });
  }

  // 실행시간 제한으로 함수가 강제 종료되면 status가 GENERATING에 남는다.
  // 그런 리포트를 계속 "생성 중"으로 취급하면 이 딜은 영영 새 보고서를
  // 만들 수 없으므로(항상 409), 오래된 것은 멈춘 것으로 보고 정리한다.
  try {
    const body = await request.json();
    const validated = createReportSchema.parse(body);

    const agentType = validated.agentType ?? inferAgentType(deal.sector);

    if (validated.templateId) {
      const template = await prisma.template.findFirst({
        where: { id: validated.templateId, ...templateReadWhere(session.user.id, teamId) },
        select: { id: true },
      });
      if (!template) {
        return NextResponse.json(
          { error: "양식을 찾을 수 없습니다" },
          { status: 404 }
        );
      }
    }

    // Create report record
    const token = randomUUID();
    const result = await prisma.$transaction(async (tx) => {
      // Quota is owned by the deal owner; same owner admissions serialize across deals.
      const owner = await tx.user.updateMany({ where: { id: deal.userId }, data: { updatedAt: new Date() } });
      const lockedDeal = await tx.deal.updateMany({ where: { id: params.id }, data: { updatedAt: new Date() } });
      if (owner.count !== 1 || lockedDeal.count !== 1) return { error: "딜을 찾을 수 없습니다", status: 404 } as const;
      const inFlight = await tx.report.findFirst({ where: { dealId: params.id, ...activeGenerationWhere(STALE_GENERATION_MS) }, select: { id: true } });
      if (inFlight) return { error: "이미 생성 중인 보고서가 있습니다.", status: 409, id: inFlight.id } as const;
      const admissionAt = new Date();
      const admitted = await checkQuota(deal.userId, "report", undefined, tx, admissionAt);
      if (!admitted.allowed) return { error: admitted.message, status: 429 } as const;
      await tx.report.updateMany({
        where: { dealId: params.id, ...staleGenerationWhere(STALE_GENERATION_MS) },
        data: { status: ReportStatus.PENDING, generationClaim: null, generationLeaseExpiresAt: null, currentSectionTitle: null },
      });
      const report = await tx.report.create({ data: {
        dealId: params.id,
        title: `${deal.companyName} 투자심의보고서`,
        agentType,
        status: ReportStatus.GENERATING,
        generationClaim: token,
        generationLeaseExpiresAt: new Date(admissionAt.getTime() + GENERATION_LEASE_MS),
        createdAt: admissionAt,
        ...(validated.templateId ? { templateId: validated.templateId } : {}),
      } });
      await tx.reportQuotaAdmission.create({ data: { userId: deal.userId, reportId: report.id,
        admissionRef: report.id, createdAt: admissionAt } });
      return { report } as const;
    });
    if ("error" in result) return NextResponse.json({ error: result.error, ...("id" in result && result.id ? { data: { id: result.id } } : {}) }, { status: result.status });
    const report = result.report;

    // 응답을 먼저 보낸 뒤에도 Vercel이 함수를 바로 얼리지 않도록 생성 작업의
    // 수명을 연장한다. waitUntil 없이 fire-and-forget으로 두면 서버리스
    // 인스턴스가 응답 직후 정지되면서 생성이 시작도 못 하고 끊길 수 있다.
    waitUntil(
      generateSectionsAsync(
        report.id,
        deal,
        agentType,
        validated.additionalContext,
        deal.userId,
        token
      ).catch(() => console.error("generateSectionsAsync failed"))
    );

    return NextResponse.json({ data: publicGenerationReport(report) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Report creation failed");
    return NextResponse.json(
      { error: "보고서 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
