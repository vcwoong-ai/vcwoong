import { SectionKey } from "@prisma/client";

export interface SectionPromptContext {
  companyName: string;
  sector: string;
  investRound?: string;
  investAmount?: number;
  valuation?: number;
  documentContext: string;
  additionalContext?: string;
}

export function buildSectionPrompt(
  sectionKey: SectionKey,
  context: SectionPromptContext
): string {
  const base = buildBaseContext(context);
  const sectionInstructions = SECTION_INSTRUCTIONS[sectionKey];

  return `${base}

## 작성 요청
아래 지침에 따라 **${getSectionTitle(sectionKey)}** 섹션을 작성해주세요.

${sectionInstructions}

## 중요 지침
- 제공된 자료에 없는 정보는 "확인 필요"로 표시하세요
- 수치는 구체적으로 명시하고 출처를 괄호로 표시하세요 (예: 출처: IR 자료)
- 분량은 600~1,200자(한글 기준) 내외로 작성하세요
- 문어체(~임, ~함)를 사용하세요`;
}

function buildBaseContext(context: SectionPromptContext): string {
  return `## 투자 대상 기업 정보
- 기업명: ${context.companyName}
- 섹터: ${context.sector}
${context.investRound ? `- 투자 라운드: ${context.investRound}` : ""}
${context.investAmount ? `- 투자 금액: ${context.investAmount.toLocaleString()}억원` : ""}
${context.valuation ? `- 투자 후 기업가치: ${context.valuation.toLocaleString()}억원` : ""}
${context.additionalContext ? `\n## 추가 컨텍스트\n${context.additionalContext}` : ""}

## 제공 자료
${context.documentContext || "제공된 자료 없음"}`;
}

function getSectionTitle(key: SectionKey): string {
  const titles: Record<SectionKey, string> = {
    [SectionKey.INVESTMENT_OVERVIEW]: "투자개요",
    [SectionKey.COMPANY_OVERVIEW]: "회사개요",
    [SectionKey.PRODUCT_TECHNOLOGY]: "제품/기술",
    [SectionKey.MARKET_ANALYSIS]: "시장분석",
    [SectionKey.FINANCIAL_STATUS]: "재무현황",
    [SectionKey.VALUATION]: "밸류에이션",
    [SectionKey.RISK_ANALYSIS]: "리스크",
    [SectionKey.INVESTMENT_TERMS]: "투자조건",
    [SectionKey.OPINION_SUMMARY]: "의견종합",
    [SectionKey.APPENDIX]: "별첨",
  };
  return titles[key];
}

const SECTION_INSTRUCTIONS: Record<SectionKey, string> = {
  [SectionKey.INVESTMENT_OVERVIEW]: `**투자개요** 섹션 작성 지침:
1. **투자 핵심 요약**: 투자 딜의 한 줄 요약 (Why Now, Why This Company)
2. **투자 조건 요약**: 라운드, 금액, 지분율, Post-money 밸류에이션
3. **핵심 투자 포인트** (3~5개 bullet):
   - 시장 기회의 크기와 타이밍
   - 경쟁 우위 및 차별화 요소
   - 팀의 실행 능력
   - 재무적 매력도
4. **주요 우려 사항** (1~3개 bullet)
5. **투자 의견**: 투자 권고 또는 보류 의견`,

  [SectionKey.COMPANY_OVERVIEW]: `**회사개요** 섹션 작성 지침:
1. **기업 기본 정보**: 설립일, 법인 형태, 소재지, 임직원 수
2. **설립 배경 및 비전**: 창업자의 문제 인식, 회사의 미션과 비전
3. **경영진 소개**: 
   - 대표이사: 이름, 학력/경력, 핵심 역량
   - C-Level 임원진 (CTO, CFO 등) 주요 경력
4. **주요 연혁**: 설립 → 현재까지 중요 이정표 (타임라인)
5. **주주 구조**: 주요 주주 및 지분율 (표 형식)
6. **조직 구조**: 부서별 인원 배분`,

  [SectionKey.PRODUCT_TECHNOLOGY]: `**제품/기술** 섹션 작성 지침:
1. **핵심 제품/서비스 개요**: 무엇을, 누구에게, 어떻게 제공하는가
2. **기술 차별성**:
   - 핵심 기술 원리 및 작동 방식
   - 기존 솔루션 대비 기술적 우위
   - 재현 난이도 (진입장벽)
3. **IP 포트폴리오**:
   - 보유 특허 수, 출원 현황
   - 핵심 특허 만료일
   - 기술이전/라이선스 현황
4. **개발 로드맵**: 현재 상태 → 향후 1~3년 계획
5. **규제 및 인증**: 필요 인증, 취득 현황`,

  [SectionKey.MARKET_ANALYSIS]: `**시장분석** 섹션 작성 지침:
1. **시장 규모** (TAM/SAM/SOM 프레임):
   - TAM: 전체 주소 가능 시장 (글로벌)
   - SAM: 서비스 가능 세그먼트 (국내/아시아)
   - SOM: 현실적 점유 목표 (3~5년)
2. **시장 성장률**: CAGR 및 성장 드라이버
3. **경쟁 구도**:
   - 주요 경쟁사 3~5개 (표: 기업명/제품/강점/약점)
   - 회사의 포지셔닝
4. **고객 세그먼트**: Target Customer Profile, 핵심 구매 결정 요인
5. **진입장벽**: 왜 지금 이 회사가 유리한가`,

  [SectionKey.FINANCIAL_STATUS]: `**재무현황** 섹션 작성 지침:
1. **손익 요약** (최근 3개년 + 당해 예상):
   - 매출액, 매출원가, 매출총이익, 영업이익(손실), 당기순이익(손실)
   - 표 형식으로 제시
2. **매출 구조 분석**:
   - 제품/서비스별 매출 비중
   - 주요 거래처 (Top 3~5)
3. **현금흐름**:
   - 운영 현금흐름, 투자 현금흐름
   - 현재 런웨이 (현금보유액 / 월 번 레이트)
4. **재무비율**: 부채비율, 유동비율, 매출 성장률 YoY
5. **펀딩 히스토리**: 기존 투자 라운드, 투자자, 금액`,

  [SectionKey.VALUATION]: `**밸류에이션** 섹션 작성 지침:
1. **이번 라운드 요약**:
   - Pre/Post-money 밸류에이션
   - 제안 EV/매출 배수, EV/EBITDA
2. **비교 밸류에이션 (Comps)**:
   - 유사 상장사 3~5개 (표: 기업명/시가총액/EV·매출 배수/성장률)
   - 유사 VC 투자 딜 사례
3. **본질가치 분석**:
   - 향후 3~5년 매출/이익 추정
   - 적용 배수 및 할인율
   - 목표 기업가치 (Exit 시나리오)
4. **밸류에이션 적정성 검토**: 밸류에이션 근거 및 할증/할인 요인
5. **예상 수익률**: 투자 후 Exit 시나리오별 IRR/MoM`,

  [SectionKey.RISK_ANALYSIS]: `**리스크** 섹션 작성 지침:
각 리스크를 **영향도(H/M/L) × 발생가능성(H/M/L)** 매트릭스로 평가하고:
1. **사업 리스크**:
   - 시장 진입 리스크
   - 기술 개발/완성도 리스크
   - 경쟁 심화 리스크
2. **재무 리스크**:
   - 추가 자금 조달 리스크
   - 수익화 시점 지연 리스크
3. **운영/팀 리스크**:
   - 핵심 인력 이탈
   - 실행 역량 리스크
4. **규제/외부 리스크**:
   - 규제 변화
   - 거시경제 영향
5. **리스크 완화 방안**: 각 주요 리스크별 대응 전략`,

  [SectionKey.INVESTMENT_TERMS]: `**투자조건** 섹션 작성 지침:
1. **투자 구조**:
   - 투자 수단: 보통주 / 우선주 / CB / SAFE 등
   - 투자 금액 및 지분율
   - 공동 투자자 (Lead/Follow)
2. **우선주 조건** (해당 시):
   - 청산우선권 (1x Non-participating / Participating)
   - 배당 조건
   - 전환 조건 및 전환가격 조정 (Anti-dilution)
3. **주요 계약 조건**:
   - 이사회 구성 및 의결권
   - 정보열람권, 선매권, 동반매도권
   - Lock-up 기간
4. **Exit 전략**:
   - 예상 Exit 경로 (IPO / M&A / 세컨더리)
   - 목표 Exit 시점 및 배수`,

  [SectionKey.OPINION_SUMMARY]: `**의견종합** 섹션 작성 지침:
1. **투자 의견**: 명확한 투자 권고 의견 제시
   - "투자 권고" / "조건부 투자 권고" / "추가 검토 필요" / "투자 보류"
2. **핵심 투자 포인트** (Top 3):
   - 각 포인트에 대한 1~2문장 설명
3. **핵심 우려 사항** (Top 3):
   - 각 우려 사항에 대한 1~2문장 설명
   - 모니터링 지표 제시
4. **투자 전제 조건** (있는 경우):
   - 투자 실행 전 충족이 필요한 조건
5. **심사역 의견**: 종합 투자 판단 및 포트폴리오 전략적 의미`,

  [SectionKey.APPENDIX]: `**별첨** 섹션 작성 지침:
1. **재무 상세 데이터**: 제공된 재무제표 요약
2. **시장 데이터 출처**: 인용된 시장 데이터의 출처 및 원문 요약
3. **경쟁사 비교표**: 상세 경쟁사 비교 매트릭스
4. **주요 리스크 매트릭스**: 리스크 영향도/발생가능성 상세 표
5. **용어 정리**: 전문 용어 설명 (필요 시)
6. **참고 자료**: 분석에 활용된 외부 자료 목록`,
};
