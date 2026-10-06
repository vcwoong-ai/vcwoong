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
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async tx => {
        await tx.verificationToken.deleteMany({ where: { identifier } });
        await tx.verificationToken.create({ data: { identifier, token: tokenHash, expires } });
      }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
      return token;
    } catch (error) {
      const serializationConflict = typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
      if (serializationConflict && attempt < 2) continue;
      throw new Error("Password reset token could not be issued");
    }
  }
  throw new Error("Password reset token could not be issued");
}

/** Token consumption and password change either both commit or both roll back. */
export async function resetPasswordWithToken(
  email: string,
  token: string,
  passwordHash: string
): Promise<"updated" | "invalid" | "account_missing"> {
  const identifier = identifierFor(email);
  const tokenHash = hashToken(token);
  try {
    return await prisma.$transaction(async tx => {
      const now = new Date();
      const record = await tx.verificationToken.findFirst({ where: { identifier, token: tokenHash } });
      if (!record) return "invalid" as const;
      if (record.expires.getTime() <= now.getTime()) {
        // Never remove a newer token issued while this expired link was being checked.
        await tx.verificationToken.deleteMany({
          where: { identifier, token: record.token, expires: { equals: record.expires, lte: now } },
        });
        return "invalid" as const;
      }
      const provided = Buffer.from(tokenHash, "hex");
      const stored = Buffer.from(record.token, "hex");
      if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) return "invalid" as const;
      const consumed = await tx.verificationToken.deleteMany({
        where: { identifier, token: record.token, expires: { equals: record.expires, gt: new Date() } },
      });
      if (consumed.count !== 1) return "invalid" as const;
      const changed = await tx.user.updateMany({
        where: { email: email.toLowerCase() },
        data: { passwordHash },
      });
      if (changed.count !== 1) throw new ResetAccountMissingError();
      return "updated" as const;
    });
  } catch (error) {
    if (error instanceof ResetAccountMissingError) return "account_missing";
    throw new Error("Password reset transaction failed");
  }
}

class ResetAccountMissingError extends Error {}
