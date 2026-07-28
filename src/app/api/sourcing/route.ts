import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { DealSector, DealSourceType, InboundStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { guessSector } from "@/lib/sourcing";
import { getUserTeamContext, inboundReadWhere } from "@/lib/team-access";

const createSchema = z.object({
  companyName: z.string().min(1).max(120),
  sector: z.nativeEnum(DealSector).optional(),
  source: z.nativeEnum(DealSourceType).optional(),
  contactName: z.string().max(80).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  summary: z.string().max(4000).optional(),
  rawText: z.string().max(20000).optional(),
  shareWithTeam: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam && statusParam in InboundStatus
      ? (statusParam as InboundStatus)
      : undefined;

  const leads = await prisma.inboundDeal.findMany({
    where: {
      ...inboundReadWhere(session.user.id, teamId),
      ...(status ? { status } : {}),
    },
    orderBy: [{ screeningScore: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ data: leads });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const { teamId } = await getUserTeamContext(session.user.id);
  const shareTeamId =
    body.shareWithTeam !== false && teamId ? teamId : null;

  const lead = await prisma.inboundDeal.create({
    data: {
      companyName: body.companyName,
      sector:
        body.sector ??
        guessSector(`${body.companyName} ${body.summary ?? ""} ${body.rawText ?? ""}`),
      source: body.source ?? DealSourceType.OTHER,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      summary: body.summary || null,
      rawText: body.rawText || null,
      status: InboundStatus.NEW,
      userId: session.user.id,
      teamId: shareTeamId,
    },
  });

  return NextResponse.json({ data: lead }, { status: 201 });
}
