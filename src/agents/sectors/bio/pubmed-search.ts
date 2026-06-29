import { callClaudeJSON } from "@/lib/claude";

const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export type PubmedArticle = {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  doi?: string;
  summary?: string;
};

export async function searchPubmed(
  query: string,
  limit = 5
): Promise<PubmedArticle[]> {
  try {
    const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });
    const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } };
    const pmids = searchData.esearchresult?.idlist ?? [];
    if (pmids.length === 0) return [];

    const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(8000) });
    const summaryData = (await summaryRes.json()) as {
      result?: Record<string, { title?: string; authors?: { name: string }[]; fulljournalname?: string; source?: string; pubdate?: string; elocationid?: string }>;
    };

    return pmids
      .flatMap((pmid) => {
        const article = summaryData.result?.[pmid];
        if (!article) return [];
        return [{
          pmid,
          title: article.title ?? "",
          authors: (article.authors ?? []).map((a) => a.name).slice(0, 3),
          journal: article.fulljournalname ?? article.source ?? "",
          year: article.pubdate?.split(" ")[0] ?? "",
          doi: article.elocationid?.replace("doi: ", "") || undefined,
        }] satisfies PubmedArticle[];
      });
  } catch {
    return [];
  }
}

export async function summarizeArticles(
  articles: PubmedArticle[],
  context: string
): Promise<PubmedArticle[]> {
  if (articles.length === 0) return articles;

  try {
    const { data } = await callClaudeJSON<{
      summaries: { pmid: string; summary: string }[];
    }>({
      system: "당신은 의학 논문을 한국어로 간결하게 요약하는 전문가입니다.",
      messages: [
        {
          role: "user",
          content: `다음 논문들을 "${context}" 맥락에서 각각 한국어 1문장으로 요약하세요.\n\n논문: ${JSON.stringify(articles.map((a) => ({ pmid: a.pmid, title: a.title, journal: a.journal })))}\n\nJSON: { "summaries": [{ "pmid": "...", "summary": "..." }] }`,
        },
      ],
      maxTokens: 2048,
    });

    const summaryMap = new Map(data.summaries.map((s) => [s.pmid, s.summary]));
    return articles.map((a) => ({ ...a, summary: summaryMap.get(a.pmid) }));
  } catch {
    return articles;
  }
}
