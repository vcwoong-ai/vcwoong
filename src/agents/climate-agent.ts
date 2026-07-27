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
 * Climate — 기후/ESG 전문 투자 심사역 에이전트.
 * 탄소 크레딧, 정책 리스크, ESG 지표, 에너지 전환 분석에 특화.
 */
export class ClimateAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL, DealSector.CLIMATE);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    switch (sectionKey) {
      case SectionKey.INVESTMENT_OVERVIEW:
        return this.generateInvestmentOverview(input);
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateProduct(input);
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
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CLIMATE);
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

  private async generateInvestmentOverview(
    input: AgentInput
  ): Promise<GenerationResult> {
    return this.run(
      input,
      SectionKey.INVESTMENT_OVERVIEW,
      buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.CLIMATE)
    );
  }

  private async generateProduct(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (기후/ESG)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 제품/기술 (기후 특화)
### 1. 핵심 기술·솔루션 (탄소 감축/재생에너지/순환경제 등)
### 2. TRL·상용화 단계·파일럿 레퍼런스
### 3. 측정·검증 (MRV) · 인증 (VCS/Gold Standard/ISO 등)
### 4. IP·데이터 해자
### 5. 차별화 vs 기존 기술

700~1,100자. 없는 수치는 확인 필요.`
    );
  }

  private async generateMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName} (기후/ESG)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 시장분석 (기후 특화)
### 1. TAM (탄소 크레딧/재생에너지/순환경제 등) · 성장 드라이버
### 2. 정책·규제 (IRA, EU Green Deal, K-탄소중립, CBAM, K-ETS)
### 3. 의무/자발적 탄소 시장 구분
### 4. 경쟁·기술 성숙도·진입장벽
### 5. ESG 수요 (기관투자자, Scope 3, K-ESG)

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
      `## 기업: ${input.companyName} (기후/ESG)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 재무현황 (기후 특화)
### 1. 손익 요약 (최근 3개년) — 매출·총이익·영업이익
### 2. 수익 모델 (크레딧 판매 / SaaS / EPC / 구독)
### 3. 보조금·세액공제 의존도 및 자립 타임라인
### 4. Capex·프로젝트 파이프라인
### 5. 현금흐름·런웨이

800~1,100자.`
    );
  }

  private async generateValuation(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.VALUATION,
      `## 기업: ${input.companyName} (기후/ESG)
${input.investRound ? `- 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 밸류에이션 (기후 특화)
### 1. 라운드 요약
### 2. 프로젝트 NPV / 크레딧 단가 시나리오
### 3. EV/매출 · Peer comps (클린테크)
### 4. 정책 프리미엄/디스카운트
### 5. Exit 시나리오 (전략 M&A · 인프라 펀드)

700~1,100자.`
    );
  }

  private async generateRisk(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.RISK_ANALYSIS,
      `## 기업: ${input.companyName} (기후/ESG)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 리스크 (기후 특화)
### 1. 정책·보조금 변동
### 2. 기술·상용화 지연
### 3. 탄소 시장·크레딧 가격/인증
### 4. Capex·보조금 의존 재무
### 5. 그린워싱·공시 리스크 및 완화 방안

700~1,000자.`
    );
  }
}
