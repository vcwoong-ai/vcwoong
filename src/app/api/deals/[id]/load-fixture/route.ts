import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DocumentType } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { fixtureForSector, GOLDEN_FIXTURES } from "@/lib/fixtures";
import {
  getUserTeamContext,
  dealWriteWhere,
  dealReadWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const bodySchema = z.object({
  fixtureId: z.string().optional(),
});

/**
 * POST /api/deals/[id]/load-fixture
 * 골든 IR 픽스처를 딜 문서로 1클릭 적재 (로컬 연습용).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
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

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
    }

    const fixture =
      (parsed.data.fixtureId
        ? GOLDEN_FIXTURES.find((f) => f.id === parsed.data.fixtureId)
        : undefined) ?? fixtureForSector(deal.sector);

    if (!fixture) {
      return NextResponse.json(
        {
          error: `섹터 ${deal.sector}용 픽스처가 없습니다. fixtureId를 지정하세요.`,
          available: GOLDEN_FIXTURES.map((f) => ({
            id: f.id,
            sector: f.sector,
            label: f.label,
          })),
        },
        { status: 404 }
      );
    }

    const text = readFileSync(
      resolve(process.cwd(), fixture.relativePath),
      "utf8"
    );
    const bytes = Buffer.byteLength(text, "utf8");

    const document = await prisma.document.create({
      data: {
        dealId: deal.id,
        name: fixture.fileName,
        type: DocumentType.IR_DECK,
        url: `fixture://${fixture.id}`,
        size: bytes,
        mimeType: "text/markdown",
        parsedText: text,
        metadata: {
          source: "golden-fixture",
          fixtureId: fixture.id,
          companyName: fixture.companyName,
        },
      },
    });

    // 딜에 라운드 정보가 비어 있으면 픽스처 메타로 채움
    const dealUpdate: {
      investRound?: string;
      investAmount?: number;
      valuation?: number;
    } = {};
    if (!deal.investRound) dealUpdate.investRound = fixture.investRound;
    if (deal.investAmount == null) dealUpdate.investAmount = fixture.investAmount;
    if (deal.valuation == null) dealUpdate.valuation = fixture.valuation;

    if (Object.keys(dealUpdate).length > 0) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: dealUpdate,
      });
    }

    return NextResponse.json(
      {
        data: {
          document,
          fixture: {
            id: fixture.id,
            label: fixture.label,
            sector: fixture.sector,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Load fixture error:", error);
    return NextResponse.json(
      { error: "픽스처 로드 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);
  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...dealReadWhere(session.user.id, teamId) },
    select: { id: true, sector: true },
  });
  if (!deal) {
    return NextResponse.json(
      { error: "딜을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  const recommended = fixtureForSector(deal.sector);
  return NextResponse.json({
    data: {
      recommended: recommended
        ? { id: recommended.id, label: recommended.label, sector: recommended.sector }
        : null,
      fixtures: GOLDEN_FIXTURES.map((f) => ({
        id: f.id,
        label: f.label,
        sector: f.sector,
      })),
    },
  });
}
