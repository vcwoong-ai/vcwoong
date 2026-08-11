/**
 * OpenDART(금융감독원 전자공시시스템) 연동 — 재무제표·공시 조회.
 * API 키: DART_API_KEY (https://opendart.fss.or.kr, 무료 발급)
 *
 * KIPRIS(특허)와 짝을 이루는 재무 공시 데이터 소스. VC 포트폴리오사
 * 대부분은 비상장이라 DART에 없는 게 정상이고, 그 경우 조용히 빈 결과를
 * 돌려준다 — "찾을 수 없음"이 실패가 아니라 기대되는 결과다.
 *
 * DART는 회사명으로 바로 검색이 안 되고, 전 상장·등록 법인 목록을 담은
 * corpCode.xml(ZIP)을 받아 회사명 → corp_code 매핑을 직접 만들어야 한다.
 * 이 목록은 하루 단위로만 바뀌므로 모듈 메모리에 캐시해 반복 다운로드를
 * 막는다 — 서버리스 특성상 콜드스타트마다 캐시는 비워지지만, 같은
 * 인스턴스에서 오는 요청끼리는 재사용된다.
 */
import JSZip from "jszip";

const BASE = "https://opendart.fss.or.kr/api";
const API_KEY = process.env.DART_API_KEY ?? "";

interface CorpCodeEntry {
  corpCode: string;
  corpName: string;
  stockCode: string;
}

let corpCodeCache: { entries: CorpCodeEntry[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}

async function loadCorpCodes(): Promise<CorpCodeEntry[]> {
  if (corpCodeCache && Date.now() - corpCodeCache.fetchedAt < CACHE_TTL_MS) {
    return corpCodeCache.entries;
  }

  const res = await fetch(
    `${BASE}/corpCode.xml?crtfc_key=${API_KEY}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`DART corpCode HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const xmlFile = Object.values(zip.files).find((f) => !f.dir);
  if (!xmlFile) throw new Error("DART corpCode.xml — ZIP 안에 파일 없음");
  const xml = await xmlFile.async("text");

  const blocks = xml.match(/<list>[\s\S]*?<\/list>/g) ?? [];
  const entries: CorpCodeEntry[] = blocks
    .map((b) => ({
      corpCode: extractTag(b, "corp_code"),
      corpName: extractTag(b, "corp_name"),
      stockCode: extractTag(b, "stock_code"),
    }))
    .filter((e) => e.corpCode && e.corpName);

  corpCodeCache = { entries, fetchedAt: Date.now() };
  return entries;
}

export function normalizeCompanyName(name: string): string {
  return name
    .replace(/주식회사|㈜|\(주\)|Inc\.?|Corp\.?|Co\.,?\s*Ltd\.?/gi, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

/**
 * 회사명으로 DART corp_code를 찾는다.
 * 정확히 일치하는 이름을 우선하고, 없으면 부분 일치 중 상장사(stock_code
 * 있음)를 우선한다. 못 찾으면 undefined — 비상장 스타트업 대부분이 이 경우다.
 */
export async function resolveDartCorpCode(
  companyName: string
): Promise<CorpCodeEntry | undefined> {
  if (!API_KEY) return undefined;
  try {
    const entries = await loadCorpCodes();
    const target = normalizeCompanyName(companyName);
    if (!target) return undefined;

    const exact = entries.find((e) => normalizeCompanyName(e.corpName) === target);
    if (exact) return exact;

    const partial = entries.filter((e) =>
      normalizeCompanyName(e.corpName).includes(target)
    );
    if (partial.length === 0) return undefined;
    return partial.find((e) => e.stockCode) ?? partial[0];
  } catch (err) {
    console.warn("[DART] corp_code 조회 실패:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

export interface DartFinancials {
  year: string;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  unit: "원";
}

const ACCOUNT_MAP: Record<string, keyof Omit<DartFinancials, "year" | "unit">> = {
  매출액: "revenue",
  영업수익: "revenue",
  영업이익: "operatingProfit",
  당기순이익: "netIncome",
  "당기순이익(손실)": "netIncome",
  자산총계: "totalAssets",
  부채총계: "totalLiabilities",
  자본총계: "totalEquity",
};

/** 단일회사 주요계정(사업보고서 기준) 조회. 재무제표가 없으면 null 반환 */
export async function fetchDartFinancials(
  corpCode: string,
  year: number
): Promise<DartFinancials | null> {
  if (!API_KEY) return null;
  try {
    const url =
      `${BASE}/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}` +
      `&bsns_year=${year}&reprt_code=11011`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      status: string;
      list?: Array<{ account_nm: string; thstrm_amount: string; fs_div: string }>;
    };
    if (json.status !== "000" || !json.list?.length) return null;

    const result: DartFinancials = {
      year: String(year),
      revenue: null,
      operatingProfit: null,
      netIncome: null,
      totalAssets: null,
      totalLiabilities: null,
      totalEquity: null,
      unit: "원",
    };

    // 연결재무제표(CFS)가 있으면 우선하고, 없으면 개별(OFS)을 쓴다
    const preferred = json.list.some((r) => r.fs_div === "CFS") ? "CFS" : "OFS";
    for (const row of json.list) {
      if (row.fs_div !== preferred) continue;
      const key = ACCOUNT_MAP[row.account_nm];
      if (!key) continue;
      const amount = Number(row.thstrm_amount.replace(/,/g, ""));
      if (Number.isFinite(amount) && result[key] === null) {
        (result[key] as number | null) = amount;
      }
    }
    return result;
  } catch (err) {
    console.warn("[DART] 재무제표 조회 실패:", err instanceof Error ? err.message : err);
    return null;
  }
}

export interface DartDisclosure {
  title: string;
  date: string; // YYYYMMDD
  url: string;
}

/** 최근 1년 공시 목록 (최대 limit건) */
export async function fetchDartDisclosures(
  corpCode: string,
  limit = 5
): Promise<DartDisclosure[]> {
  if (!API_KEY) return [];
  try {
    const end = new Date();
    const begin = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

    const url =
      `${BASE}/list.json?crtfc_key=${API_KEY}&corp_code=${corpCode}` +
      `&bgn_de=${fmt(begin)}&end_de=${fmt(end)}&page_count=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      status: string;
      list?: Array<{ report_nm: string; rcept_dt: string; rcept_no: string }>;
    };
    if (json.status !== "000" || !json.list) return [];

    return json.list.slice(0, limit).map((r) => ({
      title: r.report_nm,
      date: r.rcept_dt,
      url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${r.rcept_no}`,
    }));
  } catch (err) {
    console.warn("[DART] 공시 목록 조회 실패:", err instanceof Error ? err.message : err);
    return [];
  }
}

export interface DartCompanyData {
  found: boolean;
  corpName?: string;
  stockCode?: string;
  financials: DartFinancials[];
  disclosures: DartDisclosure[];
}

/** 회사명으로 corp_code → 최근 2개년 재무제표 + 최근 공시 목록까지 한 번에 조회 */
export async function searchDartCompany(
  companyName: string
): Promise<DartCompanyData> {
  const corp = await resolveDartCorpCode(companyName);
  if (!corp) {
    return { found: false, financials: [], disclosures: [] };
  }

  const thisYear = new Date().getFullYear();
  const [financialsResults, disclosures] = await Promise.all([
    Promise.all([
      fetchDartFinancials(corp.corpCode, thisYear - 1),
      fetchDartFinancials(corp.corpCode, thisYear - 2),
    ]),
    fetchDartDisclosures(corp.corpCode, 5),
  ]);

  const financials = financialsResults.filter((f): f is DartFinancials => f !== null);

  return {
    found: true,
    corpName: corp.corpName,
    stockCode: corp.stockCode || undefined,
    financials,
    disclosures,
  };
}

function formatWon(n: number | null): string {
  if (n === null) return "확인 필요";
  const eok = n / 100_000_000;
  return `${eok.toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

export function formatDartForPrompt(data: DartCompanyData): string {
  if (!data.found || (data.financials.length === 0 && data.disclosures.length === 0)) {
    return "";
  }

  const lines: string[] = [`\n\n## DART 전자공시 (${data.corpName})`];

  for (const f of data.financials) {
    lines.push(
      `[${f.year}년 사업보고서] 매출 ${formatWon(f.revenue)} · 영업이익 ${formatWon(f.operatingProfit)} · ` +
        `순이익 ${formatWon(f.netIncome)} · 자산총계 ${formatWon(f.totalAssets)} · 자본총계 ${formatWon(f.totalEquity)}`
    );
  }

  if (data.disclosures.length > 0) {
    lines.push(
      `최근 공시: ${data.disclosures.map((d) => `${d.title}(${d.date})`).join(", ")}`
    );
  }

  return lines.join("\n");
}
