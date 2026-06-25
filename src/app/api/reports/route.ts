import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AgentType, SectionKey } from "@prisma/client";
import { z } from "zod";

const sectionSchema = z.object({
  sectionKey: z.string(),
  title: z.string(),
  content: z.string(),
  order: z.number(),
});

const schema = z.object({
  dealId: z.string(),
  agentType: z.string().default("BIO"),
  sections: z.array(sectionSchema),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { dealId, agentType, sections } = parsed.data;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: session.user.id },
  });
  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  const agentTypeEnum = (AgentType as Record<string, AgentType>)[agentType.toUpperCase()] ?? AgentType.BIO;

  const report = await prisma.report.create({
    data: {
      dealId,
      title: `${deal.companyName} 투자심사보고서`,
      agentType: agentTypeEnum,
      status: "DRAFT",
      generatedAt: new Date(),
      sections: {
        create: sections.map((s) => ({
          sectionKey: (SectionKey as Record<string, SectionKey>)[s.sectionKey] ?? SectionKey.COMPANY_OVERVIEW,
          title: s.title,
          content: s.content,
          order: s.order,
        })),
      },
    },
    include: { sections: true },
  });

  return NextResponse.json({ data: report }, { status: 201 });
}
