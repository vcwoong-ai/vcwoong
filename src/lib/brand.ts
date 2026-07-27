/**
 * Axiom — 섹터 전문 AI 심사역 SaaS.
 *
 * 이름 유래: axiom(공리) — 증명 없이 참으로 받아들이는 기본 명제.
 * 투자심의는 결국 "무엇을 전제로 두고 판단했는가"의 문제이므로,
 * 판단의 전제를 명확히 남기는 보고서를 만든다는 뜻을 담았다.
 *
 * 별도 프로젝트인 Claude DealSync와 이름·자산을 공유하지 않는다.
 */
export const BRAND = {
  name: "Axiom",
  nameKr: "액시엄",
  tagline: "섹터 전문 AI 심사역 SaaS",
  fullTitle: "Axiom — 섹터 전문 AI 심사역 SaaS",
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심의보고서를 자동 생성합니다. 딜소싱부터 LP 리포팅까지 풀사이클을 하나의 흐름으로 잇습니다.",
  // 배포 URL은 환경변수로 주입한다 (Vercel 슬러그는 제품명과 별개)
  url: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  demoEmail: "demo@axiom.kr",
  demoPassword: "Demo1234!",
  supportEmail: "admin@axiom.kr",
  customerKeyPrefix: "axiom",
  github: "https://github.com/vcwoong-ai/vcwoong",
} as const;

export function brandCustomerKey(userId: string): string {
  return `${BRAND.customerKeyPrefix}-${userId}`;
}

export function parseCustomerKeyUserId(customerKey: string): string | null {
  const prefix = `${BRAND.customerKeyPrefix}-`;
  if (!customerKey.startsWith(prefix)) return null;
  return customerKey.slice(prefix.length);
}
