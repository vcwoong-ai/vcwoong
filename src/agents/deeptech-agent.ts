import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import { formatDeepTechAnalysisForPrompt } from "@/lib/deeptech/infra-extract";
import {
  buildInvestmentOverviewPrompt,
  OVERVIEW_SECTION,
  SECTOR_OVERVIEW_FLAVOR,
} from "./overview-helpers";

/**
 * Neuron — AI/딥테크 전문 투자 심사역 에이전트.
 */
export class DeepTechAgent extends BaseAgent {
  constructor() {
    super(AgentType.DEEPTECH, DealSector.DEEPTECH);
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
          buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.DEEPTECH)
        );
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateTechAssessment(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateMarket(input);
      case SectionKey.FINANCIAL_STATUS:
        return this.generateFinancials(input);
      case SectionKey.VALUATION:
        return this.generateDeepTechValuation(input);
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
    const systemPrompt = getSystemPrompt(AgentType.DEEPTECH);
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

  private async generateTechAssessment(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const infraAnalysis = formatDeepTechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (AI/딥테크)
${input.additionalContext ?? ""}

## 자료
${documentContext}${infraAnalysis}

## 제품/기술 (딥테크 특화)
### 1. 핵심 기술·TRL
### 2. 모델/데이터 해자 (해당 시) + GPU 비용 힌트 활용
### 3. IP·논문
### 4. 차별성·해자
### 5. 상업화 로드맵·레퍼런스

800~1,200자. 없는 수치 확인 필요.`
    );
  }

  private async generateMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const infraAnalysis = formatDeepTechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}${infraAnalysis}

## 시장분석 (딥테크)
### 1. TAM·채택 사이클
### 2. 경쟁 기술/오픈소스
### 3. 바이어(엔터프라이즈/정부/빅테크)
### 4. Go-to-market
### 5. 표준·규제

700~1,100자.`
    );
  }

  private async generateFinancials(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const infraAnalysis = formatDeepTechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.FINANCIAL_STATUS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}${infraAnalysis}

## 재무현황 (딥테크)
### 1. 매출·그로스마진 (있는 경우)
### 2. R&D·GPU/클라우드 비용 구조
### 3. 번레이트·런웨이
### 4. 유닛 이코노믹스 (인퍼런스 마진)
### 5. 자금 조달 이력

700~1,100자.`
    );
  }

  private async generateDeepTechValuation(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const infraAnalysis = formatDeepTechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.VALUATION,
      `## 기업: ${input.companyName}
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${documentContext}${infraAnalysis}

## 밸류에이션 (딥테크)
### 1. 라운드 요약
### 2. TRL 할증/할인
### 3. AI SaaS ARR 배수 / 전략적 M&A comps
### 4. Bull/Base/Bear Exit
### 5. 전략적 가치

700~1,100자.`
    );
  }

  private async generateRisk(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const infraAnalysis = formatDeepTechAnalysisForPrompt(documentContext);
    return this.run(
      input,
      SectionKey.RISK_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}${infraAnalysis}

## 리스크 (딥테크)
### 1. 기술·TRL 리스크
### 2. 데이터/모델 대체·오픈소스
### 3. 인프라 비용·마진
### 4. IP·인재
### 5. 완화 방안

700~1,000자.`
    );
  }
}
