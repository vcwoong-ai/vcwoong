import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
    }

    // Password change
    if (validated.newPassword) {
      if (!validated.currentPassword) {
        return NextResponse.json({ error: "현재 비밀번호를 입력해주세요" }, { status: 400 });
      }
      if (!user.passwordHash) {
        return NextResponse.json({ error: "소셜 로그인 계정은 비밀번호를 변경할 수 없습니다" }, { status: 400 });
      }
      const valid = await bcrypt.compare(validated.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다" }, { status: 400 });
      }
    }

    const updateData: { name?: string; passwordHash?: string } = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.newPassword) updateData.passwordHash = await bcrypt.hash(validated.newPassword, 10);

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "프로필 업데이트 중 오류가 발생했습니다" }, { status: 500 });
  }
}
