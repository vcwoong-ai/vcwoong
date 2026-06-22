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
    const searchRes = await fetch(searchUrl, { next: { revalidate: 3600 } });
    const searchData = await searchRes.json();
    const pmids: string[] = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) return [];

    const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { next: { revalidate: 3600 } });
    const summaryData = await summaryRes.json();

    return pmids
      .map((pmid) => {
        const article = summaryData.result?.[pmid];
        if (!article) return null;
        return {
          pmid,
          title: article.title || "",
          authors: (article.authors || [])
            .map((a: { name: string }) => a.name)
            .slice(0, 3),
          journal: article.fulljournalname || article.source || "",
          year: article.pubdate?.split(" ")[0] || "",
          doi: article.elocationid?.replace("doi: ", "") || undefined,
        };
      })
      .filter(Boolean) as PubmedArticle[];
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
    const { generateText } = await import("@/lib/claude");
    const result = await generateText(
      [
        {
          role: "user",
          content: `다음 논문들을 "${context}" 맥락에서 각각 한국어 1문장으로 요약하세요.

논문: ${JSON.stringify(articles.map((a) => ({ pmid: a.pmid, title: a.title, journal: a.journal })))}

JSON으로만 응답: { "summaries": [{ "pmid": "...", "summary": "..." }] }`,
        },
      ],
      {
        systemPrompt: "당신은 의학 논문을 한국어로 요약하는 전문가입니다. JSON만 출력하세요.",
        maxTokens: 2048,
      }
    );

    const parsed = JSON.parse(result.content);
    const summaryMap = new Map(
      parsed.summaries.map((s: { pmid: string; summary: string }) => [s.pmid, s.summary])
    );
    return articles.map((a) => ({ ...a, summary: summaryMap.get(a.pmid) as string | undefined }));
  } catch {
    return articles;
  }
}
