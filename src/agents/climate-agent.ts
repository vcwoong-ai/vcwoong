import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * 기후/ESG 전문 투자 심사역 에이전트.
 * 탄소 크레딧, 정책 리스크, ESG 지표, 에너지 전환 분석에 특화.
 */
export class ClimateAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL, DealSector.CLIMATE);
  }

  async generateSection(input: AgentInput, sectionKey: SectionKey): Promise<GenerationResult> {
    if (sectionKey === SectionKey.MARKET_ANALYSIS) return this.generateClimateMarket(input);
    if (sectionKey === SectionKey.RISK_ANALYSIS) return this.generateClimateRisk(input);
    return super.generateSection(input, sectionKey);
  }

  private async generateClimateMarket(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CLIMATE);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 기업: ${input.companyName} (기후/ESG)
## 자료: ${documentContext}

## 시장분석 섹션 작성 (기후/ESG 특화)

### 1. 글로벌 기후 시장 규모
- 해당 기술/서비스 TAM (탄소 크레딧/재생에너지/순환경제 등)
- 넷제로 정책 드라이버 (IRA, EU Green Deal, 한국 탄소중립법)

### 2. 정책 및 규제 환경
- 탄소국경조정제도(CBAM), 배출권거래제(K-ETS) 현황
- 의무/자발적 탄소 시장 구분

### 3. 경쟁 구도
- 동일 분야 국내외 기업 현황
- 기술 성숙도 및 진입장벽

### 4. ESG 트렌드
- 기관투자자 ESG 의무화, K-ESG 가이드라인
- 공급망 Scope 3 배출 요건

분량: 700~900자, 문어체`;

    const result = await generateText([{ role: "user", content: userPrompt }], { systemPrompt, maxTokens: 3000 });
    return { sectionKey: SectionKey.MARKET_ANALYSIS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateClimateRisk(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.GENERAL, DealSector.CLIMATE);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 기업: ${input.companyName} (기후/ESG)
## 자료: ${documentContext}

## 리스크 분석 섹션 (기후/ESG 특화)

### 1. 정책 리스크
- 정권 교체에 따른 기후 정책 후퇴 가능성
- 보조금/세액공제 변동 리스크

### 2. 기술 리스크
- 기술 성숙도(TRL) 및 상용화 타임라인
- 대체 기술 등장 가능성

### 3. 탄소 시장 리스크
- 배출권 가격 변동성
- 크레딧 인증 기준 강화

### 4. 재무 리스크
- 보조금 의존도 및 자립 타임라인
- 자본집약적 특성에 따른 Capex 리스크

### 5. 그린워싱 리스크
- ESG 측정·검증 신뢰성
- 규제 강화에 따른 공시 부담

분량: 700~900자, 문어체`;

    const result = await generateText([{ role: "user", content: userPrompt }], { systemPrompt, maxTokens: 3000 });
    return { sectionKey: SectionKey.RISK_ANALYSIS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }
}
