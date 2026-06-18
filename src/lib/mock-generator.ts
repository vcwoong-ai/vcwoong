import { ClaudeMessage } from "./claude";

/**
 * Demo-mode IC report generator.
 *
 * When no Anthropic API key is configured, the platform still produces a
 * complete, realistic-looking investment review report so the full pipeline
 * (deal → report → edit → export) can be exercised end-to-end. Swapping in a
 * real API key automatically switches to live Claude generation — no other
 * code changes required.
 */

const SECTION_TITLES = [
  "투자개요",
  "회사개요",
  "제품/기술",
  "시장분석",
  "재무현황",
  "밸류에이션",
  "리스크",
  "투자조건",
  "의견종합",
  "별첨",
] as const;

type SectionTitle = (typeof SECTION_TITLES)[number];

interface PromptFacts {
  companyName: string;
  sector: string;
  investRound?: string;
  investAmount?: string;
  valuation?: string;
  sectionTitle: SectionTitle;
}

function extractFacts(prompt: string): PromptFacts {
  const company = /기업명:\s*(.+)/.exec(prompt)?.[1]?.trim() ?? "대상 기업";
  const sector = /섹터:\s*(.+)/.exec(prompt)?.[1]?.trim() ?? "일반";
  const round = /투자 라운드:\s*(.+)/.exec(prompt)?.[1]?.trim();
  const amount = /투자 금액:\s*(.+?)억원/.exec(prompt)?.[1]?.trim();
  const valuation = /투자 후 기업가치:\s*(.+?)억원/.exec(prompt)?.[1]?.trim();

  let sectionTitle: SectionTitle = "투자개요";
  for (const title of SECTION_TITLES) {
    const escaped = title.replace(/[/]/g, "\\/");
    if (new RegExp(`\\*\\*${escaped}\\*\\*`).test(prompt)) {
      sectionTitle = title;
      break;
    }
  }

  return {
    companyName: company,
    sector,
    investRound: round,
    investAmount: amount,
    valuation: valuation,
    sectionTitle,
  };
}

const DEMO_NOTICE =
  "> ⚙️ **데모 모드** — Anthropic API 키가 설정되지 않아 샘플 콘텐츠로 생성되었습니다. " +
  "실제 API 키를 `.env.local`에 입력하면 동일한 흐름으로 실제 AI가 본문을 작성합니다.\n\n";

function sectionBody(f: PromptFacts): string {
  const c = f.companyName;
  const round = f.investRound ?? "본 라운드";
  const amount = f.investAmount ? `${f.investAmount}억원` : "미정";
  const post = f.valuation ? `${f.valuation}억원` : "협의 중";

  switch (f.sectionTitle) {
    case "투자개요":
      return `### 1. 투자 핵심 요약
${c}은(는) ${f.sector} 영역에서 검증된 실행력과 차별화된 기술 경쟁력을 바탕으로 빠르게 성장하고 있는 기업임. 본 건은 ${round} 라운드 참여 건으로, 시장 확대 국면에서의 선제적 포지셔닝 확보를 목적으로 함.

### 2. 투자 조건 요약
- 라운드: ${round}
- 투자 금액: ${amount}
- Post-money 밸류에이션: ${post}
- 투자 형태: 상환전환우선주(RCPS) 기준 협의

### 3. 핵심 투자 포인트
- 명확한 시장 수요와 우호적인 성장 타이밍(Why Now) 확보
- 기존 솔루션 대비 구조적 차별성 및 진입장벽 보유
- 반복 검증된 창업팀의 실행 역량
- 우상향하는 핵심 지표(매출·고객·리텐션) 추세

### 4. 주요 우려 사항
- 경쟁 심화에 따른 마진 압박 가능성
- 수익화 시점 및 추가 자금 조달 필요성(확인 필요)

### 5. 투자 의견
핵심 리스크가 관리 가능한 수준으로 판단되며, **조건부 투자 권고** 의견을 제시함.`;

    case "회사개요":
      return `### 1. 기업 기본 정보
- 기업명: ${c}
- 소재지·설립일·임직원 수: 제공 자료 기준 확인 필요
- 사업 영역: ${f.sector}

### 2. 설립 배경 및 비전
창업팀은 ${f.sector} 시장의 구조적 비효율을 직접 경험하고 이를 해결하기 위해 ${c}을(를) 설립함. "고객 가치 중심의 문제 해결"을 미션으로 함.

### 3. 경영진
- 대표이사: 해당 산업 경력 및 핵심 역량 보유(상세 확인 필요)
- 주요 C-Level: 기술·재무 부문 전문성 확보

### 4. 주요 연혁
- 설립 → 초기 제품 출시 → 본 라운드 추진에 이르는 주요 이정표 보유

### 5. 주주 구조
- 창업자 및 기존 재무적 투자자 중심(상세 지분율 확인 필요)`;

    case "제품/기술":
      return `### 1. 핵심 제품/서비스 개요
${c}의 핵심 제품은 ${f.sector} 고객의 핵심 페인포인트를 직접 해결하는 솔루션으로, 명확한 가치 제안을 보유함.

### 2. 기술 차별성
- 독자적 기술 원리에 기반한 성능·효율 우위
- 경쟁사 대비 재현 난이도가 높아 진입장벽으로 작용
- 데이터·운영 노하우 축적에 따른 선순환 구조

### 3. IP 포트폴리오
- 핵심 기술에 대한 특허 출원·등록 보유(건수·만료일 확인 필요)
- 영업비밀 및 노하우 기반 방어 전략 병행

### 4. 개발 로드맵
- 현재 제품 고도화 및 인접 영역으로의 확장 계획(1~3년)

### 5. 규제 및 인증
- 사업 영위에 필요한 인증 취득 현황 확인 필요`;

    case "시장분석":
      return `### 1. 시장 규모 (TAM/SAM/SOM)
- TAM: 글로벌 ${f.sector} 시장 (대규모, 출처 확인 필요)
- SAM: 국내·아시아 핵심 세그먼트
- SOM: 3~5년 내 현실적 점유 목표

### 2. 시장 성장률
연평균 두 자릿수 성장(CAGR)이 기대되며, 디지털 전환·정책 지원 등이 성장 드라이버로 작용함.

### 3. 경쟁 구도
| 구분 | 강점 | 약점 |
|------|------|------|
| ${c} | 기술 차별성·실행력 | 인지도·자본력 |
| 기존 대형 사업자 | 자본·고객 기반 | 혁신 속도 |
| 신규 진입자 | 민첩성 | 검증 부족 |

### 4. 고객 세그먼트
명확한 타겟 고객군과 핵심 구매 결정 요인(ROI·신뢰성)을 보유함.

### 5. 진입장벽
기술·데이터·전환비용 측면에서 후발 주자 대비 우위를 확보함.`;

    case "재무현황":
      return `### 1. 손익 요약 (최근 3개년 + 당해 예상)
| 구분 | FY23 | FY24 | FY25E |
|------|------|------|-------|
| 매출액 | - | - | - |
| 매출총이익 | - | - | - |
| 영업이익(손실) | - | - | - |

(상세 수치는 제공 재무자료 기준 확인 필요)

### 2. 매출 구조
- 핵심 제품·서비스 중심의 매출 구성
- 주요 거래처 집중도 점검 필요

### 3. 현금흐름 및 런웨이
- 현재 현금 보유액 및 월 번 레이트 기준 런웨이 산정 필요
- 본 라운드 ${amount} 조달 시 런웨이 추가 확보 기대

### 4. 재무비율
- 부채비율·유동비율·매출 성장률(YoY) 점검 필요

### 5. 펀딩 히스토리
- 기존 투자 라운드 및 투자자 구성(확인 필요)`;

    case "밸류에이션":
      return `### 1. 이번 라운드 요약
- Post-money 밸류에이션: ${post}
- 투자 금액: ${amount} / 라운드: ${round}

### 2. 비교 밸류에이션 (Comps)
- 유사 상장사 및 동종 VC 딜의 EV/매출 배수 대비 적정 수준 검토
- 성장률·수익성 프리미엄 반영 여부 점검

### 3. 본질가치 분석
- 향후 3~5년 매출·이익 추정 기반 목표 기업가치 산정
- 할인율 및 적용 배수 가정의 민감도 분석 필요

### 4. 밸류에이션 적정성 검토
요청 밸류에이션은 성장성·시장 잠재력을 고려할 때 수용 가능 범위로 판단되나, 추가 검증이 필요함.

### 5. 예상 수익률
- Exit 시나리오(IPO/M&A)별 목표 IRR 및 MoM 산정`;

    case "리스크":
      return `각 리스크는 **영향도 × 발생가능성** 기준으로 평가함.

### 1. 사업 리스크
- 시장 진입·경쟁 심화 리스크 (영향도 M / 발생가능성 M)

### 2. 재무 리스크
- 추가 자금 조달 및 수익화 지연 리스크 (영향도 H / 발생가능성 M)

### 3. 운영/팀 리스크
- 핵심 인력 이탈 및 실행 역량 리스크 (영향도 M / 발생가능성 L)

### 4. 규제/외부 리스크
- 규제 변화 및 거시경제 영향 (영향도 M / 발생가능성 M)

### 5. 리스크 완화 방안
- 단계별 마일스톤 연동 투자(Tranche), 이사회 참여를 통한 모니터링 강화`;

    case "투자조건":
      return `### 1. 투자 구조
- 투자 수단: 상환전환우선주(RCPS) 기준 협의
- 투자 금액 / 지분율: ${amount} / 협의
- 공동 투자자: Lead/Follow 구성 확인 필요

### 2. 우선주 조건
- 청산우선권: 1x Non-participating 기준 협의
- 전환 조건 및 희석방지(Anti-dilution) 조항 포함

### 3. 주요 계약 조건
- 이사회 참여권, 정보열람권, 우선매수권, 동반매도권(Tag-along)
- 핵심 인력 Lock-up 조항

### 4. Exit 전략
- 예상 경로: IPO / M&A / 세컨더리
- 목표 Exit 시점 및 배수 협의`;

    case "의견종합":
      return `### 1. 투자 의견
**조건부 투자 권고** — 핵심 전제 조건 충족을 전제로 투자 집행을 권고함.

### 2. 핵심 투자 포인트 (Top 3)
1. 명확한 시장 기회와 우호적 타이밍
2. 구조적 기술 차별성 및 진입장벽
3. 검증된 창업팀의 실행 역량

### 3. 핵심 우려 사항 (Top 3)
1. 경쟁 심화에 따른 마진 압박 — 분기별 마진 추이 모니터링
2. 추가 자금 조달 필요성 — 런웨이 및 후속 라운드 계획 점검
3. 핵심 지표 둔화 가능성 — 리텐션·성장률 추적

### 4. 투자 전제 조건
- 실사(DD) 주요 항목 클리어
- 핵심 인력 잔류 약정 확보

### 5. 심사역 의견
리스크 대비 기대 수익이 매력적이며, 포트폴리오 전략 측면에서도 적합하다고 판단함.`;

    case "별첨":
      return `### 1. 재무 상세 데이터
제공된 재무제표 요약 (원자료 기준)

### 2. 시장 데이터 출처
인용 시장 데이터의 출처 및 원문 요약 (확인 필요)

### 3. 경쟁사 비교표
상세 경쟁사 비교 매트릭스

### 4. 리스크 매트릭스
영향도/발생가능성 상세 표

### 5. 용어 정리 및 참고 자료
분석에 활용된 외부 자료 목록`;

    default:
      return `${c}에 대한 ${f.sectionTitle} 분석 내용(샘플).`;
  }
}

/**
 * Produces demo-mode content for a given prompt set.
 */
export function generateMockContent(messages: ClaudeMessage[]): string {
  const userPrompt = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const facts = extractFacts(userPrompt);
  return DEMO_NOTICE + sectionBody(facts);
}
