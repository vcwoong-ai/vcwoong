import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeResetToken } from "@/lib/password-reset";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(16),
  password: z
    .string()
    .min(8, "비밀번호는 8자 이상이어야 합니다")
    .regex(
      /^(?=.*[a-zA-Z])(?=.*\d)/,
      "비밀번호는 영문자와 숫자를 포함해야 합니다"
    ),
});

/** 토큰 대입 방지: IP당 15분 20회 */
const LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 };

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rate = await checkRateLimit(
    `reset-password:${ip}`,
    LIMIT.limit,
    LIMIT.windowMs
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  try {
    const { email, token, password } = schema.parse(await request.json());

    const verifiedEmail = await consumeResetToken(email, token);
    if (!verifiedEmail) {
      return NextResponse.json(
        { error: "링크가 만료되었거나 유효하지 않습니다. 재설정을 다시 요청해 주세요." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const updated = await prisma.user.updateMany({
      where: { email: verifiedEmail },
      data: { passwordHash },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "계정을 찾을 수 없습니다." },
        { status: 400 }
      );
    }

    // 비밀번호를 바꿨으면 이 IP의 로그인 실패 카운터도 풀어준다.
    await prisma.rateLimit.deleteMany({ where: { key: `login:${ip}` } }).catch(() => {});

    return NextResponse.json({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "입력 데이터가 올바르지 않습니다" },
        { status: 400 }
      );
    }
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "비밀번호 재설정 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
