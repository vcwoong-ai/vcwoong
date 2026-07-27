import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import { formatSaaSAnalysisForPrompt } from "@/lib/it/saas-extract";
import {
  buildInvestmentOverviewPrompt,
  OVERVIEW_SECTION,
  SECTOR_OVERVIEW_FLAVOR,
} from "./overview-helpers";

/**
 * IT/Software/Platform specialized investment agent.
 * Enhanced with SaaS metrics, product/market/risk sections.
 */
export class ITAgent extends BaseAgent {
  constructor() {
    super(AgentType.IT, DealSector.IT);
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
          buildInvestmentOverviewPrompt(input, SECTOR_OVERVIEW_FLAVOR.IT)
        );
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateITProduct(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateITMarket(input);
      case SectionKey.FINANCIAL_STATUS:
        return this.generateITFinancials(input);
      case SectionKey.VALUATION:
        return this.generateITValuation(input);
      case SectionKey.RISK_ANALYSIS:
        return this.generateITRisk(input);
      default:
        return super.generateSection(input, sectionKey);
    }
  }

  private async run(
    input: AgentInput,
    sectionKey: SectionKey,
    userPrompt: string
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.IT, DealSector.IT);
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

  private async generateITProduct(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const saasAnalysis = formatSaaSAnalysisForPrompt(documentContext);
    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/SaaS
${input.additionalContext ? `\n${input.additionalContext}` : ""}

## 제공 자료
${documentContext}${saasAnalysis}

## 제품/기술 섹션 (IT/SaaS 특화)

### 1. 제품 개요 및 핵심 가치제안
### 2. 기술 아키텍처·확장성·보안
### 3. 제품 성숙도 (PLG/SLG, 온보딩, 리텐션 기능)
### 4. 로드맵 및 차별화 (Moat)
### 5. 경쟁 제품 대비 포지셔닝

규칙: IR에 없는 수치는 "확인 필요". 분량 700~1,100자.`;
    return this.run(input, SectionKey.PRODUCT_TECHNOLOGY, userPrompt);
  }

  private async generateITMarket(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const saasAnalysis = formatSaaSAnalysisForPrompt(documentContext);
    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/SaaS
${input.additionalContext ? `\n${input.additionalContext}` : ""}

## 제공 자료
${documentContext}${saasAnalysis}

## 시장분석 섹션 (IT/SaaS 특화)

### 1. TAM/SAM/SOM 및 성장 드라이버
### 2. ICP·구매 프로세스·세일즈 사이클
### 3. 경쟁 구도 (직접/간접/대체)
### 4. GTM (PLG/SLG/파트너)
### 5. 네트워크 효과·고착성

분량 700~1,100자. 출처 표기.`;
    return this.run(input, SectionKey.MARKET_ANALYSIS, userPrompt);
  }

  private async generateITFinancials(
    input: AgentInput
  ): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const saasAnalysis = formatSaaSAnalysisForPrompt(documentContext);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/소프트웨어
${input.additionalContext ? `\n${input.additionalContext}` : ""}

## 제공 자료
${documentContext}${saasAnalysis}

## 재무현황 섹션 작성 요청 (IT/SaaS 특화)

다음 구조로 **재무현황** 섹션을 작성해주세요:

### 1. 핵심 SaaS/플랫폼 지표 (해당 시)
- ARR, MRR, NRR/NDR, Churn, CAC, LTV, LTV/CAC, Magic Number, Payback
- 위 SaaS 자동 분석 수치가 있으면 반드시 인용 (출처: IR/자동추출)

### 2. 전통 손익 요약 (최근 3개년 + 당해)
| 구분 | FY-2 | FY-1 | FY | FY+1E |
|------|------|------|------|-------|
| 매출액 | | | | |
| 매출총이익 (%) | | | | |
| 영업이익(손실) | | | | |

### 3. 매출 구조·고객 집중도
### 4. Unit Economics
### 5. 현금 포지션 & 런웨이

분량: 800~1,100자. 없는 숫자는 확인 필요.`;

    return this.run(input, SectionKey.FINANCIAL_STATUS, userPrompt);
  }

  private async generateITValuation(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const saasAnalysis = formatSaaSAnalysisForPrompt(documentContext);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/SaaS
${input.investRound ? `- 투자 라운드: ${input.investRound}` : ""}
${input.valuation ? `- Post-money: ${input.valuation}억원` : ""}
${input.additionalContext ? `\n${input.additionalContext}` : ""}

## 제공 자료
${documentContext}${saasAnalysis}

## 밸류에이션 섹션 (IT/SaaS 특화)

SaaS 자동 분석(ARR 배수, Bessemer 벤치마크)을 반드시 활용:

### 1. 이번 라운드 요약 (Pre/Post, 지분, 용도)
### 2. ARR 배수 밸류에이션 (임플라이드 vs 요청 밸류)
### 3. Rule of 40 / NRR 기반 프리미엄·디스카운트
### 4. Peer Group 비교 (국내외 SaaS, 출처 표기)
### 5. Exit 시나리오 및 목표 IRR/MoM

분량: 800~1,200자.`;

    return this.run(input, SectionKey.VALUATION, userPrompt);
  }

  private async generateITRisk(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const saasAnalysis = formatSaaSAnalysisForPrompt(documentContext);
    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/SaaS
${input.additionalContext ? `\n${input.additionalContext}` : ""}

## 제공 자료
${documentContext}${saasAnalysis}

## 리스크 분석 (IT/SaaS 특화)

### 1. 성장/리텐션 리스크 (NRR, Churn)
### 2. 판매 효율 리스크 (CAC, Magic Number)
### 3. 경쟁·상품 대체 리스크
### 4. 기술·보안·컴플라이언스
### 5. 런웨이·추가 조달 리스크
### 6. 완화 방안

분량 700~1,000자.`;
    return this.run(input, SectionKey.RISK_ANALYSIS, userPrompt);
  }
}
