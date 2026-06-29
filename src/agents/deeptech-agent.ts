import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * Neuron — AI/딥테크 전문 투자 심사역 에이전트.
 * 기술 성숙도(TRL), AI 유닛 이코노믹스, 딥테크 IP 분석에 특화.
 */
export class DeepTechAgent extends BaseAgent {
  constructor() {
    super(AgentType.DEEPTECH, DealSector.DEEPTECH);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.PRODUCT_TECHNOLOGY) {
      return this.generateTechAssessment(input);
    }
    if (sectionKey === SectionKey.VALUATION) {
      return this.generateDeepTechValuation(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateTechAssessment(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.DEEPTECH);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: AI/딥테크

## 제공 자료
${documentContext}

## 제품/기술 섹션 작성 요청 (AI/딥테크 특화)

다음 구조로 **제품/기술** 섹션을 작성해주세요:

### 1. 핵심 기술 개요
- 기술 분류 (AI/ML, 반도체, 로봇, 양자컴퓨팅 등)
- TRL (Technology Readiness Level) 현황 (1~9 단계)
- 기술 원천 (자체개발/대학 스핀오프/라이선스)

### 2. AI/모델 역량 (AI 기업 해당 시)
- 모델 아키텍처 및 파라미터 규모
- 학습 데이터 규모 및 독점 데이터 확보 전략
- 성능 벤치마크 (업계 표준 대비)
- GPU/클라우드 인프라 비용 및 인퍼런스 마진

### 3. IP 포트폴리오
- 핵심 특허 및 논문 (피인용수 포함)
- 기술이전/라이선스 현황
- FTO(Freedom to Operate) 검토

### 4. 기술 차별성 및 해자
- 경쟁 기술 대비 성능/비용/속도 우위
- 데이터 해자, 네트워크 효과, 전환 비용

### 5. 상업화 로드맵
- 파일럿 → 양산/서비스화 타임라인
- 주요 레퍼런스 고객 및 POC 결과

분량: 800~1,200자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return {
      sectionKey: SectionKey.PRODUCT_TECHNOLOGY,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }

  private async generateDeepTechValuation(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.DEEPTECH);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: AI/딥테크
${input.investRound ? `- 투자 라운드: ${input.investRound}` : ""}
${input.investAmount ? `- 투자 금액: ${input.investAmount.toLocaleString()}억원` : ""}
${input.valuation ? `- Post-money 밸류에이션: ${input.valuation.toLocaleString()}억원` : ""}

## 제공 자료
${documentContext}

## 밸류에이션 섹션 작성 요청 (AI/딥테크 특화)

### 1. 이번 라운드 요약
- Pre/Post-money 밸류에이션, 투자 조건

### 2. 기술 가치 평가
- TRL 단계별 가치 할증/할인 (TRL 1~4: 기술 리스크 프리미엄 50~80%)
- 특허 포트폴리오 가치 추산

### 3. 비교 밸류에이션 (AI/딥테크 Comps)
- 국내외 유사 AI 스타트업 최근 라운드 배수
- ARR 대비 NTM 배수 (AI SaaS: 20~60x ARR)
- 전략적 M&A 프리미엄 (빅테크 인수 사례)

### 4. DCF 가정 및 시나리오
- Bull/Base/Bear 시나리오별 Exit 가치
- 할인율 및 Terminal Value 가정

### 5. 전략적 가치
- 잠재 인수자 및 인수 시너지 분석
- 기술이전 로열티 옵션 가치

분량: 700~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return {
      sectionKey: SectionKey.VALUATION,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }
}
