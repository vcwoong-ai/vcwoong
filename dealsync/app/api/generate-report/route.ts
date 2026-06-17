import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import {
  getSectionsForSector,
  detectSector,
  buildPrompt,
} from "@/lib/report-sections";
import { DR_CELL_AGENT_NAME } from "@/lib/bio-agent";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId, regenerateSection } = await req.json();

  if (!dealId) {
    return NextResponse.json({ error: "dealId가 필요합니다." }, { status: 400 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: session.user.id },
    include: {
      documents: {
        where: { NOT: { extractedText: null } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
  }

  if (deal.documents.length === 0) {
    return NextResponse.json(
      { error: "분석할 문서가 없습니다. 먼저 문서를 업로드해주세요." },
      { status: 400 }
    );
  }

  const combinedText = deal.documents
    .map((doc: any) => `[${doc.type}: ${doc.fileName}]\n${doc.extractedText}`)
    .join("\n\n---\n\n");

  const sector = detectSector(combinedText);

  const allSections = getSectionsForSector(sector);
  const sectionsToGenerate = regenerateSection
    ? allSections.filter((s) => s.key === regenerateSection)
    : allSections;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let existingSections: Record<string, any> = {};

        if (regenerateSection) {
          const existingReport = await prisma.report.findFirst({
            where: { dealId },
            orderBy: { generatedAt: "desc" },
          });
          if (existingReport?.sections) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            existingSections = existingReport.sections as Record<string, any>;
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const generatedSections: Record<string, any> = { ...existingSections };

        send({
          type: "start",
          total: sectionsToGenerate.length,
          sector,
          agent: sector === "BIO" ? DR_CELL_AGENT_NAME : null,
          message:
            sector === "BIO"
              ? `바이오/헬스케어 섹터로 감지됨. ${DR_CELL_AGENT_NAME} 에이전트가 보고서를 생성합니다.`
              : "일반 섹터로 감지됨. 보고서 생성을 시작합니다.",
        });

        for (let i = 0; i < sectionsToGenerate.length; i++) {
          const section = sectionsToGenerate[i];

          send({
            type: "section_start",
            sectionKey: section.key,
            sectionTitle: section.title,
            index: i + 1,
            total: sectionsToGenerate.length,
          });

          const prompt = buildPrompt(section, combinedText, sector);

          try {
            const message = await anthropic.messages.create({
              model: "claude-sonnet-4-5",
              max_tokens: 2000,
              messages: [{ role: "user", content: prompt.user }],
              system: prompt.system,
            });

            const responseText =
              message.content[0].type === "text" ? message.content[0].text : "";

            let sectionData: { title: string; content: string; keyPoints: string[] };
          try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            sectionData = jsonMatch ? JSON.parse(jsonMatch[0]) : {
              title: section.title,
              content: responseText,
              keyPoints: [],
            };
          } catch {
            sectionData = {
              title: section.title,
              content: responseText,
              keyPoints: [],
            };
          }

          generatedSections[section.key] = sectionData;

            send({
              type: "section_complete",
              sectionKey: section.key,
              sectionTitle: section.title,
              data: sectionData,
              index: i + 1,
              total: sectionsToGenerate.length,
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "생성 실패";
            send({
              type: "section_error",
              sectionKey: section.key,
              sectionTitle: section.title,
              error: errMsg,
            });
            generatedSections[section.key] = {
              title: section.title,
              content: "생성 중 오류가 발생했습니다.",
              keyPoints: [],
            };
          }
        }

        if (regenerateSection) {
          await prisma.report.updateMany({
            where: { dealId, status: "DRAFT" },
            data: { sections: generatedSections },
          });
        } else {
          await prisma.report.create({
            data: {
              dealId,
              sections: generatedSections,
              status: "DRAFT",
              version: 1,
            },
          });
        }

        send({
          type: "complete",
          message: "보고서 생성이 완료되었습니다.",
          sections: generatedSections,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "보고서 생성 중 오류가 발생했습니다.";
        send({
          type: "error",
          message: errMsg,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
