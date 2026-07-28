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
        url: `https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/getAdvancedSearch?applicationNumber=${encodeURIComponent(applicationNumber)}`,
      });
    }
  }

  return patents;
}

/**
 * 출원인(회사명) 또는 키워드로 KIPRIS 특허 검색.
 * API 키가 없으면 빈 배열 반환.
 */
export async function searchKiprisPatents(
  query: string,
  maxResults = 5
): Promise<KiprisPatent[]> {
  if (!API_KEY) {
    console.log("[KIPRIS] API 키 없음 — 검색 건너뜀");
    return [];
  }

  try {
    // 출원인명 검색 서비스
    const url =
      `${BASE}/patUtiModInfoSearchSevice/applicantNameSearchInfo` +
      `?applicant=${encodeURIComponent(query)}` +
      `&numOfRows=${maxResults}&pageNo=1&ServiceKey=${API_KEY}`;

    const xml = await fetchXml(url);
    const patents = parsePatentItems(xml);

    if (patents.length > 0) return patents.slice(0, maxResults);

    // 폴백: 키워드 검색
    const keywordUrl =
      `${BASE}/patUtiModInfoSearchSevice/freeSearch` +
      `?word=${encodeURIComponent(query)}` +
      `&numOfRows=${maxResults}&pageNo=1&ServiceKey=${API_KEY}`;

    const keywordXml = await fetchXml(keywordUrl);
    return parsePatentItems(keywordXml).slice(0, maxResults);
  } catch (err) {
    console.warn("[KIPRIS] 검색 실패:", err instanceof Error ? err.message : err);
    return [];
  }
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
