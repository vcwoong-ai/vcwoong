import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseInboundEmail } from "@/lib/email-parser";
import { guessSector } from "@/lib/sourcing";

const bodySchema = z.object({
  rawEmail: z.string().min(20, "이메일 내용이 너무 짧습니다"),
  companyName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { rawEmail, companyName: overrideName } = bodySchema.parse(body);

    const parsed = parseInboundEmail(rawEmail);
    const companyName =
      overrideName?.trim() ||
      parsed.companyName ||
      parsed.subject?.replace(/\[|\]|IR|투자/gi, "").trim() ||
      "미확인 기업";

    const sector = guessSector(parsed.rawText);

    const lead = await prisma.inboundDeal.create({
      data: {
        userId: session.user.id,
        companyName,
        sector,
        source: "INBOUND",
        contactName: parsed.contactName,
        contactEmail: parsed.contactEmail,
        summary: parsed.summary,
        rawText: parsed.rawText,
      },
    });

    return NextResponse.json(
      {
        data: lead,
        parsed: {
          companyName,
          contactName: parsed.contactName,
          contactEmail: parsed.contactEmail,
          subject: parsed.subject,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message }, { status: 400 });
    }
    console.error("Email import error:", error);
    return NextResponse.json({ error: "메일 파싱 실패" }, { status: 500 });
  }
}
