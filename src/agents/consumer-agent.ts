import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import {
  buildInvestmentOverviewPrompt,
  SECTOR_OVERVIEW_FLAVOR,
} from "./overview-helpers";

/**
 * Consumer — 소비재/D2C 전문 투자 심사역 에이전트.
 * 브랜드 파워, D2C 지표, 유통 채널, 소비자 트렌드 분석에 특화.
 */
export class ConsumerAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL, DealSector.CONSUMER);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    switch (sectionKey) {
      case SectionKey.INVESTMENT_OVERVIEW:
        return this.generateInvestmentOverview(input);
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateBrandProduct(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateMarket(input);
      case SectionKey.FINANCIAL_STATUS:
        return this.generateFinancials(input);
      case SectionKey.VALUATION:
        return this.generateValuation(input);
      case SectionKey.RISK_ANALYSIS:
        return this.generateRisk(input);
      default:
        return super.generateSection(input, sectionKey);
    }
  }

  private async run(
    input: AgentInput,
    sectionKey: SectionKey,
    userPrompt: string
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CONSUMER);
    const result = await generateText([{ role: "user", content: userPrompt }], {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.35,
    });
    return {
      sectionKey,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      modelUsed: result.usedModel,
    };
  }

  private async generateInvestmentOverview(
    input: AgentInput
  ): Promise<GenerationResult> {
    return this.run(
      input,
      SectionKey.INVESTMENT_OVERVIEW,
      buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.CONSUMER)
    );
  }

  private async generateBrandProduct(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (소비재/D2C)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 제품/브랜드 (소비재 특화)
### 1. 핵심 제품·SKU 포트폴리오
### 2. 브랜드 포지셔닝·차별화
### 3. 품질·원료·인증
### 4. 제품 로드맵·시즌성
### 5. 리뷰·NPS·리텐션 시그널

700~1,100자. 없는 수치는 확인 필요.`
    );
  }

  private async generateMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName} (소비재/D2C)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 시장분석 (소비재 특화)
### 1. 카테고리 TAM · 소비자 트렌드
### 2. 경쟁 브랜드·점유율
### 3. 유통 채널 (D2C / 마켓플레이스 / 오프라인)
### 4. 대형 유통 의존도
### 5. 해외 진출 채널

700~1,100자.`
    );
  }

  private async generateFinancials(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.FINANCIAL_STATUS,
      `## 기업: ${input.companyName} (소비재/D2C)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 재무현황 (소비재 특화)
### 1. GMV · Net Revenue · YoY
### 2. 채널별 매출 비중 · AOV · 재구매율
### 3. CAC · ROAS · LTV
### 4. 손익 표 (총이익·영업이익)
### 5. 재고 회전·물류 비용

800~1,100자.`
    );
  }

  private async generateValuation(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.VALUATION,
      `## 기업: ${input.companyName} (소비재/D2C)
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 밸류에이션 (소비재 특화)
### 1. 라운드 요약
### 2. EV/매출 · EV/GMV
### 3. Peer comps (D2C/브랜드)
### 4. 브랜드 프리미엄 시나리오
### 5. Exit (전략 M&A · 유통사)

700~1,100자.`
    );
  }

  private async generateRisk(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.RISK_ANALYSIS,
      `## 기업: ${input.companyName} (소비재/D2C)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 리스크 (소비재 특화)
### 1. 마케팅 효율 악화 (CAC 상승)
### 2. 채널 집중·플랫폼 정책
### 3. 재고·시즌성·트렌드
### 4. 브랜드 평판·리콜
### 5. 완화 방안

700~1,000자.`
    );
  }
}
