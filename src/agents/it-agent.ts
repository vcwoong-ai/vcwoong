import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * IT/Software/Platform specialized investment agent.
 * Enhanced with SaaS metrics and platform economics.
 */
export class ITAgent extends BaseAgent {
  constructor() {
    super(AgentType.IT, DealSector.IT);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.FINANCIAL_STATUS) {
      return this.generateITFinancials(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateITFinancials(
    input: AgentInput
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.IT, DealSector.IT);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: IT/소프트웨어

## 제공 자료
${documentContext}

## 재무현황 섹션 작성 요청 (IT/SaaS 특화)

다음 구조로 **재무현황** 섹션을 작성해주세요:

### 1. 핵심 SaaS/플랫폼 지표 (해당 시)
- ARR (Annual Recurring Revenue) 및 성장률 YoY
- MRR Trend (최근 12개월)
- NRR (Net Revenue Retention) / NDR
- Churn Rate (월간/연간)
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value) 및 LTV/CAC 비율
- Magic Number (영업 효율성)
- Payback Period

### 2. 전통 손익 요약 (최근 3개년 + 당해)
| 구분 | FY22 | FY23 | FY24 | FY25E |
|------|------|------|------|-------|
| 매출액 | | | | |
| 매출원가 | | | | |
| 매출총이익 (%) | | | | |
| 영업이익(손실) | | | | |
| 당기순이익(손실) | | | | |

### 3. 매출 구조
- 반복 매출 vs 비반복 매출 비중
- 제품/서비스별 매출 분해
- 고객 집중도 (Top 5 고객 비중)

### 4. Unit Economics
- 채널별 CAC 비교
- 코호트별 LTV 분석

### 5. 현금 포지션 & 런웨이
- 현금 보유액
- 월 번 레이트 (현금 소모 속도)
- 예상 런웨이 (개월)

분량: 800~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return {
      sectionKey: SectionKey.FINANCIAL_STATUS,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }
}
