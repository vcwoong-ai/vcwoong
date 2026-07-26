import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * Maker — 제조/하드웨어 전문 투자 심사역 에이전트.
 */
export class ManufacturingAgent extends BaseAgent {
  constructor() {
    super(AgentType.MANUFACTURING, DealSector.MANUFACTURING);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    switch (sectionKey) {
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateProductionCapability(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateMarket(input);
      case SectionKey.FINANCIAL_STATUS:
        return this.generateManufacturingFinancials(input);
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
    const systemPrompt = getSystemPrompt(AgentType.MANUFACTURING);
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

  private async generateProductionCapability(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.PRODUCT_TECHNOLOGY,
      `## 기업: ${input.companyName} (제조/하드웨어)
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 제품/기술 (제조 특화)
### 1. 핵심 제품 포트폴리오·GPM
### 2. 생산 기술·특허·소부장 자립화
### 3. 품질 인증·OEM/ODM 레퍼런스
### 4. 설비·스마트팩토리
### 5. R&D 인력·정부과제

700~1,100자. 없는 수치는 확인 필요.`
    );
  }

  private async generateMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.MARKET_ANALYSIS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 시장분석 (제조 특화)
### 1. TAM/수요 사이클 (전방산업)
### 2. 경쟁·대체재·수입 대체
### 3. 고객 집중도·장기 공급계약
### 4. 지정학·공급망 트렌드
### 5. 정부 정책 (소부장·스마트공장)

700~1,100자.`
    );
  }

  private async generateManufacturingFinancials(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    return this.run(
      input,
      SectionKey.FINANCIAL_STATUS,
      `## 기업: ${input.companyName}
${input.additionalContext ?? ""}

## 자료
${documentContext}

## 재무현황 (제조 특화)
### 1. 손익 표 (최근 3개년) — 매출총이익·EBITDA
### 2. BOM·고정비/변동비
### 3. CAPA·가동률·Capex
### 4. 공급망·재고일수
### 5. 현금흐름·부채·이자보상

800~1,100자.`
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

## 밸류에이션 (제조 특화)
### 1. 라운드 요약
### 2. EV/EBITDA · EV/매출
### 3. 자산+영업권 / DCF
### 4. Peer comps
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

## 리스크 (제조 특화)
### 1. 원가·원자재 변동
### 2. 단일 고객/공급사 의존
### 3. 양산·수율·품질
### 4. Capex·운전자본
### 5. 완화 방안

700~1,000자.`
    );
  }
}
