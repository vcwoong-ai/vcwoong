import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { SectionKey, SectionStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgent } from "@/agents";
import {
  extractSharedFacts,
  formatSharedFactsForPrompt,
} from "@/lib/shared-facts";
import { evaluateSection } from "@/lib/report-quality";
import { checkQuota } from "@/lib/quotas";

const bodySchema = z.object({
  sectionKey: z.nativeEnum(SectionKey),
  /** 사용자가 직접 넣는 재생성 포커스 */
  focusNote: z.string().max(800).optional(),
  /** 품질 패널에서 넘긴 이슈/경고 */
  qualityIssues: z.array(z.string().max(200)).max(12).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());

    const report = await prisma.report.findFirst({
      where: { id: params.id, deal: { userId: session.user.id } },
      include: {
        deal: {
          include: {
            documents: {
              select: { name: true, parsedText: true },
            },
          },
        },
        sections: {
          orderBy: { order: "asc" },
          select: { sectionKey: true, title: true, content: true },
        },
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: "보고서를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const quota = await checkQuota(session.user.id, "report");
    if (!quota.allowed && report.status === "PENDING") {
      return NextResponse.json({ error: quota.message }, { status: 429 });
    }

    const deal = report.deal;
    const sharedFacts = extractSharedFacts({
      companyName: deal.companyName,
      sector: deal.sector,
      investRound: deal.investRound ?? undefined,
      investAmount: deal.investAmount ?? undefined,
      valuation: deal.valuation ?? undefined,
      documents: deal.documents,
    });
    const factsBlock = formatSharedFactsForPrompt(sharedFacts);

    const prior = report.sections
      .filter((s) => s.sectionKey !== body.sectionKey && s.content)
      .slice(-4)
      .map((s) => {
        const nums = (s.content.match(/[\d,.]+(?:억|조|%|원)?/g) ?? [])
          .slice(0, 5)
          .join(", ");
        return `- ${s.title}: ${s.content.replace(/\s+/g, " ").trim().slice(0, 180)}${
          nums ? ` [수치: ${nums}]` : ""
        }`;
      })
      .join("\n");

    const qualityGuide =
      body.qualityIssues && body.qualityIssues.length > 0
        ? `## 품질 개선 포커스 (반드시 반영)\n${body.qualityIssues
            .map((i) => `- ${i}`)
            .join("\n")}`
        : "";
    const focusGuide = body.focusNote?.trim()
      ? `## 사용자 지시\n${body.focusNote.trim()}`
      : "";

    const agent = getAgent(report.agentType, deal.sector);
    const result = await agent.generateSection(
      {
        dealId: deal.id,
        companyName: deal.companyName,
        sector: deal.sector,
        agentType: report.agentType,
        investRound: deal.investRound ?? undefined,
        investAmount: deal.investAmount ?? undefined,
        valuation: deal.valuation ?? undefined,
        documents: deal.documents,
        additionalContext: [
          factsBlock,
          prior ? `## 다른 섹션 요약\n${prior}` : "",
          qualityGuide,
          focusGuide,
          "이 요청은 단일 섹션 재생성입니다. 다른 섹션과 수치가 일치해야 합니다.",
          "이전 초안의 약점(짧음/출처 없음/표 없음/팩트 누락)을 고치세요.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      body.sectionKey
    );

    const quality = evaluateSection(result.sectionKey, result.content);

    const updated = await prisma.reportSection.updateMany({
      where: { reportId: report.id, sectionKey: body.sectionKey },
      data: {
        content: result.content,
        status: SectionStatus.DRAFT,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "해당 섹션을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (session.user.id && result.tokensUsed > 0) {
      prisma.usageLog
        .create({
          data: {
            userId: session.user.id,
            dealId: deal.id,
            reportId: report.id,
            agentType: report.agentType,
            sectionKey: result.sectionKey,
            model: result.modelUsed ?? "unknown",
            inputTokens: Math.round(result.tokensUsed * 0.7),
            outputTokens: Math.round(result.tokensUsed * 0.3),
            totalTokens: result.tokensUsed,
          },
        })
        .catch(() => {});
    }

    const section = await prisma.reportSection.findFirst({
      where: { reportId: report.id, sectionKey: body.sectionKey },
    });

    return NextResponse.json({
      data: {
        section,
        quality,
        modelUsed: result.modelUsed,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Section regenerate error:", error);
    return NextResponse.json(
      { error: "섹션 재생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
