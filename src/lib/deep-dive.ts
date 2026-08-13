/**
 * 보조 리서치(딥다이브 검증) — 보고서 핵심 주장을 웹·뉴스 외부 자료로 교차 검증.
 *
 * `evidence.ts`와 방향이 반대다:
 *   - evidence.ts: 보고서 숫자가 업로드 문서 "안"에 있는지 대조 (내부 검증,
 *     AI 호출 없음, 무료)
 *   - 이 파일: 보고서 핵심 주장을 웹·뉴스에서 "밖"으로 찾아 교차 검증
 *     (외부 확장, 검색 API + AI 호출 필요)
 *
 * VCNote의 "딥다이브 검증"에 대응하는 기능이라 이름을 맞췄다. 검색 소스는
 * Naver 검색 API(뉴스+웹문서) — 한국 VC 도메인이라 한국어 뉴스·웹 커버리지가
 * 훨씬 낫고, 무료 티어(일 25,000건)로 충분하다.
 *
 * API 키(NAVER_CLIENT_ID/SECRET) 없으면 검색 없이 빈 결과 — KIPRIS/DART와
 * 같은 원칙.
 */
import { generateText, isAIConfigured } from "@/lib/claude";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID ?? "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET ?? "";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: "news" | "web";
  date?: string;
}

/** Naver 검색 응답은 매칭된 단어를 <b> 태그로 감싸고 HTML 엔티티를 쓴다 */
export function stripNaverMarkup(text: string): string {
  return text
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

async function naverSearch(
  endpoint: "news" | "webkr",
  query: string,
  display: number
): Promise<Array<{ title: string; description: string; link: string; pubDate?: string }>> {
  const url = `https://openapi.naver.com/v1/search/${endpoint}.json?query=${encodeURIComponent(query)}&display=${display}&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Naver ${endpoint} HTTP ${res.status}`);
  const json = (await res.json()) as { items?: Array<{ title: string; description: string; link: string; pubDate?: string }> };
  return json.items ?? [];
}

/**
 * 뉴스 + 웹문서를 함께 검색한다. 키 없으면 빈 배열(호출 자체를 안 함).
 * 하나가 실패해도 다른 하나는 살린다 — 뉴스 API 장애로 웹 검색까지
 * 죽으면 안 된다.
 */
export async function searchExternal(
  query: string,
  perSource = 3
): Promise<SearchResult[]> {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return [];

  const [newsResult, webResult] = await Promise.allSettled([
    naverSearch("news", query, perSource),
    naverSearch("webkr", query, perSource),
  ]);

  const results: SearchResult[] = [];
  if (newsResult.status === "fulfilled") {
    for (const item of newsResult.value) {
      results.push({
        title: stripNaverMarkup(item.title),
        snippet: stripNaverMarkup(item.description),
        url: item.link,
        source: "news",
        date: item.pubDate,
      });
    }
  } else {
    console.warn("[DeepDive] 뉴스 검색 실패:", newsResult.reason);
  }
  if (webResult.status === "fulfilled") {
    for (const item of webResult.value) {
      results.push({
        title: stripNaverMarkup(item.title),
        snippet: stripNaverMarkup(item.description),
        url: item.link,
        source: "web",
      });
    }
  } else {
    console.warn("[DeepDive] 웹 검색 실패:", webResult.reason);
  }

  return results;
}

// ────────────────────────────────────────────────────────────
// 검증 대상 주장 추출
// ────────────────────────────────────────────────────────────

export interface Claim {
  sectionKey: string;
  text: string;
  /** 검색 쿼리로 쓸 핵심 키워드 (회사명과 조합) */
  keyword: string;
}

/**
 * 보고서 본문은 마크다운이라 `**굵게**`·`###`·표 구분자가 섞여 있다.
 * 그대로 두면 화면에 별표가 노출되고, 검색 쿼리에도 잡소리가 섞인다.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s*/g, "") // 제목
    .replace(/\*\*(.+?)\*\*/g, "$1") // 굵게
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1") // 기울임
    .replace(/`([^`]+)`/g, "$1") // 인라인 코드
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 링크
    .replace(/^[-*+]\s+/g, "") // 불릿
    .replace(/^>\s*/g, "") // 인용
    .replace(/\|/g, " ") // 표 구분자
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "이 값은 확인이 필요하다" 같은 문장은 사실 주장이 아니라 **자료가 없다는
 * 메모**다. 외부에서 검증할 대상이 아닌데도 숫자가 섞여 있으면 정규식에
 * 걸려버려서, 실제로 프로덕션에서 "Rule of 40 … 데이터가 모두 '확인 필요'
 * 입니다"가 검증 대상으로 뽑히는 오탐이 났다.
 *
 * AI가 자료 부족을 표시할 때 쓰는 상투구를 먼저 걸러낸다.
 */
const UNVERIFIABLE_MARKERS = [
  "확인 필요",
  "확인이 필요",
  "추가 확인",
  "미확인",
  "자료 없음",
  "데이터 없음",
  "정보 없음",
  "출처 확인",
  "산출 불가",
  "판단 불가",
  "제공되지 않",
  "명시되지 않",
  "기재되지 않",
  "알 수 없",
  "해당 없음",
];

/**
 * "(출처 확인 필요)", "(추정치)" 같은 괄호 주석은 주장에 달린 **꼬리표**지
 * 주장 자체가 아니다.
 *
 * 이걸 구분하지 않고 "확인 필요"가 있으면 무조건 버렸더니, 정작
 * "시장 규모는 3.2조 원으로 추정된다(출처 확인 필요)"처럼 **출처가 없어서
 * 외부 검증이 가장 필요한** 문장까지 통째로 날아갔다. 괄호 주석을 먼저
 * 떼어낸 뒤 남은 본문으로 판단한다.
 */
function stripCaveats(sentence: string): string {
  return sentence
    .replace(/[（(][^)）]*(?:확인|미상|추정|출처|자료)[^)）]*[)）]/g, "")
    .trim();
}

function isUnverifiable(sentence: string): boolean {
  const core = stripCaveats(sentence);
  return UNVERIFIABLE_MARKERS.some((m) => core.includes(m));
}

/**
 * 문장 단위로 나눈다. "18.5%"처럼 숫자 뒤에 오는 마침표(소수점)는 문장
 * 끝이 아니므로 분리하지 않는다 — 마침표 뒤에 숫자가 바로 오면 소수점으로
 * 보고 건너뛴다.
 */
function splitSentences(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/\.(?!\d)\s*/))
    .map((s) => stripMarkdown(s))
    .filter(Boolean);
}

/**
 * 외부 검색으로 검증할 만한 문장만 골라낸다 — 전부 검색하면 API·AI 비용이
 * 선형으로 늘고 결과도 노이즈투성이가 되므로, 시장 규모·성장률·순위
 * 주장처럼 실제로 "밖에서 찾을 수 있는" 유형만 남긴다.
 *
 * 문장 단위(splitSentences)로 먼저 자른 뒤 문장 전체에 대해 매칭하므로,
 * 패턴 자체는 "문장 경계까지 몇 글자"를 신경 쓸 필요가 없다 — 소수점이
 * 섞여 있어도 문장 분리 단계에서 이미 안전하게 처리된다.
 */
const CLAIM_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "시장 규모",
    // 원화(조/억)뿐 아니라 달러 표기도 흔하다: "150억 달러 규모"
    re: /시장\s*(?:규모|크기)[\s\S]*?\d[\d,.]*\s*(?:조|억|만)?\s*(?:원|달러|USD)/i,
  },
  {
    label: "성장률",
    // "연평균 성장률 18.5%"와 "연 10% 내외 성장" 둘 다 잡는다 —
    // 후자는 '성장률'이라는 단어가 없어서 예전 패턴으로는 놓쳤다.
    re: /(?:(?:연평균\s*)?(?:성장률|CAGR)[\s\S]*?\d[\d.]*\s*%)|(?:\d[\d.]*\s*%\s*(?:내외\s*|가량\s*|수준\s*)?(?:성장|증가))/i,
  },
  {
    label: "시장 지위",
    // "국내 최대"는 뺐다. 마케팅 수식어라 아무 회사에나 붙는데, 실제로
    // "국내 최대 B2B 핀테크 기업 WebCash에 모듈을 공급"처럼 **고객사**를
    // 수식하는 문장이 심사 대상 기업의 시장 지위 주장으로 잘못 뽑혔다.
    re: /업계\s*(?:최초|유일)|시장\s*점유율\s*\d|국내\s*1위|글로벌\s*\d위|점유율\s*\d[\d.]*\s*%/,
  },
];

/**
 * 검색 쿼리를 만든다.
 *
 * 예전엔 `회사명 + 라벨`("데모회사 시장 지위")로 검색했는데, 이런 문자열은
 * 실제 기사 제목에 나올 리가 없어서 검색 결과가 늘 0건이었다. 키를 넣어도
 * "외부 자료를 찾지 못했습니다"만 뜨던 원인.
 *
 * 핵심은 **주장의 종류에 따라 주어가 다르다**는 점이다:
 *  - 시장 규모·성장률 → 회사가 아니라 *시장*에 대한 주장이라 회사명을 넣으면
 *    오히려 검색이 망가진다. "항암제 시장 규모"로 물어야 한다.
 *  - 시장 지위 → 회사에 대한 주장이라 회사명이 필요하다.
 */
export function buildSearchQuery(
  claim: { text: string; keyword: string },
  companyName: string
): string {
  if (claim.keyword === "시장 지위") {
    return `${companyName} ${claim.text.includes("점유율") ? "점유율" : "시장 지위"}`;
  }

  // "글로벌 항암제 시장", "국내 반도체 검사장비 시장" 등에서 시장 이름을 뽑는다
  const market = /([가-힣A-Za-z0-9·\s]{2,25}?)\s*시장/.exec(claim.text)?.[1]?.trim();
  const suffix = claim.keyword === "성장률" ? "성장률 전망" : "시장 규모";

  if (market) {
    // "국내/글로벌" 같은 지역 수식어는 남겨두는 편이 검색 정확도가 높다
    return `${market} ${suffix}`;
  }
  // 시장 이름을 못 찾으면 회사 기준으로라도 물어본다
  return `${companyName} ${suffix}`;
}

export function extractClaims(
  sections: Array<{ sectionKey: string; content: string }>,
  maxClaims = 5
): Claim[] {
  const claims: Claim[] = [];
  const seen = new Set<string>();

  outer: for (const { sectionKey, content } of sections) {
    for (const sentence of splitSentences(content)) {
      // 자료 부족을 알리는 문장은 검증할 "주장"이 아니다
      if (isUnverifiable(sentence)) continue;
      for (const { label, re } of CLAIM_PATTERNS) {
        if (!re.test(sentence)) continue;
        const text = sentence.replace(/\s+/g, " ").trim();
        if (text.length < 4) break;
        const dedupeKey = text.slice(0, 40);
        if (seen.has(dedupeKey)) break;
        seen.add(dedupeKey);
        claims.push({ sectionKey, text, keyword: label });
        if (claims.length >= maxClaims) break outer;
        break;
      }
    }
  }

  return claims;
}

// ────────────────────────────────────────────────────────────
// AI 판정
// ────────────────────────────────────────────────────────────

export type Verdict = "지지" | "불일치" | "불명확";

export interface VerifiedClaim {
  sectionKey: string;
  claim: string;
  verdict: Verdict;
  rationale: string;
  sources: Array<{ title: string; url: string; source: "news" | "web" }>;
}

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const VALID_VERDICTS: Verdict[] = ["지지", "불일치", "불명확"];

export function normalizeVerdict(v: unknown): Verdict {
  return VALID_VERDICTS.includes(v as Verdict) ? (v as Verdict) : "불명확";
}

/** 검색 결과가 없으면 AI를 부를 필요도 없다 — 판정할 근거가 없으니 항상 불명확 */
async function verifyOneClaim(
  claim: Claim,
  companyName: string,
  results: SearchResult[]
): Promise<VerifiedClaim> {
  if (results.length === 0) {
    return {
      sectionKey: claim.sectionKey,
      claim: claim.text,
      verdict: "불명확",
      rationale: "외부 자료를 찾지 못했습니다",
      sources: [],
    };
  }

  const resultBlock = results
    .map((r, i) => `[${i + 1}] (${r.source}) ${r.title}\n${r.snippet}\n출처: ${r.url}`)
    .join("\n\n");

  const prompt = `## 보고서 주장
"${claim.text}"
(관련 기업: ${companyName})

## 외부 검색 결과
${resultBlock}

## 판정 요청
위 외부 자료가 보고서 주장을 뒷받침하는지 판단하세요.

JSON만 출력:
{
  "verdict": "지지" | "불일치" | "불명확",
  "rationale": "50자 이내, 어느 자료 기반으로 왜 그렇게 판단했는지",
  "sourceIndices": [주장과 직접 관련된 자료 번호만, 예: [1,3]]
}

규칙:
- 검색 결과가 주장과 무관하면(회사 이름만 겹치는 다른 맥락 등) "불명확"
- 자료가 서로 다른 수치를 말해도 방향(성장 중이다 등)이 같으면 "지지"로 볼 수 있음
- 확실하지 않으면 "불일치"가 아니라 "불명확"을 쓸 것 — 없는 근거로 틀렸다고 단정하지 말 것`;

  const result = await generateText([{ role: "user", content: prompt }], {
    systemPrompt:
      "당신은 VC 애널리스트입니다. 검색 결과만 근거로 냉정하게 판단하고, 반드시 JSON만 출력합니다.",
    maxTokens: 512,
    temperature: 0.1,
  });

  const json = extractJson(result.content) ?? {};
  const sourceIndices = Array.isArray(json.sourceIndices)
    ? (json.sourceIndices as unknown[]).filter((n): n is number => typeof n === "number")
    : [];
  const sources = sourceIndices
    .map((i) => results[i - 1])
    .filter((r): r is SearchResult => Boolean(r))
    .map((r) => ({ title: r.title, url: r.url, source: r.source }));

  return {
    sectionKey: claim.sectionKey,
    claim: claim.text,
    verdict: normalizeVerdict(json.verdict),
    rationale: typeof json.rationale === "string" ? json.rationale.slice(0, 150) : "",
    sources,
  };
}

export interface DeepDiveOutcome {
  claims: VerifiedClaim[];
  modelUsed: string;
}

/**
 * 보고서 전체를 대상으로 딥다이브를 실행한다.
 * 주장 추출 → (회사명 + 주장 키워드)로 검색 → AI 판정, 순서로 최대
 * `maxClaims`건까지 처리한다. AI 미설정이면 데모 결과를 낸다.
 */
export async function runDeepDive(params: {
  companyName: string;
  sections: Array<{ sectionKey: string; content: string }>;
  maxClaims?: number;
}): Promise<DeepDiveOutcome> {
  const { companyName, sections, maxClaims = 5 } = params;
  const claims = extractClaims(sections, maxClaims);

  if (claims.length === 0) {
    return { claims: [], modelUsed: "n/a" };
  }

  if (!isAIConfigured()) {
    return {
      claims: claims.map((c) => ({
        sectionKey: c.sectionKey,
        claim: c.text,
        verdict: "불명확" as const,
        rationale: "데모 모드 — 실제 API 키 연결 시 외부 검색으로 검증합니다",
        sources: [],
      })),
      modelUsed: "demo-mock",
    };
  }

  let modelUsed = "unknown";
  const verified: VerifiedClaim[] = [];
  for (const claim of claims) {
    const results = await searchExternal(buildSearchQuery(claim, companyName));
    const outcome = await verifyOneClaim(claim, companyName, results);
    verified.push(outcome);
    modelUsed = "search+ai"; // 실제 모델명은 개별 호출마다 다를 수 있어 통칭
  }

  return { claims: verified, modelUsed };
}
