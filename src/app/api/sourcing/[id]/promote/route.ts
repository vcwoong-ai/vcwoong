import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { DealStage, DocumentType, InboundStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** 인바운드 딜을 심사 파이프라인의 딜로 승격한다 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const lead = await prisma.inboundDeal.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!lead) {
    return NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });
  }
  if (lead.dealId) {
    return NextResponse.json(
      { error: "이미 딜로 전환되었습니다", data: { dealId: lead.dealId } },
      { status: 409 }
    );
  }

  const deal = await prisma.deal.create({
    data: {
      name: `${lead.companyName} 투자 검토`,
      companyName: lead.companyName,
      sector: lead.sector,
      stage: DealStage.SCREENING,
      description: lead.summary,
      userId: session.user.id,
    },
  });

  // 제출 자료가 있으면 문서로 옮겨 바로 보고서를 생성할 수 있게 한다
  const text = [lead.summary, lead.rawText].filter(Boolean).join("\n\n");
  if (text.trim()) {
    await prisma.document.create({
      data: {
        dealId: deal.id,
        name: `${lead.companyName}_인바운드자료.md`,
        type: DocumentType.IR_DECK,
        url: `sourcing://${lead.id}`,
        size: Buffer.byteLength(text, "utf8"),
        mimeType: "text/markdown",
        parsedText: text,
        metadata: { source: "inbound", inboundDealId: lead.id },
      },
    });
  }

  await prisma.inboundDeal.update({
    where: { id: lead.id },
    data: { status: InboundStatus.PROMOTED, dealId: deal.id },
  });

  return NextResponse.json({ data: { deal } }, { status: 201 });
}
