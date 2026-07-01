import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportStatus } from "@prisma/client";
import { generateSectionsAsync } from "@/lib/report-generation";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const report = await prisma.report.findFirst({
    where: {
      id: params.id,
      deal: { userId: session.user.id },
    },
    include: {
      deal: {
        include: {
          documents: { select: { name: true, parsedText: true } },
        },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "보고서를 찾을 수 없습니다" }, { status: 404 });
  }

  if (report.status === ReportStatus.GENERATING) {
    return NextResponse.json({ error: "이미 생성 중입니다" }, { status: 409 });
  }

  if (report.deal.documents.length === 0) {
    return NextResponse.json(
      { error: "딜에 업로드된 문서가 없습니다. 먼저 IR 자료를 업로드해 주세요." },
      { status: 400 }
    );
  }

  await prisma.report.update({
    where: { id: report.id },
    data: { status: ReportStatus.GENERATING },
  });

  generateSectionsAsync(
    report.id,
    report.deal,
    report.agentType,
    undefined,
    session.user.id
  );

  return NextResponse.json({ data: { id: report.id, status: "GENERATING" } });
}
