import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SectionStatus } from "@prisma/client";

const updateSectionSchema = z.object({
  sectionId: z.string(),
  content: z.string().optional(),
  status: z.nativeEnum(SectionStatus).optional(),
  feedback: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
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
  });

  if (!report) {
    return NextResponse.json(
      { error: "보고서를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  try {
    const body = await request.json();
    const validated = updateSectionSchema.parse(body);

    const section = await prisma.reportSection.update({
      where: { id: validated.sectionId },
      data: {
        ...(validated.content !== undefined ? { content: validated.content } : {}),
        ...(validated.status ? { status: validated.status } : {}),
        ...(validated.feedback !== undefined ? { feedback: validated.feedback } : {}),
      },
    });

    return NextResponse.json({ data: section });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Section update error:", error);
    return NextResponse.json(
      { error: "섹션 수정 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
