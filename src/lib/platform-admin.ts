/**
 * 플랫폼 운영자(DealMind SaaS 운영자) 판별.
 *
 * `UserRole`(ADMIN/PARTNER/ANALYST, prisma/schema.prisma)은 "고객사(VC) 팀
 * 안에서의 역할"이라 팀마다 ADMIN이 여러 명 있을 수 있다 — 이건 플랫폼
 * 전체(모든 고객사) 비용을 보는 권한과는 완전히 다른 축이다. 이 파일은
 * "DealMind를 운영하는 사람"만 통과시키는 별도 게이트다.
 *
 * `PLATFORM_ADMIN_EMAILS`와 `PLATFORM_ADMIN_USER_IDS`(콤마 구분)에
 * 등록된 현재 DB 계정만 통과한다. 이메일만으로는 가입자의 소유가 확인되지 않는다.
 * 미설정 시 빈 목록 — 아무도 통과하지 못한다(fail-safe deny, 다른 모델
 * 체인 기본값들과 같은 원칙: 설정이 없거나 애매하면 더 위험한 쪽으로 새지
 * 않는다).
 */

import { isDemoAccountEmail } from "./demo-access";

export function resolvePlatformAdminEmails(
  raw: string | undefined = process.env.PLATFORM_ADMIN_EMAILS
): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.PLATFORM_ADMIN_EMAILS
): boolean {
  if (!email?.trim()) return false;
  return resolvePlatformAdminEmails(raw).includes(email.trim().toLowerCase());
}

/** 서버가 확인한 계정에만 적용한다. 클라이언트가 전달한 role/flag는 사용하지 않는다. */
export function isPlatformAdminAccount(
  account: { id: string; email: string | null | undefined } | null | undefined,
  emails: string | undefined = process.env.PLATFORM_ADMIN_EMAILS,
  userIds: string | undefined = process.env.PLATFORM_ADMIN_USER_IDS,
): boolean {
  if (!account?.id || isDemoAccountEmail(account.email)) return false;
  const ids = (userIds ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return ids.includes(account.id) && isPlatformAdminEmail(account.email, emails);
}
