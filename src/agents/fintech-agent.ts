import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import { formatFintechAnalysisForPrompt } from "@/lib/fintech/metrics-extract";
import {
  buildInvestmentOverviewPrompt,
  OVERVIEW_SECTION,
  SECTOR_OVERVIEW_FLAVOR,
} from "./overview-helpers";

/**
 * Vault — 핀테크/금융 전문 투자 심사역 에이전트.
 */
export class FintechAgent extends BaseAgent {
  constructor() {
    super(AgentType.FINTECH, DealSector.FINTECH);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    switch (sectionKey) {
      case SectionKey.INVESTMENT_OVERVIEW:
        return this.run(
          input,
          OVERVIEW_SECTION,
          buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.FINTECH)
        );
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateProduct(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateMarket(input);
      case SectionKey.FINANCIAL_STATUS:
        return this.generateFintechFinancials(input);
      case SectionKey.VALUATION:
        return this.generateValuation(input);
      case SectionKey.RISK_ANALYSIS:
        return this.generateRegulatoryRisk(input);
      default:
        return super.generateSection(input, sectionKey);
    }
  }

  private async run(
    input: AgentInput,
    sectionKey: SectionKey,
    userPrompt: string
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.FINTECH);
    const result = await generateText([{ role: "user", content: userPrompt }], {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.35,
    });
    return {
      sectionKey,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
      modelUsed: result.usedModel,
    };
  }

  private async generateProduct(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const fintechAnalysis = formatFintechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (핀테크)
${input.additionalContext ?? ""}

## 자료
${documentContext}${fintechAnalysis}

## 제품/기술 (핀테크 특화)
### 1. 핵심 상품·서비스 (결제/대출/보험/자산 등)
### 2. 기술 스택·보안·사기탐지
### 3. 라이선스·컴플라이언스 아키텍처
### 4. 차별화 (Take Rate·UX·데이터)
### 5. 로드맵

없는 수치는 확인 필요. 700~1,100자.`
    );
  }

  private async generateMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const fintechAnalysis = formatFintechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName} (핀테크)
${input.additionalContext ?? ""}

## 자료
${documentContext}${fintechAnalysis}

## 시장분석 (핀테크 특화)
### 1. TAM/성장 드라이버 (전자금융·대안신용 등)
### 2. 경쟁 (토스/카카오페이/네이버페이/은행)
### 3. 규제 환경 (금융위·금감원)
### 4. GTM·파트너십 (은행/카드)
### 5. 전환비용·고착성

700~1,100자.`
    );
  }

  private async generateFintechFinancials(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const fintechAnalysis = formatFintechAnalysisForPrompt(documentContext);

    return this.run(
      input,
      SectionKey.FINANCIAL_STATUS,
      `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 핀테크/금융
${input.additionalContext ?? ""}

## 제공 자료
${documentContext}${fintechAnalysis}

## 재무현황 (핀테크 특화)
### 1. TPV / Take Rate / GMV 분해 (자동추출 수치 인용)
### 2. 신용·NPL·충당금 (해당 시)
### 3. 손익 표 (최근 3개년)
### 4. CAC·LTV·ARPU
### 5. 자본 적정성 / 런웨이

800~1,100자. 없는 숫자는 확인 필요.`
    );
  }

  private async generateValuation(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const fintechAnalysis = formatFintechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.VALUATION,
      `## 기업: ${input.companyName}
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${documentContext}${fintechAnalysis}

## 밸류에이션 (핀테크 특화)
### 1. 라운드 요약
### 2. TPV×Take Rate / P/B / 수익 배수
### 3. Peer comps (국내 핀테크)
### 4. 규제 자본 제약 반영
### 5. Exit 시나리오

700~1,100자.`
    );
  }

  private async generateRegulatoryRisk(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.RISK_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 리스크 (핀테크 특화)
### 1. 규제/라이선스
### 2. 신용/시장 (NPL·NIM)
### 3. 보안·개인정보
### 4. 빅테크 경쟁·Take Rate 압력
### 5. 완화 방안

700~1,000자.`
    );
  }
}
