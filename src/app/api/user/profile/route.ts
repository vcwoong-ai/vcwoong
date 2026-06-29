import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const updateProfileSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요").max(50).optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "비밀번호는 최소 8자 이상이어야 합니다")
    .optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력값이 올바르지 않습니다", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { name, currentPassword, newPassword } = parsed.data;
  const updateData: { name?: string; passwordHash?: string } = {};

  if (name) {
    updateData.name = name;
  }

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "현재 비밀번호를 입력해주세요" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "비밀번호 변경이 불가능한 계정입니다" },
        { status: 400 }
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "현재 비밀번호가 올바르지 않습니다" },
        { status: 400 }
      );
    }

    updateData.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ message: "프로필이 업데이트되었습니다" });
}
