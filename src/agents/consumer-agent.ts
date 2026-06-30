import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * 소비재/D2C 전문 투자 심사역 에이전트.
 * 브랜드 파워, D2C 지표, 유통 채널, 소비자 트렌드 분석에 특화.
 */
export class ConsumerAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL, DealSector.CONSUMER);
  }

  async generateSection(input: AgentInput, sectionKey: SectionKey): Promise<GenerationResult> {
    if (sectionKey === SectionKey.FINANCIAL_STATUS) return this.generateConsumerFinancials(input);
    if (sectionKey === SectionKey.MARKET_ANALYSIS) return this.generateConsumerMarket(input);
    return super.generateSection(input, sectionKey);
  }

  private async generateConsumerFinancials(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CONSUMER);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 기업: ${input.companyName} (소비재/D2C)
## 자료: ${documentContext}

## 재무현황 섹션 (소비재 특화)

### 1. 핵심 소비재 지표
- GMV (총 거래액) 및 YoY 성장률
- 채널별 매출 비중 (온라인/오프라인/해외)
- 반복 구매율 (Repeat Purchase Rate)
- 평균 주문 금액 (AOV) 및 객단가

### 2. 브랜드/마케팅 효율
- CAC (채널별 신규 고객 획득 비용)
- ROAS (광고 수익률)
- 재구매 고객 비중 및 LTV

### 3. 손익 요약
| 구분 | FY22 | FY23 | FY24 | FY25E |
|------|------|------|------|-------|
| GMV | | | | |
| 매출 (Net Revenue) | | | | |
| 매출총이익률 | | | | |
| 영업이익 | | | | |

### 4. 재고·물류
- 재고 회전율 및 SKU 관리 현황
- 물류 내재화 vs 외주화 비용

분량: 800~1,000자, 문어체`;

    const result = await generateText([{ role: "user", content: userPrompt }], { systemPrompt, maxTokens: 3000 });
    return { sectionKey: SectionKey.FINANCIAL_STATUS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateConsumerMarket(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CONSUMER);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 기업: ${input.companyName} (소비재/D2C)
## 자료: ${documentContext}

## 시장분석 섹션 (소비재 특화)

### 1. 시장 규모
- 카테고리별 국내/글로벌 TAM
- 소비자 트렌드 (건강, 친환경, 프리미엄, MZ 소비 패턴)

### 2. 경쟁 구도
- 주요 경쟁 브랜드 및 시장점유율
- 대형 유통사(쿠팡, 배민, 무신사 등) 의존도

### 3. 유통 채널 분석
- D2C vs 멀티채널 전략 적합성
- 해외 진출 채널 (아마존, 쇼피, 글로벌 D2C)

### 4. 브랜드 파워
- 소비자 인지도, SNS 팔로워, NPS
- 리뷰·평점 현황

분량: 700~900자, 문어체`;

    const result = await generateText([{ role: "user", content: userPrompt }], { systemPrompt, maxTokens: 3000 });
    return { sectionKey: SectionKey.MARKET_ANALYSIS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }
}
