/**
 * PubMed API (NCBI E-utilities) client.
 * 무료 사용: 3 req/sec. API 키 설정 시 10 req/sec.
 * https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const API_KEY = process.env.NCBI_API_KEY ?? "";

export interface PubMedArticle {
  pmid: string;
  title: string;
  abstract: string;
  authors: string;
  journal: string;
  year: string;
  url: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "DealSync/1.0 (mailto:admin@dealsync.kr)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`PubMed HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "DealSync/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`PubMed HTTP ${res.status}`);
  return res.text();
}

/**
 * 키워드로 PubMed 논문 검색 후 초록까지 가져옴.
 * @param query  검색어 (예: "lung cancer PD-1 phase 2")
 * @param maxResults 최대 결과 수 (기본 5)
 */
export async function searchPubMed(
  query: string,
  maxResults = 5
): Promise<PubMedArticle[]> {
  try {
    const apiKeyParam = API_KEY ? `&api_key=${API_KEY}` : "";

    // 1) 검색 → PMID 목록
    const searchUrl = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance${apiKeyParam}`;
    const searchData = (await fetchJson(searchUrl)) as {
      esearchresult: { idlist: string[] };
    };
    const ids = searchData.esearchresult?.idlist ?? [];
    if (ids.length === 0) return [];

    // 2) 초록 fetch (XML 파싱)
    const fetchUrl = `${BASE}/efetch.fcgi?db=pubmed&id=${ids.join(",")}&rettype=abstract&retmode=xml${apiKeyParam}`;
    const xml = await fetchText(fetchUrl);

    return parseArticlesFromXml(xml);
  } catch {
    return [];
  }
}

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function parseArticlesFromXml(xml: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];
  const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) ?? [];

  for (const block of articleBlocks) {
    const pmid = extractXmlTag(block, "PMID");
    const title = extractXmlTag(block, "ArticleTitle");
    const abstractText = extractXmlTag(block, "AbstractText");
    const journal = extractXmlTag(block, "Title");
    const year = extractXmlTag(block, "Year") || extractXmlTag(block, "MedlineDate").slice(0, 4);

    // 저자 (최대 3명)
    const authorMatches = block.match(/<LastName>([^<]+)<\/LastName>/g) ?? [];
    const authors = authorMatches
      .slice(0, 3)
      .map((m) => m.replace(/<\/?LastName>/g, ""))
      .join(", ") + (authorMatches.length > 3 ? " et al." : "");

    if (pmid && title) {
      articles.push({
        pmid,
        title,
        abstract: abstractText.slice(0, 600),
        authors,
        journal,
        year,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      });
    }
  }

  return articles;
}

/** 논문 목록을 IC 보고서용 한국어 요약 텍스트로 포맷 */
export function formatPubMedForPrompt(articles: PubMedArticle[]): string {
  if (articles.length === 0) return "";

  const lines = articles.map((a, i) =>
    `[논문 ${i + 1}] ${a.title} (${a.authors}, ${a.journal}, ${a.year})\n초록: ${a.abstract}\nURL: ${a.url}`
  );

  return `\n\n## PubMed 관련 논문 (${articles.length}건)\n${lines.join("\n\n")}`;
}
