export type ArxivPaper = {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  link: string;
  categories: string[];
  citationCount?: number;
};

function decodeHtml(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extract(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeHtml(m[1]) : "";
}

function extractAll(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = decodeHtml(m[1]).trim();
    if (v) results.push(v);
  }
  return results;
}

function extractAttr(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i"));
  return m ? m[1] : "";
}

export async function searchArxiv(
  keywords: string[],
  max = 5,
): Promise<ArxivPaper[]> {
  if (keywords.length === 0) return [];
  // Strip boolean operators that LLMs sometimes embed inside keyword strings.
  // Each clean term gets its own "all:" prefix; joined with +AND+ so arXiv
  // applies field scoping correctly. Cap at 4 terms — more is too restrictive.
  const cleanKeywords = keywords
    .map((k) => k.replace(/\b(OR|AND|NOT)\b/gi, " ").replace(/\s+/g, " ").trim())
    .filter((k) => k.length > 1)
    .slice(0, 4);
  if (cleanKeywords.length === 0) return [];
  // Use a single broad all-field query (space-separated = implicit AND in arXiv).
  // Per-phrase AND was too restrictive and returned 0 results for multi-word keywords.
  const queryStr = cleanKeywords.join(" ");
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(queryStr)}&start=0&max_results=${max}&sortBy=relevance&sortOrder=descending`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Praxis-AI-Hub/1.0" },
  });
  if (!res.ok) {
    console.error(`[arXiv] HTTP ${res.status} for query: ${queryStr}`);
    return [];
  }
  const xml = await res.text();

  const entryBlocks = xml.split("</entry>");
  const papers: ArxivPaper[] = [];

  for (const block of entryBlocks) {
    const idRaw = extract(block, "id");
    // Must include /abs/ to skip the feed header whose <id> is the query URL
    if (!idRaw || !idRaw.includes("arxiv.org/abs/")) continue;

    const arxivId = idRaw.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "").replace(/v\d+$/, "");
    const title = extract(block, "title");
    if (!title) continue;

    const authorBlocks = block.match(/<author>[\s\S]*?<\/author>/gi) ?? [];
    const authors = authorBlocks
      .map((a) => extract(a, "name"))
      .filter(Boolean)
      .slice(0, 3);

    const summaryRaw = extract(block, "summary");
    const summary = summaryRaw.slice(0, 300);

    const publishedRaw = extract(block, "published");
    const published = publishedRaw ? publishedRaw.slice(0, 10) : "";

    const categories = block
      .match(/<category[^/]*term="([^"]+)"/gi)
      ?.map((c) => c.match(/term="([^"]+)"/)?.[1] ?? "")
      .filter(Boolean) ?? [];

    papers.push({
      id: arxivId,
      title,
      authors,
      summary,
      published,
      link: `https://arxiv.org/abs/${arxivId}`,
      categories: categories.slice(0, 3),
    });

    if (papers.length >= max) break;
  }

  return papers;
}
