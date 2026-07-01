import { AgentType, DealSector, ReportStatus } from "@prisma/client";
import { MODEL } from "@/lib/claude";
import { getAgent } from "@/agents";
import { SECTION_META } from "@/types";
import { prisma } from "@/lib/prisma";
import {
  initProgress,
  updateProgress,
  completeProgress,
  errorProgress,
} from "@/lib/generation-progress";

export interface DealForGeneration {
  id: string;
  companyName: string;
  sector: DealSector;
  investRound: string | null;
  investAmount: number | null;
  valuation: number | null;
  documents: Array<{ name: string; parsedText: string | null }>;
}

export async function generateSectionsAsync(
  reportId: string,
  deal: DealForGeneration,
  agentType: AgentType,
  additionalContext?: string,
  userId?: string
) {
  const total = SECTION_META.length;
  initProgress(reportId, total);

  try {
    const agent = getAgent(agentType, deal.sector);
    const results = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    for (let i = 0; i < sectionKeys.length; i++) {
      const sectionKey = sectionKeys[i];
      const meta = SECTION_META.find((m) => m.key === sectionKey)!;
      updateProgress(reportId, i, meta.title);

      const result = await agent.generateSection(
        {
          dealId: deal.id,
          companyName: deal.companyName,
          sector: deal.sector,
          agentType,
          investRound: deal.investRound ?? undefined,
          investAmount: deal.investAmount ?? undefined,
          valuation: deal.valuation ?? undefined,
          documents: deal.documents,
          additionalContext,
        },
        sectionKey
      );
      results.push(result);

      if (userId && result.tokensUsed > 0) {
        prisma.usageLog
          .create({
            data: {
              userId,
              dealId: deal.id,
              reportId,
              agentType,
              sectionKey: result.sectionKey,
              model: MODEL,
              inputTokens: Math.round(result.tokensUsed * 0.7),
              outputTokens: Math.round(result.tokensUsed * 0.3),
              totalTokens: result.tokensUsed,
            },
          })
          .catch(() => {});
      }

      if (i < sectionKeys.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    await prisma.reportSection.deleteMany({ where: { reportId } });

    await prisma.reportSection.createMany({
      data: results.map((result) => {
        const meta = SECTION_META.find((m) => m.key === result.sectionKey)!;
        return {
          reportId,
          sectionKey: result.sectionKey,
          title: meta.title,
          content: result.content,
          order: meta.order,
        };
      }),
    });

    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.DRAFT, generatedAt: new Date() },
    });

    completeProgress(reportId);
  } catch (error) {
    console.error("Section generation error:", error);
    errorProgress(reportId, String(error));
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.PENDING },
    });
  }
}
