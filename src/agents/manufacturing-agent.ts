import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * Maker — 제조/하드웨어 전문 투자 심사역 에이전트.
 * 원가 구조, 공급망, Capex 분석에 특화.
 */
export class ManufacturingAgent extends BaseAgent {
  constructor() {
    super(AgentType.MANUFACTURING, DealSector.MANUFACTURING);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.FINANCIAL_STATUS) {
      return this.generateManufacturingFinancials(input);
    }
    if (sectionKey === SectionKey.PRODUCT_TECHNOLOGY) {
      return this.generateProductionCapability(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateManufacturingFinancials(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.MANUFACTURING);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 제조/하드웨어

## 제공 자료
${documentContext}

## 재무현황 섹션 작성 요청 (제조업 특화)

### 1. 손익 요약 (최근 3개년 + 당해 추정)
| 구분 | FY22 | FY23 | FY24 | FY25E |
|------|------|------|------|-------|
| 매출액 | | | | |
| 매출원가 | | | | |
| 매출총이익(률) | | | | |
| 영업이익(률) | | | | |
| EBITDA | | | | |

### 2. 원가 구조 분석
- BOM(Bill of Materials) 주요 항목별 비중
- 고정비 vs 변동비 비율
- 최근 원자재 가격 변동 영향

### 3. 생산 능력 및 가동률
- 현재 CAPA (연간 생산 가능 수량)
- 실제 가동률 및 병목 공정
- CAPA 확대 Capex 계획 및 ROI

### 4. 공급망 현황
- 핵심 원자재/부품 소싱 현황
- 주요 공급사 의존도 및 대안 확보 현황
- 재고 회전율 (일수)

### 5. 현금흐름
- 영업 현금흐름 vs 순이익 갭 분석
- 운전자본(WC) 규모 및 사이클
- 부채비율, 이자보상배율

분량: 800~1,100자 (한글 기준), 문어체 사용`;

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

  private async generateProductionCapability(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.MANUFACTURING);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 제조/하드웨어

## 제공 자료
${documentContext}

## 제품/기술 섹션 작성 요청 (제조업 특화)

### 1. 핵심 제품 포트폴리오
- 주력 제품 스펙 및 차별화 포인트
- 제품군별 매출 비중 및 GPM

### 2. 생산 기술 역량
- 핵심 제조 공정 및 독자 기술
- 특허·실용신안 현황
- 소부장 자립화 현황 (해당 시)

### 3. 품질 인증 및 레퍼런스
- ISO/IATF 등 품질 인증 현황
- 국내외 주요 고객사 (OEM/ODM 포함)
- 인증 추진 중인 항목 및 일정

### 4. 설비 현황
- 주요 생산 설비 목록 및 감가상각 잔존가치
- 스마트팩토리 전환 현황

### 5. R&D 역량
- 연구 인력 비중 (총 인원 대비)
- 연간 R&D 투자 및 정부 과제 현황

분량: 700~1,000자 (한글 기준), 문어체 사용`;

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
