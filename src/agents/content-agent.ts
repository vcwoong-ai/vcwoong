import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";

/**
 * Story — 콘텐츠/엔터테인먼트 전문 투자 심사역 에이전트.
 * IP 가치, 팬덤 경제, 한류 프리미엄 분석에 특화.
 */
export class ContentAgent extends BaseAgent {
  constructor() {
    super(AgentType.CONTENT, DealSector.CONTENT);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.PRODUCT_TECHNOLOGY) {
      return this.generateIPAssessment(input);
    }
    if (sectionKey === SectionKey.MARKET_ANALYSIS) {
      return this.generateContentMarket(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateIPAssessment(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.CONTENT);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 콘텐츠/엔터테인먼트

## 제공 자료
${documentContext}

## 제품/IP 섹션 작성 요청 (콘텐츠/엔터 특화)

### 1. 핵심 IP 포트폴리오
- 오리지널 IP 목록 (웹툰/드라마/영화/게임/음악 등)
- 각 IP별 팬덤 규모 및 해외 진출 현황
- IP 수명주기 단계 및 확장 계획 (OSMU: One Source Multi-Use)

### 2. 아티스트/크리에이터 역량
- 소속 아티스트/크리에이터 현황 및 계약 구조
- 전속 계약 만료 리스크 및 재계약 현황
- 신인 발굴 시스템 및 육성 트랙레코드

### 3. 플랫폼 및 유통 역량
- 주요 유통 플랫폼별 수익 구조 (스트리밍/OTT/유튜브)
- 자체 플랫폼 보유 여부 및 MAU
- 글로벌 파트너십 현황

### 4. 수익 다변화
- 매출 포트폴리오 (공연/굿즈/라이선싱/광고/게임 등)
- 글로벌 MG(최소보장금) 계약 현황
- 신규 수익원 개발 계획

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

  private async generateContentMarket(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.CONTENT);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 콘텐츠/엔터테인먼트

## 제공 자료
${documentContext}

## 시장분석 섹션 작성 요청 (콘텐츠/엔터 특화)

### 1. 글로벌 콘텐츠 시장 규모 및 성장성
- TAM: 글로벌 엔터/콘텐츠 시장 규모
- SAM: 해당 장르/플랫폼 시장
- 한류(K-Content) 프리미엄 및 성장 드라이버

### 2. 경쟁 구도
- 국내 주요 경쟁사 (HYBE, SM, JYP, YG, CJ ENM 등)
- 해외 경쟁사 및 글로벌 OTT 플랫폼의 K-콘텐츠 투자 동향
- 진입장벽 분석 (IP 축적, 아티스트 독점, 유통 채널)

### 3. 팬덤 경제 트렌드
- 팬덤 규모 측정 지표 (스트리밍 순위, SNS 팔로워, 팬클럽 규모)
- 팬덤 기반 소비 패턴 (앨범/굿즈/공연/팬미팅)
- 크리에이터 이코노미 성장 및 플랫폼 파편화

### 4. 규제 환경
- 대중문화예술인 계약 관련 규제 (공정위 가이드라인)
- 해외 진출 시 현지 규제 (중국 한한령 등)

분량: 700~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return {
      sectionKey: SectionKey.MARKET_ANALYSIS,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }
}
