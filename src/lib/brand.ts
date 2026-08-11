/**
 * DealMind — 섹터 전문 AI 심사역 SaaS.
 *
 * 이름 유래: Deal + Mind — 딜을 "요약"하는 게 아니라 "판단"하는 AI.
 * 투자심의는 결국 "무엇을 근거로 어떻게 판단했는가"의 문제이므로,
 * 결론과 함께 그 판단의 근거를 추적 가능하게 남기는 보고서를 만든다.
 */
export const BRAND = {
  name: "DealMind",
  nameKr: "딜마인드",
  tagline: "섹터 전문 AI 심사역 SaaS",
  fullTitle: "DealMind — 섹터 전문 AI 심사역 SaaS",
  description:
    "바이오/IT/AI/제조/콘텐츠/핀테크 6개 섹터 전문 AI가 투자심의보고서를 자동 생성합니다. 모든 수치는 업로드한 자료의 원문으로 되짚을 수 있고, 딜소싱부터 LP 리포팅까지 풀사이클을 하나의 흐름으로 잇습니다.",
  // 배포 URL은 환경변수로 주입한다 (Vercel 슬러그는 제품명과 별개)
  url: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
  demoEmail: "demo@dealmind.kr",
  demoPassword: "Demo1234!",
  supportEmail: "admin@dealmind.kr",
  customerKeyPrefix: "dealmind",
  github: "https://github.com/vcwoong-ai/vcwoong",
} as const;

/**
 * 제품명 변경(2026-08, Axiom → DealMind) 이전에 발급된 customerKey 접두사.
 *
 * Toss에 이미 등록된 빌링키의 customerKey는 우리가 바꿀 수 없으므로,
 * 웹훅이 옛 접두사로 들어와도 사용자를 찾을 수 있어야 한다. 이걸 빠뜨리면
 * 옛 구독자의 해지 웹훅이 조용히 무시된다.
 */
const LEGACY_CUSTOMER_KEY_PREFIXES = ["axiom"] as const;

export function brandCustomerKey(userId: string): string {
  return `${BRAND.customerKeyPrefix}-${userId}`;
}

export function parseCustomerKeyUserId(customerKey: string): string | null {
  for (const prefix of [BRAND.customerKeyPrefix, ...LEGACY_CUSTOMER_KEY_PREFIXES]) {
    const withDash = `${prefix}-`;
    if (customerKey.startsWith(withDash)) return customerKey.slice(withDash.length);
  }
  return null;
}
