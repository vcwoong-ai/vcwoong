/** Vcwoong (vcwoong-ai) — Claude DealSync와 별개 프로젝트 */
export const BRAND = {
  name: "Vcwoong",
  nameKr: "VC우ng",
  tagline: "섹터별 AI 심사역 SaaS",
  fullTitle: "Vcwoong — 섹터별 AI 심사역 SaaS",
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심의보고서를 자동 생성합니다. PubMed·ClinicalTrials·OpenFDA 실시간 연동.",
  url: process.env.NEXTAUTH_URL ?? "https://dealsync-jade.vercel.app",
  demoEmail: "demo@vcwoong.kr",
  demoPassword: "Demo1234!",
  supportEmail: "admin@vcwoong.kr",
  customerKeyPrefix: "vcwoong",
  github: "https://github.com/vcwoong-ai/vcwoong",
  vercel: "https://dealsync-jade.vercel.app",
} as const;

export function brandCustomerKey(userId: string): string {
  return `${BRAND.customerKeyPrefix}-${userId}`;
}

export function parseCustomerKeyUserId(customerKey: string): string | null {
  const prefix = `${BRAND.customerKeyPrefix}-`;
  if (!customerKey.startsWith(prefix)) return null;
  return customerKey.slice(prefix.length);
}
