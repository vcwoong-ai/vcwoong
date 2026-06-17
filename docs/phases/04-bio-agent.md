# Phase 4: BIO 섹터 에이전트 (Dr. Cell)

다음 내용을 Claude Code 새 세션에 그대로 붙여넣으세요.

---

DealSync Phase 4를 진행합니다.
W님(임상약리학 박사 + 생물통계학 석사)의 도메인 전문성을 그대로 제품화하는 핵심 모듈입니다.

## 작업 목표

BIO 섹터 전용 AI 에이전트 "Dr. Cell" 구현 - 5가지 특화 기능

## Dr. Cell 페르소나

- **이름:** Dr. Cell (닥터 셀)
- **배경:** 임상약리학 박사, 생물통계학 석사, 100건+ 임상 분석 경험
- **성격:** ENTP, "데이터는 임상으로 증명된다"
- **시각 정체성:** 시안블루 #0EA5E9, 🧬 이모지

## 1. 파이프라인 NPV 분석기

`/agents/sectors/bio/pipeline-npv.ts`:

```typescript
// BIO Industry Analysis 2024 (Biotechnology Innovation Organization)
export const CLINICAL_SUCCESS_RATES = {
  oncology:        { P1_to_P2: 0.524, P2_to_P3: 0.246, P3_to_NDA: 0.401, NDA_to_Approval: 0.821 },
  cardiovascular:  { P1_to_P2: 0.659, P2_to_P3: 0.301, P3_to_NDA: 0.515, NDA_to_Approval: 0.876 },
  cns:             { P1_to_P2: 0.732, P2_to_P3: 0.299, P3_to_NDA: 0.516, NDA_to_Approval: 0.842 },
  infectious:      { P1_to_P2: 0.701, P2_to_P3: 0.434, P3_to_NDA: 0.660, NDA_to_Approval: 0.910 },
  metabolic:       { P1_to_P2: 0.643, P2_to_P3: 0.336, P3_to_NDA: 0.585, NDA_to_Approval: 0.847 },
  autoimmune:      { P1_to_P2: 0.667, P2_to_P3: 0.330, P3_to_NDA: 0.626, NDA_to_Approval: 0.842 },
  rare_disease:    { P1_to_P2: 0.760, P2_to_P3: 0.502, P3_to_NDA: 0.741, NDA_to_Approval: 0.890 },
  ophthalmology:   { P1_to_P2: 0.847, P2_to_P3: 0.453, P3_to_NDA: 0.582, NDA_to_Approval: 0.890 },
  respiratory:     { P1_to_P2: 0.625, P2_to_P3: 0.378, P3_to_NDA: 0.555, NDA_to_Approval: 0.840 },
  hematology:      { P1_to_P2: 0.711, P2_to_P3: 0.527, P3_to_NDA: 0.752, NDA_to_Approval: 0.866 },
  others:          { P1_to_P2: 0.632, P2_to_P3: 0.307, P3_to_NDA: 0.581, NDA_to_Approval: 0.860 }
} as const;

export type Pipeline = {
  name: string;
  indication: keyof typeof CLINICAL_SUCCESS_RATES;
  currentStage: 'preclinical' | 'P1' | 'P2' | 'P3' | 'NDA' | 'approved';
  estimatedLaunchYear: number;
  peakSalesEstimate: number;  // 단위: 백만달러 또는 백만원 (단위는 별도 명시)
  patentExpiryYear?: number;
};

export type PipelineNPVResult = {
  cumulativeProbability: number;     // 현재 단계에서 승인까지 누적 성공확률
  stageProbabilities: { stage: string; probability: number }[];
  expectedPeakSales: number;          // Risk-adjusted peak sales
  riskAdjustedNPV: number;
  yearsToMarket: number;
  benchmarkVsIndustry: { metric: string; company: number; industry: number }[];
};

export function calculatePipelineNPV(
  pipeline: Pipeline,
  options: {
    discountRate?: number;      // 기본 12%
    salesDuration?: number;     // 매출 지속 기간 (년)
    currency?: 'USD' | 'KRW';
  } = {}
): PipelineNPVResult {
  const { discountRate = 0.12, salesDuration = 10 } = options;
  const rates = CLINICAL_SUCCESS_RATES[pipeline.indication];
  
  // 1. 현재 단계 → 승인까지 누적 확률
  const stageOrder = ['P1', 'P2', 'P3', 'NDA'];
  const transitions = ['P1_to_P2', 'P2_to_P3', 'P3_to_NDA', 'NDA_to_Approval'] as const;
  
  let cumulativeProbability = 1.0;
  const stageProbabilities: { stage: string; probability: number }[] = [];
  
  const startIdx = stageOrder.indexOf(pipeline.currentStage);
  if (startIdx === -1 && pipeline.currentStage !== 'preclinical') {
    cumulativeProbability = 1.0; // 이미 승인됨
  } else {
    const realStart = pipeline.currentStage === 'preclinical' ? 0 : startIdx;
    for (let i = realStart; i < transitions.length; i++) {
      const prob = rates[transitions[i]];
      cumulativeProbability *= prob;
      stageProbabilities.push({ stage: transitions[i], probability: prob });
    }
    // Preclinical→P1은 별도 데이터 부족, 0.5로 가정
    if (pipeline.currentStage === 'preclinical') {
      cumulativeProbability *= 0.5;
    }
  }
  
  // 2. Risk-adjusted peak sales
  const expectedPeakSales = pipeline.peakSalesEstimate * cumulativeProbability;
  
  // 3. NPV 계산 (출시 후 10년간 균등 매출 가정, ramp-up 단순화)
  const yearsToMarket = pipeline.estimatedLaunchYear - new Date().getFullYear();
  let npv = 0;
  for (let year = 1; year <= salesDuration; year++) {
    const yearTotal = yearsToMarket + year;
    npv += expectedPeakSales / Math.pow(1 + discountRate, yearTotal);
  }
  
  // 4. 산업 벤치마크 비교
  const benchmarkVsIndustry = [
    {
      metric: '누적 성공확률',
      company: cumulativeProbability,
      industry: 0.10  // 산업 평균 약 10%
    }
  ];
  
  return {
    cumulativeProbability,
    stageProbabilities,
    expectedPeakSales,
    riskAdjustedNPV: npv,
    yearsToMarket,
    benchmarkVsIndustry,
  };
}

// 다중 파이프라인 합산
export function calculatePortfolioNPV(pipelines: Pipeline[], options?: any) {
  const results = pipelines.map(p => calculatePipelineNPV(p, options));
  const totalNPV = results.reduce((sum, r) => sum + r.riskAdjustedNPV, 0);
  return { totalNPV, individual: results };
}
```

## 2. FDA/MFDS 벤치마크

`/agents/sectors/bio/fda-benchmark.ts`:

```typescript
const OPENFDA_BASE = 'https://api.fda.gov/drug/drugsfda.json';

export type DrugApproval = {
  brandName: string;
  genericName: string;
  applicant: string;
  approvalDate: string;
  indication: string;
  developmentYears?: number;
  peakSales?: number;
};

export async function searchFDAApprovals(
  indication: string,
  mechanism: string,
  limit = 5
): Promise<DrugApproval[]> {
  // OpenFDA API 검색
  const query = encodeURIComponent(`indications_and_usage:"${indication}"`);
  const url = `${OPENFDA_BASE}?search=${query}&limit=${limit}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    
    return (data.results || []).map((r: any) => ({
      brandName: r.openfda?.brand_name?.[0] || '',
      genericName: r.openfda?.generic_name?.[0] || '',
      applicant: r.sponsor_name || '',
      approvalDate: r.submissions?.[0]?.submission_status_date || '',
      indication: r.openfda?.pharm_class_epc?.[0] || indication,
    }));
  } catch (error) {
    console.error('FDA API error:', error);
    return [];
  }
}

// MFDS (한국 식약처) 데이터 - API 없으므로 캐시된 주요 데이터 사용
const MFDS_RECENT_APPROVALS: DrugApproval[] = [
  // 캐시된 한국 신약 승인 데이터
  // 실제로는 Supabase에 별도 테이블로 관리
];

export async function searchMFDSApprovals(indication: string, limit = 5) {
  return MFDS_RECENT_APPROVALS
    .filter(d => d.indication.includes(indication))
    .slice(0, limit);
}
```

## 3. PubMed 논문 자동 인용

`/agents/sectors/bio/pubmed-search.ts`:

```typescript
const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type PubmedArticle = {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi?: string;
  abstract?: string;
  summary?: string;  // AI 생성 요약
};

export async function searchPubmed(query: string, limit = 5): Promise<PubmedArticle[]> {
  try {
    // 1. esearch로 PMID 목록 가져오기
    const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const pmids: string[] = searchData.esearchresult?.idlist || [];
    
    if (pmids.length === 0) return [];
    
    // 2. esummary로 메타데이터 가져오기
    const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();
    
    return pmids.map(pmid => {
      const article = summaryData.result?.[pmid];
      if (!article) return null;
      
      return {
        pmid,
        title: article.title || '',
        authors: (article.authors || []).map((a: any) => a.name).slice(0, 3),
        journal: article.fulljournalname || article.source || '',
        year: article.pubdate?.split(' ')[0] || '',
        doi: article.elocationid?.replace('doi: ', '') || undefined,
      };
    }).filter(Boolean) as PubmedArticle[];
  } catch (error) {
    console.error('PubMed search error:', error);
    return [];
  }
}

// 핵심 인사이트 자동 요약
export async function summarizeArticles(
  articles: PubmedArticle[],
  context: string
): Promise<PubmedArticle[]> {
  const { callClaudeJSON } = await import('@/lib/anthropic/client');
  
  if (articles.length === 0) return articles;
  
  const result = await callClaudeJSON<{ summaries: { pmid: string; summary: string }[] }>({
    system: '당신은 의학 논문을 1-2문장으로 요약하는 전문가입니다.',
    messages: [{
      role: 'user',
      content: `다음 논문들을 "${context}" 맥락에서 각각 한국어 1문장으로 요약하세요.

논문: ${JSON.stringify(articles.map(a => ({ pmid: a.pmid, title: a.title, journal: a.journal })))}

JSON: { "summaries": [{ "pmid": "...", "summary": "..." }] }`
    }],
    maxTokens: 2048,
  });
  
  const summaryMap = new Map(result.summaries.map(s => [s.pmid, s.summary]));
  return articles.map(a => ({ ...a, summary: summaryMap.get(a.pmid) }));
}
```

## 4. 경쟁 파이프라인 매핑 (ClinicalTrials.gov)

`/agents/sectors/bio/competing-pipelines.ts`:

```typescript
const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies';

export async function searchClinicalTrials(
  condition: string,
  intervention?: string,
  phase?: string
) {
  const params = new URLSearchParams({
    'query.cond': condition,
    'pageSize': '20',
    'format': 'json',
  });
  if (intervention) params.append('query.intr', intervention);
  if (phase) params.append('filter.advanced', `AREA[Phase]${phase}`);
  
  try {
    const res = await fetch(`${CT_BASE}?${params}`);
    const data = await res.json();
    
    return (data.studies || []).map((s: any) => ({
      nctId: s.protocolSection?.identificationModule?.nctId,
      title: s.protocolSection?.identificationModule?.briefTitle,
      sponsor: s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name,
      phase: s.protocolSection?.designModule?.phases?.join(', '),
      status: s.protocolSection?.statusModule?.overallStatus,
      startDate: s.protocolSection?.statusModule?.startDateStruct?.date,
    }));
  } catch (error) {
    console.error('ClinicalTrials.gov error:', error);
    return [];
  }
}
```

## 5. BIO 분석 메인 함수

`/agents/sectors/bio/index.ts`:

```typescript
import { StructuredData } from '@/types/parsed';
import { calculatePipelineNPV, type Pipeline } from './pipeline-npv';
import { searchFDAApprovals } from './fda-benchmark';
import { searchPubmed, summarizeArticles } from './pubmed-search';
import { searchClinicalTrials } from './competing-pipelines';
import { callClaudeJSON } from '@/lib/anthropic/client';

export const DR_CELL_SYSTEM_PROMPT = `당신은 Dr. Cell, 20년 경력의 한국 바이오 전문 VC 심사역입니다.
임상약리학 박사 + 임상시험 100건 분석 경험을 보유하고 있습니다.

분석 시 반드시 포함:
1. 파이프라인의 임상 단계와 IND/NDA 상태
2. 적응증의 시장 규모와 미충족 의료수요(unmet need)
3. 작용기전(MoA)의 과학적 타당성과 차별점
4. 임상시험 디자인의 적절성 (1차 평가변수, 환자 수)
5. 경쟁 파이프라인 대비 우위
6. 라이선스아웃/M&A 가능성 (글로벌 빅파마 관심도)

피해야 할 표현:
- "이 약은 효과적이다" → "임상 데이터상 유효성 신호가 관찰된다"
- "성공할 것이다" → "단계별 성공확률은 X%이며..."
- 과학적 근거 없는 단정

전문 용어 정확히 사용: PoC, MoA, IND, NDA, Endpoint, EMA, KOL, BLA, BTD, ODD, Orphan, Fast Track`;

export async function runBioAnalysis(data: StructuredData) {
  // 1. 자료에서 파이프라인 정보 추출
  const pipelines = await extractPipelinesFromData(data);
  
  // 2. NPV 분석 (병렬)
  const npvResults = pipelines.map(p => ({
    pipeline: p,
    npv: calculatePipelineNPV(p)
  }));
  
  // 3. 외부 데이터 수집 (병렬)
  const [fdaApprovals, pubmedArticles, competingTrials] = await Promise.all([
    pipelines[0] ? searchFDAApprovals(pipelines[0].indication, '', 5) : [],
    pipelines[0] ? searchPubmed(`${pipelines[0].indication} ${data.business?.products?.[0] || ''}`, 5) : [],
    pipelines[0] ? searchClinicalTrials(pipelines[0].indication, undefined, pipelines[0].currentStage) : [],
  ]);
  
  // 4. PubMed 요약
  const summarizedArticles = await summarizeArticles(
    pubmedArticles,
    `${pipelines[0]?.indication} 치료제 개발`
  );
  
  // 5. Claude 종합 분석
  const analysis = await callClaudeJSON<BioAnalysisOutput>({
    system: DR_CELL_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `다음 바이오 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data, null, 2)}
파이프라인 NPV: ${JSON.stringify(npvResults, null, 2)}
FDA 유사 승인: ${JSON.stringify(fdaApprovals, null, 2)}
경쟁 임상: ${JSON.stringify(competingTrials.slice(0, 10), null, 2)}
관련 논문: ${JSON.stringify(summarizedArticles, null, 2)}

JSON으로 응답:
{
  "pipelineAssessment": "파이프라인 종합 평가 (500자)",
  "scientificMerit": "과학적 타당성 (300자)",
  "regulatoryStrategy": "규제 전략 평가 (300자)",
  "competitiveLandscape": "경쟁 환경 (300자)",
  "keyOpinionLeaders": ["관련 KOL 추천 3명"],
  "criticalRisks": ["주요 리스크 3가지"],
  "questionsForFounders": ["창업자에게 물을 질문 5개"],
  "investmentRecommendation": "투자의견 (300자)"
}`
    }],
    maxTokens: 4096,
  });
  
  return {
    pipelines,
    npvResults,
    fdaApprovals,
    pubmedArticles: summarizedArticles,
    competingTrials,
    analysis,
  };
}

async function extractPipelinesFromData(data: StructuredData): Promise<Pipeline[]> {
  // 데이터에서 파이프라인 정보 추출 (Claude API)
  const result = await callClaudeJSON<{ pipelines: Pipeline[] }>({
    system: DR_CELL_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `다음 자료에서 파이프라인 정보를 추출하세요:
${JSON.stringify(data, null, 2)}

각 파이프라인: { name, indication, currentStage, estimatedLaunchYear, peakSalesEstimate (백만달러) }
indication은 다음 중 하나: oncology, cardiovascular, cns, infectious, metabolic, autoimmune, rare_disease, ophthalmology, respiratory, hematology, others

JSON: { "pipelines": [...] }
정보가 부족하면 빈 배열 반환.`
    }],
    maxTokens: 2048,
  });
  
  return result.pipelines || [];
}

type BioAnalysisOutput = {
  pipelineAssessment: string;
  scientificMerit: string;
  regulatoryStrategy: string;
  competitiveLandscape: string;
  keyOpinionLeaders: string[];
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
};
```

## 6. BIO 보고서 부록 자동 생성

`/agents/sectors/bio/report-appendix.ts`:

5페이지 부록 구조 정의:

```typescript
export function generateBioAppendix(analysis: any): AppendixSection[] {
  return [
    {
      title: '파이프라인 Risk-Adjusted NPV 분석',
      type: 'table',
      data: analysis.npvResults.map((r: any) => ({
        파이프라인: r.pipeline.name,
        적응증: r.pipeline.indication,
        현재단계: r.pipeline.currentStage,
        '누적 성공확률': `${(r.npv.cumulativeProbability * 100).toFixed(1)}%`,
        'Risk-Adj NPV': `$${(r.npv.riskAdjustedNPV / 1e6).toFixed(1)}M`,
      }))
    },
    {
      title: '임상단계 성공확률 (해당 회사 vs 산업 평균)',
      type: 'comparison_chart',
      data: analysis.npvResults[0]?.npv.benchmarkVsIndustry
    },
    {
      title: 'FDA 유사 적응증 승인 사례',
      type: 'table',
      data: analysis.fdaApprovals
    },
    {
      title: '핵심 작용기전 관련 논문 (PubMed)',
      type: 'reference_list',
      data: analysis.pubmedArticles
    },
    {
      title: '경쟁 파이프라인 매트릭스',
      type: 'table',
      data: analysis.competingTrials.slice(0, 15)
    },
  ];
}
```

## 7. UI - Dr. Cell 카드

`/components/agents/dr-cell-card.tsx`:

에이전트 소개 카드 (대시보드에 표시):
- 🧬 아이콘 + "Dr. Cell" 이름
- "임상약리학 박사 출신 AI 심사역"
- 특화 기능 배지: 파이프라인 NPV, FDA 벤치마크, PubMed 인용, CRIS 연동
- "이 에이전트로 분석 시작" 버튼

## 8. API 라우트

`/app/api/agents/bio/analyze/route.ts`:
- POST: { structuredData }
- 응답: 전체 BIO 분석 결과

`/app/api/agents/bio/pipeline-npv/route.ts`:
- POST: { pipelines, options }
- 응답: NPV 계산 결과 (단독 호출 가능)

## 9. 테스트

`/test-data/bio-sample.json`:
```json
{
  "companyInfo": { "name": "샘플바이오", "foundedYear": "2022" },
  "business": {
    "summary": "면역항암제 신약 개발 바이오텍",
    "products": ["KX-101 (Anti-PD-L1 항체)"]
  },
  "financials": { "fundingHistory": [{ "round": "Pre-A", "amount": "30억원", "date": "2024-03" }] }
}
```

테스트 스크립트 `/scripts/test-bio.ts`:
- 위 JSON으로 `runBioAnalysis` 실행
- 결과 콘솔 출력
- 실행: `npx tsx scripts/test-bio.ts`

## 완료 체크리스트

- [ ] Pipeline NPV 계산기 (11개 질환군 데이터)
- [ ] FDA 벤치마크 (OpenFDA API)
- [ ] PubMed 검색 + 요약
- [ ] ClinicalTrials.gov 연동
- [ ] BIO 메인 분석 함수
- [ ] 보고서 부록 생성기
- [ ] Dr. Cell UI 카드
- [ ] API 라우트 2개
- [ ] 테스트 스크립트

git commit 후 "Phase 4 완료. Phase 5 (Template Engine)을 진행하세요"라고 출력하세요.
