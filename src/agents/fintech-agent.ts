import { AgentType, DealSector, SectionKey } from "@prisma/client";
import { BaseAgent, AgentInput } from "./base-agent";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import { GenerationResult } from "@/types";
import { formatFintechAnalysisForPrompt } from "@/lib/fintech/metrics-extract";

/**
 * Vault — 핀테크/금융 전문 투자 심사역 에이전트.
 * 금융 규제, 신용 리스크, TPV/Take Rate 분석에 특화.
 */
export class FintechAgent extends BaseAgent {
  constructor() {
    super(AgentType.FINTECH, DealSector.FINTECH);
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    if (sectionKey === SectionKey.FINANCIAL_STATUS) {
      return this.generateFintechFinancials(input);
    }
    if (sectionKey === SectionKey.RISK_ANALYSIS) {
      return this.generateRegulatoryRisk(input);
    }
    return super.generateSection(input, sectionKey);
  }

  private async generateFintechFinancials(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.FINTECH);
    const documentContext = this.buildDocumentContext(input.documents);
    const fintechAnalysis = formatFintechAnalysisForPrompt(documentContext);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 핀테크/금융

## 제공 자료
${documentContext}${fintechAnalysis}

## 재무현황 섹션 작성 요청 (핀테크 특화)

### 1. 핵심 핀테크 지표
- TPV (Total Payment Volume) 및 성장률 YoY
- Take Rate (수수료율) 및 추이
- GMV 기반 매출 분해 (수수료/이자/구독 등)
- 순이자마진 (NIM) — 대출·예금 사업 해당 시

### 2. 신용/대출 현황 (해당 시)
- 대출 잔액 및 연체율(30일/90일 이상)
- NPL (부실채권) 비율 및 충당금 커버리지
- 신용 모형 성능 (부도예측 정확도, Gini계수)

### 3. 손익 요약
| 구분 | FY22 | FY23 | FY24 | FY25E |
|------|------|------|------|-------|
| 영업수익 | | | | |
| 이자수익 | | | | |
| 수수료수익 | | | | |
| 영업비용 | | | | |
| 영업이익 | | | | |

### 4. 유닛 이코노믹스
- CAC (고객 획득 비용)
- LTV (고객 생애 가치) 및 LTV/CAC
- 활성 사용자 ARPU

### 5. 자본 적정성 (금융업 해당 시)
- 자기자본비율(BIS) / RBC 비율
- 규제 자본 요건 충족 현황

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

  private async generateRegulatoryRisk(input: AgentInput): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(AgentType.FINTECH);
    const documentContext = this.buildDocumentContext(input.documents);

    const userPrompt = `## 투자 대상 기업 정보
- 기업명: ${input.companyName}
- 섹터: 핀테크/금융

## 제공 자료
${documentContext}

## 리스크 분석 섹션 작성 요청 (핀테크 특화)

### 1. 규제/라이선스 리스크
- 보유 금융 라이선스 목록 (전자지급결제, 대부업, 인터넷전문은행 등)
- 현재 규제 준수 현황 및 심사 중인 라이선스
- 규제 변화 시나리오 (금융위 정책 방향, 빅테크 규제 강화)

### 2. 신용/시장 리스크
- 경기 침체 시 NPL 증가 시나리오
- 금리 상승에 따른 NIM 영향
- 자금조달 리스크 (ABS, P2P, 은행 여신 한도)

### 3. 운영/기술 리스크
- 금융보안원 취약점 점검 현황
- 개인정보 처리 방침 및 유출 이력
- 서비스 가용성(SLA) 및 장애 이력

### 4. 경쟁/비즈니스 리스크
- 카카오페이·토스·네이버페이 등 빅테크와의 경쟁
- 수수료율 인하 압력 및 Take Rate 방어 전략
- 주요 파트너(은행/카드사) 계약 리스크

### 5. 리스크 완화 방안

분량: 700~1,000자 (한글 기준), 문어체 사용`;

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      { systemPrompt, maxTokens: 4096 }
    );

    return {
      sectionKey: SectionKey.RISK_ANALYSIS,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }
}
