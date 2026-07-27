/**
 * KIPRIS(특허청 특허정보검색서비스) Open API client.
 * https://plus.kipris.or.kr — 출원인명/키워드로 국내 특허·실용신안 검색.
 * API 키(KIPRIS_API_KEY) 미설정 또는 조회 실패 시 빈 배열 반환 (분석 흐름을 막지 않음).
 */

const BASE = "http://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice";
const API_KEY = process.env.KIPRIS_API_KEY ?? "";

export interface KiprisPatent {
  applicationNumber: string;
  title: string;
  applicantName: string;
  applicationDate: string;
  registerStatus: string;
  ipcNumber: string;
  url: string;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`KIPRIS HTTP ${res.status}`);
  return res.text();
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseItems(xml: string): KiprisPatent[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => {
      const applicationNumber = extractTag(item, "applicationNumber");
      const title = extractTag(item, "inventionTitle");
      if (!applicationNumber || !title) return null;
      return {
        applicationNumber,
        title,
        applicantName: extractTag(item, "applicantName"),
        applicationDate: extractTag(item, "applicationDate"),
        registerStatus: extractTag(item, "registerStatus") || extractTag(item, "finalDisposal"),
        ipcNumber: extractTag(item, "internationalpatentclassificationnumber") || extractTag(item, "ipcNumber"),
        url: `https://doi.org/10.8080/${applicationNumber}`,
      };
    })
    .filter((v): v is KiprisPatent => v !== null);
}

/**
 * 출원인명(회사명)으로 특허·실용신안 검색.
 * @param applicant  회사명 (예: "㈜에이비온")
 * @param maxResults 최대 결과 수 (기본 10)
 */
export async function searchPatentsByApplicant(
  applicant: string,
  maxResults = 10
): Promise<KiprisPatent[]> {
  if (!API_KEY || !applicant.trim()) return [];

  try {
    const cleanName = applicant.replace(/inc\.|co\.|corp\.|ltd\.|주식회사|㈜|\(주\)/gi, "").trim();
    const url = `${BASE}/applicantNameSearchInfo?applicant=${encodeURIComponent(cleanName)}&numOfRows=${maxResults}&accessKey=${API_KEY}`;
    const xml = await fetchXml(url);
    return parseItems(xml);
  } catch {
    return [];
  }
}

/**
 * 기술 키워드로 특허 검색 (경쟁사 특허 지형 파악용).
 * @param keyword    기술/적응증 키워드 (예: "PD-1 항체")
 */
export async function searchPatentsByKeyword(
  keyword: string,
  maxResults = 10
): Promise<KiprisPatent[]> {
  if (!API_KEY || !keyword.trim()) return [];

  try {
    const url = `${BASE}/wordSearchInfo?word=${encodeURIComponent(keyword)}&numOfRows=${maxResults}&accessKey=${API_KEY}`;
    const xml = await fetchXml(url);
    return parseItems(xml);
  } catch {
    return [];
  }
}

/** 특허 목록을 IC 보고서용 한국어 요약 텍스트로 포맷 */
export function formatKiprisForPrompt(patents: KiprisPatent[], label: string): string {
  if (patents.length === 0) return "";

  const rows = patents
    .map(
      (p) =>
        `| ${p.applicationNumber} | ${p.title} | ${p.applicantName || "N/A"} | ${p.applicationDate || "N/A"} | ${p.registerStatus || "N/A"} |`
    )
    .join("\n");

  return `\n\n## KIPRIS 특허 현황 (${label}, ${patents.length}건)\n| 출원번호 | 발명의 명칭 | 출원인 | 출원일 | 상태 |\n|---------|-------------|--------|--------|------|\n${rows}`;
}
