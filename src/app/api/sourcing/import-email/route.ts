import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { InboundStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseEmailIntake } from "@/lib/email-intake";

const bodySchema = z.object({
  raw: z.string().min(20).max(100000),
  /** true면 파싱 결과만 돌려주고 저장하지 않는다 */
  preview: z.boolean().optional(),
});

/** IR 메일 원문을 파싱해 인바운드 딜로 등록한다 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "메일 본문을 20자 이상 붙여넣으세요" },
      { status: 400 }
    );
  }

  const leads = parseEmailIntake(parsed.data.raw);
  if (leads.length === 0) {
    return NextResponse.json(
      { error: "메일에서 딜 정보를 찾지 못했습니다" },
      { status: 400 }
    );
  }

  if (parsed.data.preview) {
    return NextResponse.json({ data: { leads, created: 0 } });
  }

  const created = await prisma.$transaction(
    leads.map((lead) =>
      prisma.inboundDeal.create({
        data: {
          companyName: lead.companyName,
          sector: lead.sector,
          source: lead.source,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          summary: lead.summary,
          rawText: lead.rawText,
          status: InboundStatus.NEW,
          userId: session.user.id,
        },
      })
    )
  );

  return NextResponse.json(
    { data: { leads: created, created: created.length } },
    { status: 201 }
  );
}
