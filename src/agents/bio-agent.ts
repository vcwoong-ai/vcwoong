import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * Dr. Cell — Specialized biohealth investment agent.
 * Adds clinical NPV/rNPV modeling to valuation sections.
 *
 * Clinical phase success probabilities (industry average):
 *   Phase I   → Phase II:  60%
 *   Phase II  → Phase III: 40%
 *   Phase III → NDA/BLA:   65%
 *   NDA/BLA   → Approval:  90%
 *
 * rNPV = Σ (NPV_i × PoS_i) for each pipeline asset
 */
export class BioAgent extends BaseAgent {
  constructor() {
    super(AgentType.BIO, DealSector.BIO);
  }

  /**
   * Override valuation section with rNPV-enhanced prompt.
   */
  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.VALUATION) {
      return this.generateBioValuation(input);
    }
    if (sectionKey === SectionKey.PRODUCT_TECHNOLOGY) {
      return this.generateBioPipeline(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateBioValuation(
    input: AgentInput
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어
${input.investRound ? `- 투자 라운드: ${input.investRound}` : ""}
${input.investAmount ? `- 투자 금액: ${input.investAmount.toLocaleString()}억원` : ""}
${input.valuation ? `- 투자 후 기업가치: ${input.valuation.toLocaleString()}억원` : ""}

## 제공 자료
${documentContext}

## 밸류에이션 섹션 작성 요청 (바이오 특화)

다음 구조로 **밸류에이션** 섹션을 작성해주세요:

### 1. 이번 라운드 요약
- Pre/Post-money 밸류에이션
- 투자 단계 및 자금 용도

### 2. rNPV 분석 (파이프라인별)
각 파이프라인 자산에 대해:
- 파이프라인명 및 타겟 적응증
- 현재 임상 단계 및 다음 이정표
- 피크 매출 추정 (시장 규모 × 예상 점유율 × 침투율)
- 임상 성공 확률(PoS) 적용:
  * Phase I 이전: ~15%
  * Phase I: ~25%  
  * Phase II: ~15%
  * Phase III: ~50%
  * 허가 완료: ~90%
- rNPV = NPV × PoS (할인율 10~15% 적용)

### 3. 비교 밸류에이션 (Comps)
- 유사 임상 단계 바이오텍 M&A 사례 (최근 3년)
- 유사 상장 바이오텍 EV/파이프라인 배수

### 4. 밸류에이션 적정성 검토
- 총 rNPV 대비 요청 밸류에이션 비교
- 할증/할인 요인

### 5. 예상 수익률
- Exit 시나리오별 (IPO / M&A / 기술이전)
- 목표 IRR 및 MoM

분량: 800~1,200자 (한글 기준), 문어체 사용`;

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

  private async generateBioPipeline(
    input: AgentInput
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어

## 제공 자료
${documentContext}

## 제품/기술 섹션 작성 요청 (바이오 특화)

다음 구조로 **제품/기술** 섹션을 작성해주세요:

### 1. 핵심 파이프라인 현황
각 파이프라인에 대해:
- 제품명 / 타겟 / 적응증
- 개발 단계 (전임상/IND/Phase I/II/III/NDA)
- 작용 기전 (MoA: Mechanism of Action)
- 다음 주요 이정표 및 예상 시점
- 경쟁 약물 현황 (Best-in-class vs First-in-class)

### 2. 핵심 기술 플랫폼
- 플랫폼 기술의 특성 및 차별성
- 확장 가능성 (파이프라인 확장, 기술이전)

### 3. IP 포트폴리오
- 보유 특허 수 및 핵심 특허 목록
- 물질특허 만료일 (화합물/생물의약품)
- FTO (Freedom to Operate) 현황

### 4. 규제 전략
- 국내 (MFDS) / 글로벌 (FDA/EMA) 허가 전략
- 희귀의약품 지정, 패스트트랙 등 특별 허가 제도 활용

### 5. 글로벌 BD 전략
- 기술이전/라이선아웃 계획
- 마일스톤 구조 (Upfront / 개발 마일스톤 / 판매 로열티)

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
}
