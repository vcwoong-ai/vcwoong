import { SectionKey } from "@prisma/client";
import type { AgentInput } from "./base-agent";

/** 섹터별 투자개요 특화 프롬프트 */
export function buildInvestmentOverviewPrompt(
  input: AgentInput,
  opts: {
    sectorLabel: string;
    points: string[];
  }
): string {
  const doc = input.documents
    .filter((d) => d.parsedText)
    .map((d) => `### ${d.name}\n${(d.parsedText ?? "").slice(0, 8000)}`)
    .join("\n\n");

  return `## 기업: ${input.companyName} (${opts.sectorLabel})
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.investAmount != null ? `- 투자금액: ${input.investAmount}억원` : ""}
${input.valuation != null ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${doc || "제공된 자료 없음"}

## 투자개요 (${opts.sectorLabel} 특화)
### 1. 한 줄 요약 (Why This / Why Now)
### 2. 투자 조건 (라운드·금액·밸류·지분 확인 필요 시 표기)
### 3. 핵심 투자 포인트 Top 3
${opts.points.map((p, i) => `   ${i + 1}) ${p}`).join("\n")}
### 4. 주요 우려 사항 (1~3)
### 5. 잠정 투자 의견 (권고 / 조건부 / 추가검토 / 보류)

600~900자. 없는 수치는 확인 필요. 출처 표기.`;
}

export const OVERVIEW_SECTION = SectionKey.INVESTMENT_OVERVIEW;

export const SECTOR_OVERVIEW_FLAVOR: Record<
  string,
  { sectorLabel: string; points: string[] }
> = {
  BIO: {
    sectorLabel: "바이오/헬스케어",
    points: [
      "파이프라인·임상단계·PoS",
      "IP·규제·BD/기술이전",
      "라운드 용도(임상/CMC)와 런웨이",
    ],
  },
  IT: {
    sectorLabel: "IT/SaaS",
    points: ["ARR·NRR·성장", "LTV/CAC·Payback", "Moat·GTM"],
  },
  DEEPTECH: {
    sectorLabel: "AI/딥테크",
    points: ["TRL·벤치마크", "데이터/모델 해자", "유닛 이코노믹스(GPU)"],
  },
  MANUFACTURING: {
    sectorLabel: "제조/하드웨어",
    points: ["CAPA·수율·GPM", "고객 집중도·공급망", "Capex·ROCE"],
  },
  CONTENT: {
    sectorLabel: "콘텐츠/엔터",
    points: ["IP 포트폴리오", "팬덤·ARPU", "플랫폼 MG·글로벌"],
  },
  FINTECH: {
    sectorLabel: "핀테크/금융",
    points: ["TPV·Take Rate", "규제·라이선스", "신용/NPL 리스크"],
  },
};
