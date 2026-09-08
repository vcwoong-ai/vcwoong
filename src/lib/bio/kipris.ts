/**
 * KIPRIS Plus Open API — 특허·실용신안 검색.
 * API 키: KIPRIS_API_KEY (https://plus.kipris.or.kr)
 */

import { BRAND } from "@/lib/brand";

const BASE = "http://plus.kipris.or.kr/openapi/rest";
const API_KEY = process.env.KIPRIS_API_KEY ?? "";

export interface KiprisPatent {
  applicationNumber: string;
  inventionTitle: string;
  applicantName: string;
  applicationDate: string;
  registerStatus: string;
  ipc: string;
  url: string;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": `${BRAND.name}/1.0` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`KIPRIS HTTP ${res.status}`);
  return res.text();
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function parsePatentItems(xml: string): KiprisPatent[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const patents: KiprisPatent[] = [];

  for (const block of items) {
    const applicationNumber =
      extractTag(block, "applicationNumber") ||
      extractTag(block, "ltrtNo") ||
      extractTag(block, "applNum");
    const inventionTitle =
      extractTag(block, "inventionTitle") ||
      extractTag(block, "invTitle") ||
      extractTag(block, "title");
    const applicantName =
      extractTag(block, "applicantName") ||
      extractTag(block, "applicant") ||
      extractTag(block, "applName");
    const applicationDate =
      extractTag(block, "applicationDate") || extractTag(block, "applDate");
    const registerStatus =
      extractTag(block, "registerStatus") ||
      extractTag(block, "regStatus") ||
      extractTag(block, "status");
    const ipc = extractTag(block, "ipcNumber") || extractTag(block, "ipc");

    if (applicationNumber && inventionTitle) {
      patents.push({
        applicationNumber,
        inventionTitle,
        applicantName,
        applicationDate,
        registerStatus,
        ipc,
        // KIPRIS Plus Open API에는 사람이 볼 수 있는 상세 페이지의 공식
        // 딥링크 형식이 없다(검색 결과 페이지는 세션 기반 클릭으로만
        // 접근됨). 없는 URL을 지어내 보여주느니 비워두는 게 낫다 —
        // 예전엔 API 엔드포인트 자체를 링크인 것처럼 넣어놨는데, 그건
        // 서비스키 없이는 열리지도 않고 사람이 보는 페이지도 아니었다.
        url: "",
      });
    }
  }

  return sortPatentsByRecency(patents);
}

/** 최근 출원 순으로 정렬 — 오래된 특허가 먼저 보이면 최신 경쟁력 판단이 어렵다 */
function sortPatentsByRecency(patents: KiprisPatent[]): KiprisPatent[] {
  return [...patents].sort((a, b) =>
    (b.applicationDate || "").localeCompare(a.applicationDate || "")
  );
}

/**
 * 출원인(회사명) 또는 키워드로 KIPRIS 특허 검색.
 * API 키가 없으면 빈 배열 반환.
 */
export async function searchKiprisPatents(
  query: string,
  maxResults = 5,
  documentText?: string
): Promise<KiprisPatent[]> {
  if (API_KEY) {
    try {
      const url =
        `${BASE}/patUtiModInfoSearchSevice/applicantNameSearchInfo` +
        `?applicant=${encodeURIComponent(query)}` +
        `&numOfRows=${maxResults}&pageNo=1&ServiceKey=${API_KEY}`;

      const xml = await fetchXml(url);
      const patents = parsePatentItems(xml);
      if (patents.length > 0) return patents.slice(0, maxResults);

      const keywordUrl =
        `${BASE}/patUtiModInfoSearchSevice/freeSearch` +
        `?word=${encodeURIComponent(query)}` +
        `&numOfRows=${maxResults}&pageNo=1&ServiceKey=${API_KEY}`;

      const keywordXml = await fetchXml(keywordUrl);
      return parsePatentItems(keywordXml).slice(0, maxResults);
    } catch (err) {
      console.warn("[KIPRIS] 검색 실패:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[KIPRIS] API 키 없음 — IR 문서에서 특허 정보 추출 시도");
  }

  if (documentText) {
    return extractPatentsFromDocument(documentText, query).slice(0, maxResults);
  }
  return [];
}

/** API 키 없을 때 IR/제출 자료 텍스트에서 특허 언급 추출 */
export function extractPatentsFromDocument(
  text: string,
  companyName: string
): KiprisPatent[] {
  const patents: KiprisPatent[] = [];
  const seen = new Set<string>();

  const linePatterns = [
    /(?:발명의\s*명칭|invention)[:\s]*([^\n.]{4,80})/gi,
    /특허\s*(?:출원)?(?:번호)?[:\s]*([0-9]{2}-?[0-9]{4,}-?[0-9]{4,})/gi,
    /출원번호[:\s]*([0-9-]{8,})/gi,
  ];

  for (const pattern of linePatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const value = m[1]?.trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);

      const isNumber = /^[0-9-]+$/.test(value);
      patents.push({
        applicationNumber: isNumber ? value : `(IR) ${value.slice(0, 20)}`,
        inventionTitle: isNumber ? `(IR 자료) ${companyName} 관련 특허` : value,
        applicantName: companyName,
        applicationDate: "",
        registerStatus: "IR 자료 추출",
        ipc: "",
        url: "",
      });
    }
  }

  const portfolioMatch = text.match(
    /(?:특허\s*포트폴리오|patent\s*portfolio)[:\s]*(\d+)\s*(?:건|개|items?)/i
  );
  if (portfolioMatch && patents.length === 0) {
    patents.push({
      applicationNumber: "IR-summary",
      inventionTitle: `특허 포트폴리오 ${portfolioMatch[1]}건 (IR 자료)`,
      applicantName: companyName,
      applicationDate: "",
      registerStatus: "IR 자료",
      ipc: "",
      url: "",
    });
  }

  return patents;
}

export interface PatentPortfolioSummary {
  total: number;
  registered: number;
  pending: number;
  other: number;
  /** IR 자료에서 추출한(등록 여부 미확인) 건수 — 등록 통계에서 제외 */
  unverifiedFromDocument: number;
  earliestApplicationYear: number | null;
  latestApplicationYear: number | null;
  uniqueIpcCount: number;
}

const REGISTERED_STATUS_RE = /등록/;
const PENDING_STATUS_RE = /출원|공개|심사/;
const UNVERIFIED_STATUS_RE = /IR\s*자료/;

/**
 * 특허 목록을 "몇 건이 실제 등록됐는가"로 요약한다.
 *
 * 출원만 하고 등록 안 된 특허는 언제든 거절될 수 있어 투자 판단에서
 * 무게가 다르다 — AI가 목록을 보고 매번 다르게 해석하게 두지 않고,
 * 등록/출원 건수를 미리 계산해 프롬프트에 고정 사실로 넣는다(다른
 * 섹터 에이전트의 계산형 지표와 같은 방식 — 자유 서술이 아니라 계산값).
 */
export function summarizePatentPortfolio(
  patents: KiprisPatent[]
): PatentPortfolioSummary {
  let registered = 0;
  let pending = 0;
  let other = 0;
  let unverifiedFromDocument = 0;
  const years: number[] = [];
  const ipcCodes = new Set<string>();

  for (const p of patents) {
    if (UNVERIFIED_STATUS_RE.test(p.registerStatus)) {
      unverifiedFromDocument += 1;
    } else if (REGISTERED_STATUS_RE.test(p.registerStatus)) {
      registered += 1;
    } else if (PENDING_STATUS_RE.test(p.registerStatus)) {
      pending += 1;
    } else if (p.registerStatus) {
      other += 1;
    }

    const year = Number(p.applicationDate?.slice(0, 4));
    if (Number.isFinite(year) && year > 1900) years.push(year);

    const ipc = p.ipc?.trim();
    if (ipc) ipcCodes.add(ipc.split(/[,;\s]+/)[0]);
  }

  return {
    total: patents.length,
    registered,
    pending,
    other,
    unverifiedFromDocument,
    earliestApplicationYear: years.length ? Math.min(...years) : null,
    latestApplicationYear: years.length ? Math.max(...years) : null,
    uniqueIpcCount: ipcCodes.size,
  };
}

export function formatPatentSummaryForPrompt(
  summary: PatentPortfolioSummary
): string {
  if (summary.total === 0) return "";
  if (summary.unverifiedFromDocument === summary.total) {
    // KIPRIS 조회 없이 IR 자료 추출만 있는 경우 — 등록 통계를 낼 근거가 없다.
    return "";
  }

  const yearRange =
    summary.earliestApplicationYear && summary.latestApplicationYear
      ? summary.earliestApplicationYear === summary.latestApplicationYear
        ? `${summary.latestApplicationYear}년`
        : `${summary.earliestApplicationYear}~${summary.latestApplicationYear}년`
      : "확인 불가";

  return (
    `\n\n## 특허 포트폴리오 요약 (KIPRIS 조회 기준, 계산값 — 그대로 인용할 것)\n` +
    `- 등록: ${summary.registered}건 / 출원(미등록): ${summary.pending}건` +
    (summary.other > 0 ? ` / 기타: ${summary.other}건` : "") +
    `\n- 출원 시기: ${yearRange}` +
    `\n- 기술분야(IPC 대분류) 다양성: ${summary.uniqueIpcCount}개`
  );
}

export function formatKiprisForPrompt(patents: KiprisPatent[]): string {
  if (patents.length === 0) return "";

  const lines = patents.map(
    (p, i) =>
      `[특허 ${i + 1}] ${p.inventionTitle}\n` +
      `출원인: ${p.applicantName || "-"} | 출원번호: ${p.applicationNumber} | 상태: ${p.registerStatus || "-"}\n` +
      `출원일: ${p.applicationDate || "-"} | IPC: ${p.ipc || "-"}`
  );

  return `\n\n## KIPRIS 특허 (${patents.length}건)\n${lines.join("\n\n")}`;
}
