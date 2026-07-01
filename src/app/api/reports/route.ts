import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const sectionSchema = z.object({
  sectionKey: z.string(),
  title: z.string(),
  content: z.string(),
  order: z.number().int(),
});

const createSchema = z.object({
  dealId: z.string().min(1),
  title: z.string().optional(),
  agentType: z.string().optional(),
  sections: z.array(sectionSchema).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const reports = await prisma.report.findMany({
    where: { deal: { userId: session.user.id } },
    include: { deal: { select: { companyName: true, sector: true } }, sections: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: reports });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: parsed.data.dealId, userId: session.user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  const agentTypeMap: Record<string, string> = {
    BIO: "BIO", IT: "IT", IT_SAAS: "IT", DEEPTECH: "DEEPTECH",
    AI_DEEPTECH: "DEEPTECH", MANUFACTURING: "GENERAL", CONTENT: "CONSUMER",
    FINTECH: "FINTECH", GENERAL: "GENERAL", CLIMATE: "CLIMATE",
  };
  const rawAgentType = (parsed.data.agentType ?? deal.sector ?? "GENERAL").toUpperCase().replace(/-/g, "_");
  const resolvedAgentType = (agentTypeMap[rawAgentType] ?? "GENERAL") as import("@prisma/client").AgentType;

  const sections = parsed.data.sections ?? [];
  const status = sections.length > 0 ? "DRAFT" : "PENDING";

  const report = await prisma.report.create({
    data: {
      dealId: deal.id,
      title: parsed.data.title ?? `${deal.companyName} 투자심사보고서`,
      agentType: resolvedAgentType,
      status,
      generatedAt: sections.length > 0 ? new Date() : null,
      sections: sections.length > 0
        ? {
            create: sections.map((s) => ({
              sectionKey: s.sectionKey as import("@prisma/client").SectionKey,
              title: s.title,
              content: s.content,
              order: s.order,
              status: "DRAFT" as const,
            })),
          }
        : undefined,
    },
    include: { sections: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ data: report }, { status: 201 });
}
