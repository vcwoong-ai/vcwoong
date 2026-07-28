import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireFeature } from "@/lib/plan-gates";
import { getUserTeamContext } from "@/lib/team-access";

const shareSchema = z.object({
  type: z.enum(["deal", "template", "fund", "portfolio", "inbound"]),
  id: z.string().min(1),
  share: z.boolean(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const gate = await requireFeature(session.user.id, "teamCollaboration");
  if (gate) return gate;

  const ctx = await getUserTeamContext(session.user.id);
  if (!ctx.teamId) {
    return NextResponse.json({ error: "먼저 팀을 생성하세요" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { type, id, share } = shareSchema.parse(body);
    const teamId = share ? ctx.teamId : null;

    if (type === "deal") {
      const deal = await prisma.deal.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!deal) {
        return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
      }
      const updated = await prisma.deal.update({
        where: { id },
        data: { teamId },
      });
      return NextResponse.json({ data: updated });
    }

    if (type === "template") {
      const template = await prisma.template.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!template) {
        return NextResponse.json({ error: "양식을 찾을 수 없습니다" }, { status: 404 });
      }
      const updated = await prisma.template.update({
        where: { id },
        data: { teamId },
      });
      return NextResponse.json({ data: updated });
    }

    if (type === "fund") {
      const fund = await prisma.fund.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!fund) {
        return NextResponse.json({ error: "펀드를 찾을 수 없습니다" }, { status: 404 });
      }
      const updated = await prisma.fund.update({
        where: { id },
        data: { teamId },
      });
      return NextResponse.json({ data: updated });
    }

    if (type === "portfolio") {
      const company = await prisma.portfolioCompany.findFirst({
        where: { id, userId: session.user.id },
      });
      if (!company) {
        return NextResponse.json(
          { error: "포트폴리오를 찾을 수 없습니다" },
          { status: 404 }
        );
      }
      const updated = await prisma.portfolioCompany.update({
        where: { id },
        data: { teamId },
      });
      return NextResponse.json({ data: updated });
    }

    const inbound = await prisma.inboundDeal.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!inbound) {
      return NextResponse.json({ error: "인바운드를 찾을 수 없습니다" }, { status: 404 });
    }
    const updated = await prisma.inboundDeal.update({
      where: { id },
      data: { teamId },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "공유 설정 실패" }, { status: 500 });
  }
}
