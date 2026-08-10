import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import {
  buildInvestmentOverviewPrompt,
  OVERVIEW_SECTION,
  SECTOR_OVERVIEW_FLAVOR,
} from "./overview-helpers";

/**
 * Story — 콘텐츠/엔터테인먼트 전문 투자 심사역 에이전트.
 */
export class ContentAgent extends BaseAgent {
  constructor() {
    super(AgentType.CONTENT, DealSector.CONTENT);
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
          buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.CONTENT)
        );
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateIPAssessment(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateContentMarket(input);
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
    const systemPrompt = getSystemPrompt(AgentType.CONTENT, this.sector ?? input.sector);
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

  private async generateIPAssessment(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (콘텐츠/엔터)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 제품/IP (콘텐츠 특화)
### 1. 핵심 IP 포트폴리오·OSMU
### 2. 아티스트/크리에이터 계약
### 3. 유통·플랫폼·MAU
### 4. 수익 다변화 (공연/굿즈/라이선스)
### 5. 글로벌 확장

700~1,100자. 없는 수치는 확인 필요.`
    );
  }

  private async generateContentMarket(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 시장분석 (콘텐츠 특화)
### 1. TAM·한류 프리미엄
### 2. 경쟁 (HYBE/SM/JYP/YG/CJ ENM)
### 3. 팬덤 경제 지표
### 4. OTT/스트리밍 트렌드
### 5. 규제 (공정위·해외)

700~1,100자.`
    );
  }

  private async generateFinancials(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.FINANCIAL_STATUS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 재무현황 (콘텐츠 특화)
### 1. 매출 포트폴리오 (공연/앨범/라이선스/광고)
### 2. 손익·마진 구조
### 3. MG·선수금·이연수익
### 4. 아티스트 정산·원가
### 5. 현금·런웨이

700~1,100자.`
    );
  }

  private async generateValuation(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.VALUATION,
      `## 기업: ${input.companyName}
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 밸류에이션 (콘텐츠 특화)
### 1. 라운드 요약
### 2. EV/EBITDA · 구독자×ARPU
### 3. IP DCF
### 4. M&A comps (엔터)
### 5. Exit 시나리오

700~1,100자.`
    );
  }

  private async generateRisk(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.RISK_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 리스크 (콘텐츠 특화)
### 1. 아티스트 이탈·스캔들
### 2. IP 수명·흥행 변동성
### 3. 플랫폼 의존·정산
### 4. 해외 규제·환율
### 5. 완화 방안

700~1,000자.`
    );
  }
}
