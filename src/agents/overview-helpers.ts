import { DealSector, SectionKey } from "@prisma/client";
import type { AgentInput } from "./base-agent";

function documentBlock(input: AgentInput): string {
  const doc = input.documents
    .filter((d) => d.parsedText)
    .map((d) => `### ${d.name}\n${(d.parsedText ?? "").slice(0, 8000)}`)
    .join("\n\n");
  return doc || "제공된 자료 없음";
}

function dealHeader(input: AgentInput, sectorLabel: string): string {
  return `## 기업: ${input.companyName} (${sectorLabel})
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.investAmount != null ? `- 투자금액: ${input.investAmount}억원` : ""}
${input.valuation != null ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}`;
}

/** 섹터별 투자개요 특화 프롬프트 */
export function buildInvestmentOverviewPrompt(
  input: AgentInput,
  opts: {
    sectorLabel: string;
    points: string[];
  }
): string {
  return `${dealHeader(input, opts.sectorLabel)}

## 자료
${documentBlock(input)}

## 투자개요 (${opts.sectorLabel} 특화)
### 1. 한 줄 요약 (Why This / Why Now)
### 2. 투자 조건 (라운드·금액·밸류·지분 확인 필요 시 표기)
### 3. 핵심 투자 포인트 Top 3
${opts.points.map((p, i) => `   ${i + 1}) ${p}`).join("\n")}
### 4. 주요 우려 사항 (1~3)
### 5. 잠정 투자 의견 (권고 / 조건부 / 추가검토 / 보류)

600~900자. 없는 수치는 확인 필요. 출처 표기.`;
}

/** 섹터별 회사개요 특화 프롬프트 */
export function buildCompanyOverviewPrompt(
  input: AgentInput,
  opts: {
    sectorLabel: string;
    teamFocus: string[];
  }
): string {
  return `${dealHeader(input, opts.sectorLabel)}

## 자료
${documentBlock(input)}

## 회사개요 (${opts.sectorLabel} 특화)
### 1. 기업 기본 정보 (설립·소재·임직원)
### 2. 미션·비전·설립 배경
### 3. 경영진·핵심 인력
${opts.teamFocus.map((p) => `   - ${p}`).join("\n")}
### 4. 주요 연혁 타임라인
### 5. 주주·조직 구조 (표, 없으면 확인 필요)

600~1,000자. 없는 정보는 확인 필요.`;
}

export const OVERVIEW_SECTION = SectionKey.INVESTMENT_OVERVIEW;
export const COMPANY_SECTION = SectionKey.COMPANY_OVERVIEW;

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
  CLIMATE: {
    sectorLabel: "기후/ESG",
    points: ["감축 임팩트·MRV", "정책·탄소시장", "프로젝트/Capex"],
  },
  CONSUMER: {
    sectorLabel: "소비재/D2C",
    points: ["브랜드·SKU", "GMV·재구매", "채널 믹스"],
  },
  GENERAL: {
    sectorLabel: "일반",
    points: ["Problem/Solution", "시장 타이밍", "팀 실행력"],
  },
};

export const SECTOR_COMPANY_FLAVOR: Record<
  string,
  { sectorLabel: string; teamFocus: string[] }
> = {
  BIO: {
    sectorLabel: "바이오/헬스케어",
    teamFocus: [
      "임상·CMC·BD 경력",
      "KOL/자문 네트워크",
      "R&D 조직 규모",
    ],
  },
  IT: {
    sectorLabel: "IT/SaaS",
    teamFocus: ["제품/엔지니어링 리더십", "GTM·세일즈 경력", "고객성공 조직"],
  },
  DEEPTECH: {
    sectorLabel: "AI/딥테크",
    teamFocus: ["연구/논문·특허 리더", "인프라·MLOps", "상용화 PoC 경험"],
  },
  MANUFACTURING: {
    sectorLabel: "제조/하드웨어",
    teamFocus: ["양산·품질 리더", "공급망 경험", "현장 엔지니어 비중"],
  },
  CONTENT: {
    sectorLabel: "콘텐츠/엔터",
    teamFocus: ["크리에이티브·IP 리더", "제작/유통 네트워크", "글로벌 BD"],
  },
  FINTECH: {
    sectorLabel: "핀테크/금융",
    teamFocus: ["규제·컴플라이언스", "리스크/여신", "결제 인프라"],
  },
  CLIMATE: {
    sectorLabel: "기후/ESG",
    teamFocus: ["엔지니어링·프로젝트 수행", "MRV/인증", "정책·보조금 경험"],
  },
  CONSUMER: {
    sectorLabel: "소비재/D2C",
    teamFocus: ["브랜드/마케팅", "MD·상품기획", "물류·운영"],
  },
  GENERAL: {
    sectorLabel: "일반",
    teamFocus: ["창업자 도메인 적합성", "핵심 임원 보완", "조직 확장성"],
  },
};

export function flavorKeyForSector(sector?: DealSector | string): string {
  if (!sector) return "GENERAL";
  return String(sector) in SECTOR_OVERVIEW_FLAVOR
    ? String(sector)
    : "GENERAL";
}
