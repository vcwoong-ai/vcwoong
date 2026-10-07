/** 기존 합성 데모의 식별자. 운영에서는 공개된 시드 자격정보로 로그인하지 않는다. */
export const DEMO_ACCOUNT_EMAIL = "demo@dealmind.kr";

const DEMO_DOMAINS = ["dealmind.kr", "axiom.kr", "vcwoong.kr", "dealsync.kr"];
export const DEMO_ACCOUNT_EMAILS = DEMO_DOMAINS.flatMap((domain) =>
  ["demo", "partner", "analyst"].map((name) => `${name}@${domain}`),
);

export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return Boolean(email && DEMO_ACCOUNT_EMAILS.includes(email.trim().toLowerCase()));
}

export function canUseDemoCredentials(
  email: string | null | undefined,
  environment: string | undefined = process.env.NODE_ENV,
): boolean {
  return !isDemoAccountEmail(email) || environment === "development" || environment === "test";
}
