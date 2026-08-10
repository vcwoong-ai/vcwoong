import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createResetToken, RESET_TOKEN_TTL_MINUTES } from "@/lib/password-reset";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("유효한 이메일을 입력해주세요"),
});

/** 재설정 요청: IP당 1시간 5회 (메일 폭탄 방지) */
const LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * 가입 여부를 노출하지 않기 위해, 계정이 없어도 성공과 동일한 응답을 준다.
 * (응답만으로 어떤 이메일이 가입돼 있는지 알아낼 수 있으면 안 된다)
 */
const GENERIC_MESSAGE =
  "해당 이메일로 가입된 계정이 있다면 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rate = await checkRateLimit(
    `forgot-password:${ip}`,
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
    const { email } = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    // 비밀번호 로그인을 쓰는 계정에만 재설정 링크를 보낸다.
    if (user?.passwordHash) {
      const token = await createResetToken(email);
      const base = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
      const resetUrl = `${base}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

      await sendEmail({
        to: email,
        subject: "[Axiom] 비밀번호 재설정",
        html: passwordResetEmail(resetUrl, RESET_TOKEN_TTL_MINUTES),
      });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "유효한 이메일을 입력해주세요" },
        { status: 400 }
      );
    }
    console.error("Forgot password error:", error);
    // 내부 오류도 계정 존재 여부를 흘리지 않도록 동일 메시지로 답한다.
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
