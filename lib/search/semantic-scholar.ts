import type { ArxivPaper } from "./arxiv";

type SSAuthor = { authorId: string; name: string };

type SSPaper = {
  paperId: string;
  title: string;
  authors: SSAuthor[];
  year: number | null;
  abstract: string | null;
  citationCount: number;
  openAccessPdf: { url: string } | null;
  externalIds: { ArXiv?: string; DOI?: string } | null;
  publicationVenue: { name?: string } | null;
};

type SSResponse = {
  data?: SSPaper[];
  total?: number;
};

export async function searchSemanticScholar(
  keywords: string[],
  max = 5,
): Promise<ArxivPaper[]> {
  if (keywords.length === 0) return [];

  const query = encodeURIComponent(
    keywords.map((k) => k.replace(/\b(OR|AND|NOT)\b/gi, " ").replace(/\s+/g, " ").trim()).join(" ")
  );
  const fields = "title,authors,year,abstract,citationCount,openAccessPdf,externalIds,publicationVenue";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&fields=${fields}&limit=20`;

  const headers: Record<string, string> = { "User-Agent": "Praxis-AI-Hub/1.0" };
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[SemanticScholar] HTTP ${res.status} for query: ${query}`);
      return [];
    }
    const data = (await res.json()) as SSResponse;

    const papers: SSPaper[] = (data.data ?? []).filter(
      (p) => p.title && (p.abstract || p.year),
    );

    // Sort by citation count descending (credibility signal)
    papers.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));

    return papers.slice(0, max).map((p): ArxivPaper => {
      const arxivId = p.externalIds?.ArXiv ?? p.paperId;
      const link = p.openAccessPdf?.url
        ?? (p.externalIds?.ArXiv
          ? `https://arxiv.org/abs/${p.externalIds.ArXiv}`
          : `https://www.semanticscholar.org/paper/${p.paperId}`);
      const category = p.externalIds?.ArXiv ? "cs" : p.externalIds?.DOI ? "doi" : "other";

      return {
        id: arxivId,
        title: p.title,
        authors: p.authors.slice(0, 3).map((a) => a.name),
        summary: (p.abstract ?? "").slice(0, 300),
        published: p.year ? String(p.year) : "",
        link,
        categories: [category].filter(Boolean),
        citationCount: p.citationCount ?? 0,
      };
    });
  } catch {
    return [];
  }
}
