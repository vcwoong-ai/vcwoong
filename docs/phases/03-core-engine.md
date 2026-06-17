# Phase 3: 문서 파싱 + 공통 분석 코어

다음 내용을 Claude Code 새 세션에 그대로 붙여넣으세요.

---

DealSync Phase 3을 진행합니다.
다양한 입력 자료를 파싱하고, 모든 섹터가 공통으로 사용하는 분석 코어를 구현합니다.

## 작업 목표

1. 다양한 입력 형식 파싱 엔진 (PDF/PPTX/Excel/URL/텍스트)
2. 공통 분석 코어 (회사/팀/재무/리스크) - 모든 섹터 공유
3. Claude API 래퍼 (재시도, 에러, 토큰 추적)
4. 섹터 자동 감지 (입력 자료 → 적합 섹터 추천)

## 1. Claude API 래퍼

`/lib/anthropic/client.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export async function callClaude({
  system,
  messages,
  maxTokens = 4096,
  temperature = 0.3,
  retries = 2,
}: {
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  temperature?: number;
  retries?: number;
}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      });
      
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      
      return {
        text,
        usage: response.usage,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

// JSON 응답 전용 헬퍼 (마크다운 코드블록 자동 제거)
export async function callClaudeJSON<T>(params: Parameters<typeof callClaude>[0]): Promise<T> {
  const { text } = await callClaude(params);
  const cleaned = text
    .replace(/^```json\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(`Failed to parse JSON response: ${cleaned.slice(0, 200)}`);
  }
}
```

## 2. 통합 문서 파서

### 표준 출력 포맷

```typescript
// /types/parsed.ts
export type ParsedDocument = {
  sourceType: 'pdf' | 'pptx' | 'excel' | 'url' | 'text' | 'docx';
  sourceName: string;
  rawText: string;
  metadata?: {
    pageCount?: number;
    slideCount?: number;
    sheets?: string[];
  };
  structured?: Partial<StructuredData>;
};

export type StructuredData = {
  companyInfo: {
    name?: string;
    foundedYear?: string;
    ceo?: string;
    address?: string;
    website?: string;
    employeeCount?: number;
  };
  business: {
    summary?: string;
    products?: string[];
    targetMarket?: string;
    revenueModel?: string;
  };
  market: {
    tam?: string;
    sam?: string;
    som?: string;
    competitors?: string[];
    marketSize?: string;
  };
  financials: {
    revenue?: { year: string; amount: string }[];
    expenses?: string;
    burnRate?: string;
    runway?: string;
    fundingHistory?: { round: string; amount: string; date: string }[];
  };
  team: {
    members?: { name: string; role: string; background?: string }[];
    totalCount?: number;
  };
  ask: {
    amount?: string;
    valuation?: string;
    purpose?: string;
  };
};
```

### `/lib/parsers/pdf.ts`
- `pdf-parse` 사용
- 페이지별 텍스트 추출
- 메타데이터 (저자, 제목) 포함

### `/lib/parsers/pptx.ts`
- pptxgenjs는 생성만 가능 → `unzipper` + xml 파싱으로 직접 구현
- 슬라이드별 텍스트 + 노트 추출
- 슬라이드 제목을 섹션 키로 활용

### `/lib/parsers/xlsx.ts`
- `xlsx` 라이브러리
- 시트별 데이터를 JSON 배열로 변환
- 숫자 단위 자동 감지 (원/달러/% 등)
- 첫 행을 헤더로 가정

### `/lib/parsers/docx.ts`
- `mammoth` 사용
- 헤더/문단 구조 보존

### `/lib/parsers/url.ts`
- `fetch` + 정규식으로 메인 텍스트 추출
- og:description, meta description 우선 활용
- 네이버 뉴스, 플래텀 등 한국 사이트 패턴 처리

### `/lib/parsers/index.ts`
통합 진입점:
```typescript
export async function parseDocument(
  file: File | string,
  type: ParsedDocument['sourceType']
): Promise<ParsedDocument> {
  switch (type) {
    case 'pdf': return parsePDF(file as File);
    case 'pptx': return parsePPTX(file as File);
    case 'excel': return parseXLSX(file as File);
    case 'docx': return parseDOCX(file as File);
    case 'url': return parseURL(file as string);
    case 'text': return { sourceType: 'text', sourceName: 'manual', rawText: file as string };
  }
}
```

각 파서는 실패 시에도 `rawText`만이라도 반환하도록 fallback 구현.

## 3. AI 기반 구조화

`/lib/parsers/structurize.ts`:
파싱된 raw text → 구조화된 StructuredData로 변환

```typescript
export async function structurizeDocument(
  parsed: ParsedDocument
): Promise<StructuredData> {
  const SYSTEM = `당신은 한국 VC 심사역을 돕는 정보 추출 AI입니다.
주어진 IR 자료에서 회사 정보를 추출해 구조화된 JSON으로 반환합니다.
확인되지 않은 정보는 null로 두고, 절대 추측하지 마세요.`;

  const result = await callClaudeJSON<StructuredData>({
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `다음 자료에서 정보를 추출하세요:

${parsed.rawText.slice(0, 30000)}

응답 형식 (JSON):
{
  "companyInfo": {...},
  "business": {...},
  "market": {...},
  "financials": {...},
  "team": {...},
  "ask": {...}
}

규칙:
- 확인 안 된 필드는 생략
- 금액은 원본 표기 그대로 (예: "10억원", "$1M")
- 절대 추측하지 말 것`
    }],
    maxTokens: 4096,
  });

  return result;
}
```

## 4. 섹터 자동 감지

`/agents/orchestrator/sector-detector.ts`:

```typescript
export const SECTOR_KEYWORDS = {
  bio: ['임상', '신약', '바이오', '제약', '의약품', 'FDA', '파이프라인', 'P1', 'P2', 'P3', '치료제', 'NDA', 'IND', '항체', '백신'],
  it_saas: ['SaaS', '구독', 'MRR', 'ARR', 'API', '클라우드', 'B2B', 'CRM', 'ERP', '소프트웨어', 'PaaS', 'Churn', 'LTV'],
  ai_deeptech: ['AI', '인공지능', 'LLM', '머신러닝', '딥러닝', 'GPU', '모델', 'HuggingFace', 'Transformer', '추론', 'fine-tuning'],
  manufacturing: ['제조', '공장', '양산', '특허', '하드웨어', '센서', '반도체', '소재', '부품', 'BOM', '품질', 'GMP'],
  content: ['콘텐츠', '웹툰', '게임', '엔터', '크리에이터', 'IP', '미디어', '스트리밍', '구독자', '팬덤'],
  fintech: ['핀테크', '금융', '결제', '대출', '보험', '투자', '자산관리', '마이데이터', '전자금융', '암호화폐']
};

export async function detectSectors(
  data: StructuredData,
  rawText: string
): Promise<{ primary: string; secondary: string[]; confidence: number }> {
  // 1. 키워드 기반 1차 스코어링
  const scores: Record<string, number> = {};
  const text = (rawText + ' ' + JSON.stringify(data)).toLowerCase();
  
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    scores[sector] = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
  }
  
  // 2. Claude API로 정밀 분류 (상위 3개 후보만 비교)
  const top3 = Object.entries(scores)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([s]) => s);
  
  // Claude에게 최종 판단 요청
  const result = await callClaudeJSON<{ primary: string; secondary: string[]; confidence: number; reasoning: string }>({
    system: '당신은 스타트업 분류 전문가입니다.',
    messages: [{
      role: 'user',
      content: `다음 스타트업을 분류하세요:
사업 요약: ${data.business?.summary || ''}
제품: ${data.business?.products?.join(', ') || ''}
키워드 분석 후보: ${top3.join(', ')}

가능한 섹터: bio, it_saas, ai_deeptech, manufacturing, content, fintech

JSON: { "primary": "...", "secondary": ["..."], "confidence": 0.0~1.0, "reasoning": "..." }
융합 산업(예: AI 신약개발 = ai_deeptech + bio)이면 secondary에 추가`
    }],
    maxTokens: 1024,
  });

  return result;
}
```

## 5. 공통 분석 코어

각 모듈은 `StructuredData`를 받아 분석 결과를 반환:

### `/agents/core/company-info.ts`
```typescript
export async function analyzeCompanyInfo(data: StructuredData) {
  // 회사 개요, 설립일, 소재지, CEO 등 기본 정보 정리
  // 누락 정보에 대한 "확인 필요" 플래그
}
```

### `/agents/core/team-analysis.ts`
- 핵심 인력 이력 분석
- 도메인 적합성 평가
- 팀 규모 적정성

### `/agents/core/financials.ts`
- 매출 추이 + 성장률
- Burn rate / Runway 계산
- 이전 투자 라운드 정리
- 재무 건전성 신호

### `/agents/core/risks.ts`
- 일반 리스크 5가지 자동 도출:
  - 시장 리스크
  - 팀 리스크
  - 재무 리스크
  - 경쟁 리스크
  - 규제 리스크

각 모듈의 공통 인터페이스:
```typescript
export type AnalysisResult = {
  sectionId: string;
  content: Record<string, any>;
  confidence: number;
  missingFields: string[];
  warnings: string[];
};
```

## 6. 메인 분석 오케스트레이터

`/agents/orchestrator/index.ts`:

```typescript
export async function runFullAnalysis(
  parsedDocs: ParsedDocument[],
  options: {
    selectedSectors: string[];
    templateSections: TemplateSection[];
  }
) {
  // 1. 모든 문서 통합
  const merged = mergeDocuments(parsedDocs);
  
  // 2. 구조화
  const structured = await structurizeDocument(merged);
  
  // 3. 섹터 자동 감지 (필요 시)
  const detected = options.selectedSectors.length === 0
    ? await detectSectors(structured, merged.rawText)
    : { primary: options.selectedSectors[0], secondary: options.selectedSectors.slice(1), confidence: 1.0 };
  
  // 4. 공통 분석 (병렬 실행)
  const coreResults = await Promise.all([
    analyzeCompanyInfo(structured),
    analyzeTeam(structured),
    analyzeFinancials(structured),
    analyzeRisks(structured),
  ]);
  
  // 5. 섹터별 분석 (Phase 4 이후 채워짐)
  const sectorResults: any[] = [];
  // const sectorResults = await runSectorAgents(detected, structured);
  
  // 6. 통합 결과 반환
  return {
    structured,
    detected,
    coreResults,
    sectorResults,
  };
}
```

## 7. API 라우트

### `/app/api/parse/route.ts`
- POST: 파일 업로드 → 파싱 → 구조화
- 응답: `ParsedDocument` + `StructuredData`

### `/app/api/analyze/route.ts`
- POST: { parsedDocs, selectedSectors, templateId }
- 응답: 전체 분석 결과 + reportId 생성

### `/app/api/detect-sector/route.ts`
- POST: { text or structuredData }
- 응답: { primary, secondary, confidence }

## 8. 사용량 추적

`/lib/usage-tracker.ts`:
- 모든 Claude API 호출 후 usage_logs에 기록
- 토큰 수, 비용 (claude-sonnet-4-6 가격 기준)
- 사용자별 월간 사용량 합산 함수

## 9. 테스트용 데이터

`/test-data/` 폴더 생성:
- `sample-ir.pdf` (자리 표시자, 사용자가 직접 추가)
- `sample-financials.xlsx` (자리 표시자)
- `mock-parsed.json` - 테스트용 mock 데이터

## 완료 체크리스트

- [ ] Claude API 래퍼 (재시도/JSON 헬퍼)
- [ ] PDF/PPTX/Excel/DOCX/URL/텍스트 파서
- [ ] AI 기반 구조화
- [ ] 섹터 자동 감지
- [ ] 공통 분석 4모듈 (회사/팀/재무/리스크)
- [ ] 오케스트레이터
- [ ] API 라우트 3개
- [ ] 사용량 추적

git commit 후 "Phase 3 완료. Phase 4 (BIO Agent)를 진행하세요"라고 출력하세요.
