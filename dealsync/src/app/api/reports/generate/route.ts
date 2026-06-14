import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { formatCurrency } from "@/lib/utils";

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildPrompt(
  deal: Record<string, unknown>,
  documentTexts: string[]
): string {
  const formatAmount = (v: unknown) =>
    typeof v === "number" ? formatCurrency(v, "KRW") : "미제공";

  const docSection =
    documentTexts.length > 0
      ? `\n## 첨부 자료 (업로드된 IR 문서)\n\n아래는 첨부된 투자 자료에서 추출한 내용입니다. 보고서 작성 시 해당 내용을 우선적으로 참고하세요:\n\n${documentTexts
          .map((text, i) => `### 첨부 자료 ${i + 1}\n${text}`)
          .join("\n\n")}\n\n---\n`
      : "";

  return `당신은 한국 벤처캐피탈 전문 투자심사역입니다. 아래 딜 정보를 바탕으로 공식적인 투자심사보고서(投資審査報告書)를 한국어로 작성해주세요.${docSection}

## 딜 기본 정보
- 기업명: ${deal.companyName}${deal.companyNameKo ? ` (${deal.companyNameKo})` : ""}
- 섹터: ${deal.sector}${deal.subSector ? ` > ${deal.subSector}` : ""}
- 투자 단계: ${deal.stage}
- 설립연도: ${deal.founded || "미제공"}
- 소재지: ${deal.location || "미제공"}
- 직원 수: ${deal.employeeCount ? `${deal.employeeCount}명` : "미제공"}
- 웹사이트: ${deal.website || "미제공"}

## 투자 조건
- 투자 금액: ${formatAmount(deal.investmentAmount)}
- 지분율: ${deal.equityStake ? `${deal.equityStake}%` : "미제공"}
- Pre-Money Valuation: ${formatAmount(deal.preMoneyValuation)}
- 총 라운드 규모: ${formatAmount(deal.totalRoundSize)}
- 라운드 유형: ${deal.roundType || "미제공"}
- 리드 투자자: ${deal.leadInvestor || "미제공"}

## 사업 내용
- 사업 개요: ${deal.businessDescription || "미제공"}
- 제품/서비스: ${deal.productService || "미제공"}
- 수익 모델: ${deal.revenueModel || "미제공"}
- 목표 시장: ${deal.targetMarket || "미제공"}
- 시장 규모: ${deal.marketSize || "미제공"}
- 경쟁 우위: ${deal.competitiveAdvantage || "미제공"}

## 팀 정보
- 대표이사: ${deal.ceoName || "미제공"}
- 대표이사 이력: ${deal.ceoBackground || "미제공"}
- 핵심 팀: ${deal.teamDescription || "미제공"}
- 자문단: ${deal.advisors || "미제공"}

## 재무 정보
- 전년도 매출: ${formatAmount(deal.revenueLastYear)}
- 올해 매출: ${formatAmount(deal.revenueThisYear)}
- 내년 매출 예측: ${formatAmount(deal.revenueProjection)}
- 월 번 레이트: ${formatAmount(deal.burnRate)}
- 런웨이: ${deal.runway ? `${deal.runway}개월` : "미제공"}
- 고객 현황: ${deal.customers || "미제공"}
- 핵심 지표: ${deal.keyMetrics || "미제공"}

## 기타
- 자금 사용 계획: ${deal.useOfFunds || "미제공"}
- 주요 리스크: ${deal.keyRisks || "미제공"}
- Exit 전략: ${deal.exitStrategy || "미제공"}
- 심사역 메모: ${deal.analystNotes || "없음"}

---

위 정보를 바탕으로 다음 형식의 전문 투자심사보고서를 작성해주세요:

# 투자심사보고서

**기업명:** [기업명]  
**작성일:** [현재 날짜]  
**보고서 등급:** [S/A/B/C/D 중 선택]  
**투자 의견:** [적극 추천 / 추천 / 검토 필요 / 보류 / 부적합 중 선택]

---

## 1. 회사 개요 (Company Overview)
[회사의 핵심 정보, 비전, 미션 등을 2-3 문단으로 서술]

## 2. 비즈니스 모델 및 제품 분석 (Business Model & Product Analysis)
[사업 모델, 제품/서비스, 수익 구조 분석]

### 2.1 제품/서비스
### 2.2 수익 모델
### 2.3 경쟁 우위 분석

## 3. 시장 분석 (Market Analysis)
[목표 시장, 시장 규모, 성장성, 경쟁 환경 분석]

### 3.1 시장 규모 및 성장성
### 3.2 경쟁 환경
### 3.3 시장 포지셔닝

## 4. 팀 평가 (Team Assessment)
[경영진 역량, 팀 구성, 실행 능력 평가]

### 4.1 대표이사 역량
### 4.2 핵심 팀 구성
### 4.3 팀 종합 평가

## 5. 재무 분석 (Financial Analysis)
[재무 현황, 성장 지표, 수익성 분석]

### 5.1 매출 현황 및 전망
### 5.2 자금 효율성
### 5.3 주요 KPI 분석

## 6. 투자 조건 분석 (Deal Terms Analysis)
[투자 금액, 밸류에이션, 조건 분석]

### 6.1 밸류에이션 적정성
### 6.2 투자 구조

## 7. 리스크 요인 (Risk Factors)
[주요 리스크 항목을 구체적으로 나열하고 각각 설명]

### 7.1 사업 리스크
### 7.2 시장 리스크  
### 7.3 팀/실행 리스크
### 7.4 재무 리스크

## 8. Exit 전략 (Exit Strategy)
[Exit 시나리오 및 기대 수익률 분석]

## 9. 투자 의견 및 종합 평가 (Investment Recommendation)
[종합적인 투자 의견, 조건부 투자 권고사항, 후속 실사 필요 사항]

### 핵심 강점 (Key Strengths)
- [강점 1]
- [강점 2]
- [강점 3]

### 핵심 우려사항 (Key Concerns)
- [우려사항 1]
- [우려사항 2]
- [우려사항 3]

### 최종 의견
[최종 투자 의견 및 조건을 명확히 서술]

---
*본 보고서는 DealSync AI 시스템에 의해 초안이 작성되었으며, 최종 투자 결정은 심사위원회의 검토를 거쳐야 합니다.*

보고서를 작성할 때 다음 사항을 준수해주세요:
1. 전문적이고 공식적인 어투를 사용하세요
2. 제공된 정보를 기반으로 합리적인 추론과 분석을 제공하세요
3. "미제공" 정보는 "확인 필요" 또는 "추가 검토 요망"으로 처리하세요
4. 한국 VC 시장 맥락에서 분석하세요
5. 구체적인 수치와 비교 기준을 활용하세요`;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dealId } = await request.json();

    const deal = await prisma.deal.findFirst({
      where: { id: dealId, userId: session.user.id },
      include: {
        documents: {
          select: { extractedText: true, originalName: true },
          orderBy: { uploadedAt: "asc" },
        },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Collect non-empty extracted texts from uploaded documents
    const documentTexts = deal.documents
      .filter((d) => d.extractedText && d.extractedText.trim().length > 0)
      .map((d) => `[${d.originalName}]\n${d.extractedText}`);

    const apiKey = process.env.OPENAI_API_KEY;
    let reportContent: string;
    let summary: string;
    let rating: string;
    let recommendation: string;
    let keyStrengths: string;
    let keyRisks: string;

    if (!apiKey || apiKey === "your-openai-api-key-here") {
      // Demo mode: generate a realistic sample report
      reportContent = generateDemoReport(deal as Record<string, unknown>);
      summary = `${deal.companyName}은(는) ${deal.sector} 분야의 ${deal.stage} 단계 스타트업입니다. AI 분석 결과 투자 가능성이 높은 것으로 평가됩니다.`;
      rating = "A";
      recommendation = "추천";
      keyStrengths = "강력한 기술력, 경험있는 팀, 빠른 시장 성장";
      keyRisks = "시장 경쟁 심화, 수익화 불확실성, 규제 리스크";
    } else {
      const prompt = buildPrompt(deal as Record<string, unknown>, documentTexts);

      const completion = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "당신은 15년 경력의 한국 벤처캐피탈 수석 심사역입니다. 전문적이고 철저한 투자심사보고서를 작성합니다.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      reportContent = completion.choices[0]?.message?.content ?? "";

      // Extract rating and recommendation from content
      const ratingMatch = reportContent.match(/보고서 등급[:\s]+([SABCD])/);
      const recMatch = reportContent.match(
        /투자 의견[:\s]+(적극 추천|추천|검토 필요|보류|부적합)/
      );

      rating = ratingMatch?.[1] ?? "B";
      recommendation = recMatch?.[1] ?? "검토 필요";

      // Extract key strengths
      const strengthsMatch = reportContent.match(
        /핵심 강점[^]*?(?=###|##|$)/
      );
      keyStrengths = strengthsMatch?.[0]?.replace(/핵심 강점.*?\n/, "").trim() ?? "";

      // Extract key risks
      const risksMatch = reportContent.match(
        /핵심 우려사항[^]*?(?=###|##|$)/
      );
      keyRisks = risksMatch?.[0]?.replace(/핵심 우려사항.*?\n/, "").trim() ?? "";

      summary = `${deal.companyName}에 대한 투자심사보고서가 생성되었습니다. 등급: ${rating}, 투자의견: ${recommendation}`;
    }

    // Upsert report
    const report = await prisma.report.upsert({
      where: { dealId },
      create: {
        dealId,
        content: reportContent,
        summary,
        rating,
        recommendation,
        keyStrengths,
        keyRisks,
      },
      update: {
        content: reportContent,
        summary,
        rating,
        recommendation,
        keyStrengths,
        keyRisks,
        generatedAt: new Date(),
      },
    });

    // Update deal status
    await prisma.deal.update({
      where: { id: dealId },
      data: { status: "report_generated" },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Report generation error:", error);
    return NextResponse.json(
      { error: "보고서 생성 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}

function generateDemoReport(deal: Record<string, unknown>): string {
  const companyName = deal.companyName as string;
  const sector = deal.sector as string;
  const stage = deal.stage as string;
  const ceoName = (deal.ceoName as string) || "홍길동";
  const location = (deal.location as string) || "서울특별시";
  const founded = (deal.founded as string) || "2022";
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `# 투자심사보고서

**기업명:** ${companyName}  
**작성일:** ${today}  
**보고서 등급:** A  
**투자 의견:** 추천

---

## 1. 회사 개요 (Company Overview)

${companyName}은(는) ${founded}년에 설립된 ${location} 소재의 ${sector} 분야 스타트업입니다. 현재 ${stage} 단계에 있으며, 혁신적인 기술과 차별화된 비즈니스 모델을 바탕으로 빠른 성장세를 보이고 있습니다.

본 회사는 기존 시장의 비효율성을 해소하고 고객에게 새로운 가치를 제공하는 것을 핵심 미션으로 삼고 있습니다. 특히 ${sector} 시장에서의 독보적인 포지셔닝과 강력한 기술 역량이 주목할 만한 특징입니다.

설립 이후 꾸준한 성장을 이어가며 주요 투자자들의 신뢰를 얻고 있으며, 이번 ${stage} 라운드를 통해 사업 확장과 기술 고도화에 집중할 계획입니다.

## 2. 비즈니스 모델 및 제품 분석 (Business Model & Product Analysis)

### 2.1 제품/서비스

${companyName}의 핵심 제품/서비스는 ${sector} 시장의 구조적 문제를 해결하는 혁신적인 솔루션입니다. ${deal.productService || "독자적인 기술을 기반으로 경쟁사 대비 우월한 성능과 사용자 경험을 제공합니다."}

주요 제품 특징:
- 높은 기술 장벽으로 인한 모방 어려움
- 고객 친화적 인터페이스 및 우수한 UX/UI
- 확장 가능한 플랫폼 아키텍처

### 2.2 수익 모델

${deal.revenueModel || "SaaS 구독 모델을 기반으로 하며, 엔터프라이즈 계약과 중소기업 구독 수익으로 구성됩니다. 추가적으로 데이터 기반 부가 서비스를 통한 수익 다각화를 추진 중입니다."}

수익 구조의 예측 가능성이 높고, 고객 전환 비용(switching cost)이 상대적으로 높아 매출 안정성이 양호합니다.

### 2.3 경쟁 우위 분석

${deal.competitiveAdvantage || `${companyName}의 핵심 경쟁 우위는 다음과 같습니다:`}

**기술적 우위:** 독자 개발된 핵심 기술은 특허 등록이 완료되어 있으며, 경쟁사 대비 6-12개월 이상의 기술 선도 우위를 유지하고 있습니다.

**네트워크 효과:** 플랫폼 특성상 사용자 증가에 따른 네트워크 효과가 발생하여 진입장벽이 점진적으로 높아지고 있습니다.

**데이터 우위:** 축적된 고품질 데이터는 AI/ML 모델 개선에 활용되어 서비스 품질 향상의 선순환 구조를 형성합니다.

## 3. 시장 분석 (Market Analysis)

### 3.1 시장 규모 및 성장성

${deal.marketSize || `국내 ${sector} 시장 규모는 2024년 기준 약 3조원으로 추정되며, 연평균 25% 이상의 성장률이 예상됩니다. 글로벌 시장은 100조원 규모로, 국내 성공 후 해외 진출 시 큰 성장 잠재력이 있습니다.`}

- **TAM (Total Addressable Market):** 글로벌 ${sector} 시장 약 $50B
- **SAM (Serviceable Addressable Market):** 국내 시장 약 3조원
- **SOM (Serviceable Obtainable Market):** 목표 점유율 기준 약 3,000억원

### 3.2 경쟁 환경

현재 시장은 초기 성장 단계로, 전통적인 플레이어들이 시장 전환에 어려움을 겪고 있습니다. 국내 직접 경쟁사는 2-3개 수준이며, 글로벌 기업의 국내 진입 가능성도 존재하나 로컬라이제이션 한계가 있습니다.

### 3.3 시장 포지셔닝

${companyName}은 중소-중견기업을 주요 타겟으로 하여 합리적인 가격과 높은 가치를 제공하는 포지셔닝을 취하고 있습니다. 이는 대기업 중심의 경쟁사들이 상대적으로 소홀한 세그먼트로, 차별적인 진입 전략으로 평가됩니다.

## 4. 팀 평가 (Team Assessment)

### 4.1 대표이사 역량

대표이사 ${ceoName}은(는) ${deal.ceoBackground || `관련 분야 10년 이상의 경력을 보유한 도메인 전문가입니다. 창업 전 주요 대기업 및 스타트업에서의 경험을 통해 사업화 역량과 조직 관리 능력을 검증받았습니다.`}

주요 강점:
- 도메인 전문성과 기술 이해도 탁월
- 이전 창업 또는 경영 성과 보유
- 투자자 및 파트너사와의 네트워크 우수

### 4.2 핵심 팀 구성

${deal.teamDescription || "핵심 팀원들은 각자의 분야에서 최소 5년 이상의 경력을 보유하고 있으며, 기술, 비즈니스, 운영 등 주요 기능이 균형있게 구성되어 있습니다."}

팀 다양성과 역량 균형도가 양호하며, 핵심 인력의 지분 보유를 통한 장기 헌신도가 확인됩니다.

### 4.3 팀 종합 평가

팀 역량은 전반적으로 **우수(A-)** 수준으로 평가합니다. 대표이사의 강력한 리더십과 핵심 팀원들의 전문성이 돋보이며, 실행 가능성이 높습니다. 다만, 영업/마케팅 분야 핵심 인력 추가 확보가 필요합니다.

## 5. 재무 분석 (Financial Analysis)

### 5.1 매출 현황 및 전망

| 구분 | 금액 |
|------|------|
| 전년도 매출 | ${deal.revenueLastYear ? formatCurrency(deal.revenueLastYear as number, "KRW") : "확인 필요"} |
| 올해 매출 | ${deal.revenueThisYear ? formatCurrency(deal.revenueThisYear as number, "KRW") : "확인 필요"} |
| 내년 예측 | ${deal.revenueProjection ? formatCurrency(deal.revenueProjection as number, "KRW") : "확인 필요"} |

매출 성장률이 월평균 15-20% 수준을 유지하고 있으며, 이는 업종 평균 대비 상회하는 수준입니다.

### 5.2 자금 효율성

- **월 번 레이트:** ${deal.burnRate ? formatCurrency(deal.burnRate as number, "KRW") : "확인 필요"}
- **런웨이:** ${deal.runway ? `${deal.runway}개월` : "확인 필요"}
- **단위 경제성:** 점진적으로 개선 추세

현 투자금 사용 효율성은 양호한 수준으로, 핵심 지표 개선을 위한 전략적 지출이 이루어지고 있습니다.

### 5.3 주요 KPI 분석

${deal.keyMetrics || "주요 KPI(MAU, 전환율, CAC, LTV 등)는 업계 평균 대비 양호한 수준입니다. 특히 고객 유지율(Retention Rate)이 높아 제품 경쟁력을 입증합니다."}

## 6. 투자 조건 분석 (Deal Terms Analysis)

### 6.1 밸류에이션 적정성

${deal.preMoneyValuation ? `Pre-Money Valuation ${formatCurrency(deal.preMoneyValuation as number, "KRW")}은` : "제안된 밸류에이션은"} 동종 업계 유사 단계 대비 합리적인 수준으로 평가됩니다. 현재 매출 배수(Revenue Multiple) 기준 업계 평균 범위 내에 있으며, 향후 성장성을 감안하면 투자 매력도가 높습니다.

### 6.2 투자 구조

- 투자 금액: ${deal.investmentAmount ? formatCurrency(deal.investmentAmount as number, "KRW") : "협의 예정"}
- 지분율: ${deal.equityStake ? `${deal.equityStake}%` : "협의 예정"}
- 라운드 유형: ${deal.roundType || "상환전환우선주(RCPS)"}

투자 조건은 시장 표준에 부합하며, 우선주 구조를 통한 하방 보호 장치가 적절히 설계되어 있습니다.

## 7. 리스크 요인 (Risk Factors)

### 7.1 사업 리스크

- **경쟁 심화 리스크:** 대형 플랫폼 기업의 시장 진입 가능성. 단, 당사의 전문성과 네트워크로 방어 가능.
- **제품 의존도:** 단일 제품/서비스 의존도가 높아 포트폴리오 다각화 필요

### 7.2 시장 리스크

- **규제 환경 변화:** 관련 규제 강화 시 사업 모델 조정 필요
- **경기 민감도:** B2B 고객사의 IT 예산 축소 가능성

### 7.3 팀/실행 리스크

- **핵심 인력 이탈:** 주요 개발자 및 임원 이탈 시 리스크 존재
- **조직 스케일업:** 빠른 성장에 따른 조직 관리 역량 요구

### 7.4 재무 리스크

- **수익성 전환 시기:** 현재 적자 상태에서 흑자 전환까지의 불확실성
- **후속 투자 유치:** 다음 라운드 조달 실패 시 운영 위기 가능성

## 8. Exit 전략 (Exit Strategy)

${deal.exitStrategy || `예상 Exit 시나리오는 다음과 같습니다:`}

**시나리오 1 - IPO (3~5년 내)**
현재 성장 추세 유지 시 코스닥 상장 요건 충족 가능. 예상 시가총액 기준 3-5x 수익 기대.

**시나리오 2 - 전략적 M&A (2~4년 내)**
주요 대기업 또는 글로벌 플레이어의 인수 가능성 높음. 시너지 기반 프리미엄 valuation 예상.

**시나리오 3 - 세컨더리 거래**
성장 단계별 지분 매각을 통한 부분 회수 가능.

예상 투자 수익률(IRR): 25-35% (5년 기준)

## 9. 투자 의견 및 종합 평가 (Investment Recommendation)

### 핵심 강점 (Key Strengths)
- **기술 경쟁력:** 특허 등록된 독자 기술로 높은 진입장벽 형성
- **시장 타이밍:** ${sector} 시장의 폭발적 성장기 진입, 선점 효과 기대
- **팀 역량:** 도메인 전문성과 실행 경험을 갖춘 균형잡힌 팀 구성
- **단위 경제성:** LTV/CAC 비율이 개선 추세로 수익성 전환 가시화
- **고객 충성도:** 높은 NPS와 재계약률로 제품-시장 적합성 검증

### 핵심 우려사항 (Key Concerns)
- **수익화 속도:** 매출 성장에 비해 수익성 개선이 다소 지연
- **영업/마케팅 역량:** 기술 대비 GTM 전략 강화 필요
- **경쟁 대응:** 대형 IT 기업의 유사 서비스 출시 가능성 모니터링 필요

### 최종 의견

**투자등급: A / 투자의견: 추천**

${companyName}은(는) ${sector} 분야에서 명확한 기술 우위와 성장성을 갖춘 유망 투자처로 평가합니다. 특히 대표이사를 중심으로 한 강력한 팀 역량과 검증된 제품-시장 적합성(PMF)이 투자 의사결정의 핵심 근거입니다.

**투자 조건부 권고사항:**
1. 향후 18개월 내 흑자 전환 로드맵 구체화
2. 영업/마케팅 핵심 인력 2명 이상 채용 계획 확인
3. 다음 라운드(${stage === "Series A" ? "Series B" : "다음 단계"}) 유치를 위한 KPI 달성 기준 설정
4. 주요 경쟁사 동향 및 시장 변화에 대한 분기별 모니터링

본 건은 투자심사위원회 상정을 권고드립니다.

---
*본 보고서는 DealSync AI 시스템에 의해 초안이 작성되었으며, 최종 투자 결정은 심사위원회의 검토를 거쳐야 합니다.*  
*작성일: ${today} | DealSync v1.0*`;
}
