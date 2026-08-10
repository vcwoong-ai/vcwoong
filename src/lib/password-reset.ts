/**
 * 비밀번호 재설정 토큰.
 *
 * NextAuth의 VerificationToken 테이블을 재사용한다(Email 프로바이더를 쓰지
 * 않아 비어 있음). identifier에 접두사를 붙여 용도를 구분하므로, 나중에
 * 이메일 인증을 붙여도 서로 섞이지 않는다.
 *
 * 토큰 원문은 저장하지 않고 SHA-256 해시만 저장한다 — DB가 새더라도 그
 * 값만으로는 계정을 탈취할 수 없다.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const PREFIX = "password-reset:";
export const RESET_TOKEN_TTL_MINUTES = 30;

function identifierFor(email: string): string {
  return `${PREFIX}${email.toLowerCase()}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 재설정 토큰을 발급한다. 기존 토큰은 무효화해 링크가 여러 개 살아 있지 않게 한다.
 * 반환값은 메일로 보낼 원문 토큰(DB에는 해시만 남는다).
 */
export async function createResetToken(email: string): Promise<string> {
  const identifier = identifierFor(email);
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashToken(token),
      expires: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });
  return token;
}

/**
 * 토큰을 검증하고 해당 이메일을 돌려준다. 유효하지 않으면 null.
 * 성공 여부와 무관하게 만료된 토큰은 정리한다.
 */
export async function consumeResetToken(
  email: string,
  token: string
): Promise<string | null> {
  const identifier = identifierFor(email);
  const record = await prisma.verificationToken.findFirst({
    where: { identifier },
  });
  if (!record) return null;

  if (record.expires.getTime() < Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    return null;
  }

  // 길이가 같을 때만 timingSafeEqual을 쓸 수 있다.
  const provided = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(record.token, "hex");
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return null;
  }

  // 한 번 쓰면 즉시 무효화한다.
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  return email.toLowerCase();
}
