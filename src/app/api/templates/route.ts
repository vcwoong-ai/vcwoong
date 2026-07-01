import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  analysis: z.unknown().optional(),
  mappings: z.unknown().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const templates = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ data: templates });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = createTemplateSchema.parse(body);

    const template = await prisma.template.create({
      data: {
        userId: session.user.id,
        name: validated.name,
        analysis: (validated.analysis as object | undefined) ?? undefined,
        mappings: (validated.mappings as object | undefined) ?? undefined,
      },
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Template create error:", error);
    return NextResponse.json({ error: "양식 저장 중 오류가 발생했습니다" }, { status: 500 });
  }
}
