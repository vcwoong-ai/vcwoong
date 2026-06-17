import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.string().email("유효한 이메일을 입력해주세요"),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)/,
      "비밀번호는 영문자와 숫자를 포함해야 합니다"
    ),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({
      where: { email: validated.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(validated.password, 12);

    const user = await prisma.user.create({
      data: {
        name: validated.name,
        email: validated.email,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "입력 데이터가 올바르지 않습니다", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "회원가입 처리 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
