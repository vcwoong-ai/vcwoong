import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import { calculateRNPV, formatRNPVTable, type PipelineAsset } from "@/lib/bio/rnpv";
import {
  fetchBioExternalData,
  formatExternalDataForPrompt,
  type BioExternalData,
} from "@/lib/bio/external-data";
import { buildBioAppendix } from "@/lib/bio/appendix";

/**
 * Dr. Cell — 바이오/헬스케어 전문 투자 심사역 에이전트.
 *
 * 일반 에이전트와의 차별점:
 * 1. PubMed 실제 논문 데이터 주입
 * 2. ClinicalTrials.gov 임상 현황 실시간 조회
 * 3. OpenFDA 경쟁 약물 현황
 * 4. rNPV 수치 계산기 (임상 단계별 PoS 적용)
 */
export class BioAgent extends BaseAgent {
  // 섹션 생성 중 외부 데이터 캐시 (한 번만 조회 후 재사용)
  private _externalData: BioExternalData | null = null;
  private _externalDataFetching: Promise<BioExternalData> | null = null;

  constructor() {
    super(AgentType.BIO, DealSector.BIO);
  }

  /** 외부 데이터 로드 (중복 호출 방지) */
  private async getExternalData(input: AgentInput): Promise<BioExternalData> {
    if (this._externalData) return this._externalData;

    if (!this._externalDataFetching) {
      const docText = input.documents
        .map((d) => d.parsedText ?? "")
        .join("\n")
        .slice(0, 5000);

      this._externalDataFetching = fetchBioExternalData(input.companyName, docText)
        .then((data) => {
          this._externalData = data;
          return data;
        });
    }

    return this._externalDataFetching;
  }

  async generateSection(input: AgentInput, sectionKey: SectionKey): Promise<GenerationResult> {
    // 외부 데이터가 필요한 섹션에서만 사전 로드
    if (
      sectionKey === SectionKey.PRODUCT_TECHNOLOGY ||
      sectionKey === SectionKey.VALUATION ||
      sectionKey === SectionKey.MARKET_ANALYSIS ||
      sectionKey === SectionKey.RISK_ANALYSIS ||
      sectionKey === SectionKey.APPENDIX
    ) {
      await this.getExternalData(input);
    }

    switch (sectionKey) {
      case SectionKey.PRODUCT_TECHNOLOGY:
        return this.generateBioPipeline(input);
      case SectionKey.VALUATION:
        return this.generateBioValuation(input);
      case SectionKey.MARKET_ANALYSIS:
        return this.generateBioMarket(input);
      case SectionKey.RISK_ANALYSIS:
        return this.generateBioRisk(input);
      case SectionKey.APPENDIX:
        return this.generateBioAppendix(input);
      default:
        return super.generateSection(input, sectionKey);
    }
  }

  // ──────────────────────────────────────────────────
  // rNPV 보조 메서드
  // ──────────────────────────────────────────────────

  private extractPipelineHints(documentContext: string, companyName: string): PipelineAsset[] {
    const phasePatterns: Array<{ pattern: RegExp; phase: PipelineAsset["phase"] }> = [
      { pattern: /phase\s*3|phase\s*III|임상\s*3상/i, phase: "PHASE3" },
      { pattern: /phase\s*2|phase\s*II|임상\s*2상/i, phase: "PHASE2" },
      { pattern: /phase\s*1|phase\s*I|임상\s*1상/i, phase: "PHASE1" },
      { pattern: /전임상|preclinical/i, phase: "PRECLINICAL" },
      { pattern: /NDA|BLA|허가\s*신청/i, phase: "NDA" },
    ];
    for (const { pattern, phase } of phasePatterns) {
      if (pattern.test(documentContext)) {
        return [{
          name: `${companyName} 주요 파이프라인`,
          indication: "주요 적응증",
          phase,
          peakRevenueBillionKRW: 5000,
          marketPenetration: 0.05,
          royaltyRate: 0.10,
        }];
      }
    }
    return [];
  }

  // ──────────────────────────────────────────────────
  // 섹션별 생성 메서드
  // ──────────────────────────────────────────────────

  private async generateBioPipeline(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);
    const externalData = this._externalData;
    const externalContext = externalData ? formatExternalDataForPrompt(externalData) : "";

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어

## 제공 자료 (IR 덱 등 업로드 문서)
${documentContext}${externalContext}

## 제품/기술 섹션 작성 요청 (바이오 특화)

위 외부 데이터(ClinicalTrials.gov 임상 현황, PubMed 논문, FDA 승인 경쟁약물)를 반드시 인용하며 다음 구조로 작성하세요:

### 1. 핵심 파이프라인 현황
각 파이프라인에 대해:
- 제품명 / 타겟 / 적응증
- 개발 단계 (전임상/IND/Phase I/II/III/NDA)
- 작용 기전 (MoA)
- 다음 주요 이정표 및 예상 시점
- 동일 적응증 임상시험 현황 (위 ClinicalTrials 데이터 인용)

### 2. 핵심 기술 플랫폼
- 플랫폼 기술의 특성 및 차별성
- 관련 PubMed 논문 근거 인용 (위 논문 데이터 활용)
- 확장 가능성 (파이프라인 확장, 기술이전)

### 3. IP 포트폴리오
- 보유 특허 수 및 핵심 특허 목록
- 물질특허 만료일
- FTO 현황

### 4. 경쟁 환경
- FDA 승인 경쟁 약물 현황 (위 FDA 데이터 인용)
- Best-in-class vs First-in-class 포지셔닝

### 5. 글로벌 BD 전략
- 기술이전/라이선아웃 계획
- 마일스톤 구조

분량: 900~1,400자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return { sectionKey: SectionKey.PRODUCT_TECHNOLOGY, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateBioValuation(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);
    const externalData = this._externalData;
    const externalContext = externalData ? formatExternalDataForPrompt(externalData) : "";

    // rNPV 계산
    const pipelineHints = this.extractPipelineHints(documentContext, input.companyName);
    const rnpvResult = calculateRNPV(pipelineHints);
    const rnpvTable = pipelineHints.length > 0 ? formatRNPVTable(rnpvResult) : "";
    const rnpvContext = rnpvTable
      ? `\n\n## 사전 계산된 rNPV 참고 테이블 (문서 기반 추정)\n${rnpvTable}\n위 수치를 참고하되, 실제 자료의 구체적 수치로 보완/수정하세요.`
      : "";

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어
${input.investRound ? `- 투자 라운드: ${input.investRound}` : ""}
${input.investAmount ? `- 투자 금액: ${input.investAmount.toLocaleString()}억원` : ""}
${input.valuation ? `- 투자 후 기업가치: ${input.valuation.toLocaleString()}억원` : ""}

## 제공 자료
${documentContext}${rnpvContext}${externalContext}

## 밸류에이션 섹션 작성 요청 (바이오 특화)

위 외부 데이터를 반드시 활용하여 다음 구조로 작성하세요:

### 1. 이번 라운드 요약
- Pre/Post-money 밸류에이션, 투자 단계 및 자금 용도

### 2. rNPV 분석 (파이프라인별)
- 파이프라인명 및 타겟 적응증
- 현재 임상 단계 및 ClinicalTrials.gov 동일 적응증 경쟁 임상 현황 인용
- 피크 매출 추정 (시장 규모 × 예상 점유율)
- PoS 적용: Phase I 15% / Phase II 38% / Phase III 59% / NDA 90%
- rNPV = NPV × PoS (할인율 12% 적용)
- 위 rNPV 참고 테이블을 수치 근거로 활용

### 3. 비교 밸류에이션 (Comps)
- FDA 승인 경쟁 약물 보유사 시가총액 배수 비교 (위 FDA 데이터 활용)
- 유사 임상 단계 바이오텍 M&A 사례

### 4. 밸류에이션 적정성 검토
- 총 rNPV 대비 요청 밸류에이션 비교

### 5. 예상 수익률
- Exit 시나리오별 (IPO / M&A / 기술이전), 목표 IRR 및 MoM

분량: 900~1,300자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return { sectionKey: SectionKey.VALUATION, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateBioMarket(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);
    const externalData = this._externalData;
    const externalContext = externalData ? formatExternalDataForPrompt(externalData) : "";

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어

## 제공 자료
${documentContext}${externalContext}

## 시장분석 섹션 작성 요청 (바이오 특화)

위 외부 데이터를 반드시 활용하여 다음 구조로 작성하세요:

### 1. 글로벌 시장 규모 및 성장성
- 해당 적응증 글로벌 TAM / SAM (시장조사 기관 수치 인용)
- 연평균 성장률(CAGR) 및 성장 드라이버

### 2. 경쟁 환경
- FDA 승인 현황 (위 FDA 데이터 인용하여 주요 경쟁사 분석)
- 동일 적응증 임상시험 현황 (위 ClinicalTrials 데이터 활용)
- First-in-class vs Best-in-class 포지셔닝 분석

### 3. 규제 환경
- 미국 FDA / 유럽 EMA / 한국 MFDS 동향
- 희귀의약품, 패스트트랙, 혁신치료제 등 특별 제도

### 4. 보험/급여 환경
- 국내 건강보험 급여 가능성
- 미국 CMS, 민간보험 적용 전망

분량: 700~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return { sectionKey: SectionKey.MARKET_ANALYSIS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateBioRisk(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
    const documentContext = this.buildDocumentContext(input.documents);
    const externalData = this._externalData;
    const externalContext = externalData ? formatExternalDataForPrompt(externalData) : "";

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 바이오/헬스케어

## 제공 자료
${documentContext}${externalContext}

## 리스크 분석 섹션 작성 요청 (바이오 특화)

위 임상 데이터와 경쟁 약물 현황을 활용하여 다음 구조로 작성하세요:

### 1. 임상 리스크
- 현재 단계 임상 실패 가능성 (PoS 기반)
- ClinicalTrials 데이터 기준 동일 타겟 경쟁 임상 위협
- 임상 디자인의 취약점

### 2. 경쟁 리스크
- FDA 승인 경쟁 약물 대비 차별화 부족 시나리오
- Best-in-class 달성 실패 시 시장 진입 장벽

### 3. 규제 리스크
- MFDS/FDA 허가 지연 또는 거절 시나리오
- 임상 프로토콜 변경 요구 가능성

### 4. 재무/운영 리스크
- 추가 자금 조달 필요성 (런웨이 분석)
- 핵심 연구인력 이탈 위험

### 5. 리스크 완화 방안

분량: 700~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return { sectionKey: SectionKey.RISK_ANALYSIS, content: result.content, tokensUsed: result.inputTokens + result.outputTokens };
  }

  private async generateBioAppendix(input: AgentInput): Promise<GenerationResult> {
    const documentContext = this.buildDocumentContext(input.documents);
    const pipelineHints = this.extractPipelineHints(documentContext, input.companyName);
    const appendix = buildBioAppendix(this._externalData, pipelineHints, input.companyName);

    return {
      sectionKey: SectionKey.APPENDIX,
      content: appendix,
      tokensUsed: 0,
    };
  }
}
