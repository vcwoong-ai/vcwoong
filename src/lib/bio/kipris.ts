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
