import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseInboundEmail } from "@/lib/email-parser";
import { guessSector } from "@/lib/sourcing";

const bodySchema = z.object({
  rawEmail: z.string().min(20),
  userEmail: z.string().email().optional(),
  companyName: z.string().optional(),
});

/**
 * 외부 메일 서비스(IMAP 폴링·Zapier·Make)에서 호출하는 인바운드 Webhook.
 * 헤더 `X-Webhook-Secret`에 SOURCING_WEBHOOK_SECRET 값을 넣어야 한다.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.SOURCING_WEBHOOK_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Webhook 인증 실패" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rawEmail, userEmail, companyName: overrideName } = bodySchema.parse(body);

    const ownerEmail = userEmail ?? process.env.SOURCING_WEBHOOK_USER_EMAIL;
    if (!ownerEmail) {
      return NextResponse.json(
        { error: "userEmail 또는 SOURCING_WEBHOOK_USER_EMAIL 필요" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!user) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }

    const parsed = parseInboundEmail(rawEmail);
    const companyName =
      overrideName?.trim() ||
      parsed.companyName ||
      parsed.subject?.replace(/\[|\]|IR|투자/gi, "").trim() ||
      "미확인 기업";

    const lead = await prisma.inboundDeal.create({
      data: {
        userId: user.id,
        teamId: user.teamId,
        companyName,
        sector: guessSector(parsed.rawText),
        source: "INBOUND",
        contactName: parsed.contactName,
        contactEmail: parsed.contactEmail,
        summary: parsed.summary,
        rawText: parsed.rawText,
      },
    });

    return NextResponse.json({ data: lead }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    console.error("Sourcing webhook error:", error);
    return NextResponse.json({ error: "Webhook 처리 실패" }, { status: 500 });
  }
}
