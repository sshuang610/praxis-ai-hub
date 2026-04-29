import { generateText } from "ai";
import { dashscope } from "@/lib/providers/dashscope";
import { searchGitHub, fetchRepoReadme } from "@/lib/search/github";
import { searchArxiv } from "@/lib/search/arxiv";
import { searchSemanticScholar } from "@/lib/search/semantic-scholar";
import { tavily } from "@tavily/core";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { retrieveMemory } from "@/lib/memory/rag";
import type { LtmMemory } from "@/hooks/useResearchOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 30;

type MessageLike = { role: string; content: string };

type WebArticle = {
  title: string;
  url: string;
  content: string | null;
  score: number;
};

const STOP_WORDS = new Set([
  "the","and","for","with","this","that","from","have","been","are","was",
  "what","how","why","can","will","use","used","using","make","made","need",
  "also","some","more","about","which","when","into","its","our","their",
]);

function sanitizeKeywords(raw: string[]): string[] {
  return raw
    .map((k) =>
      k
        .replace(/\b(OR|AND|NOT)\b/gi, " ")  // strip boolean operators
        .replace(/[^\w\s一-鿿-]/g, " ")  // keep alphanumeric, CJK, hyphen
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((k) => k.length > 2 && !STOP_WORDS.has(k.toLowerCase()))
    .filter((k, i, arr) => arr.indexOf(k) === i)  // deduplicate
    .slice(0, 4);
}

async function extractKeywords(messages: MessageLike[]): Promise<string[]> {
  const text = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content.slice(0, 500)}`)
    .join("\n");

  try {
    const { text: raw } = await generateText({
      model: dashscope("qwen-flash-2025-07-28"),
      system:
        'You are a research keyword extractor. Given a conversation, output ONLY a valid JSON array of 3 to 5 concise English search terms. Rules: (1) Each term is 1-4 words. (2) NO boolean operators (OR/AND/NOT). (3) Prefer specific technical concepts, not generic words like "AI" or "system". (4) No explanation, no markdown, no code fences. Example: ["transformer attention mechanism","retrieval augmented generation","vector similarity search"]',
      prompt: `Extract the most specific research topics from this conversation:\n${text}`,
      maxTokens: 120,
      temperature: 0.1,
    });
    const cleaned = raw.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return sanitizeKeywords(parsed.map(String));
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: pull meaningful words from the last user message
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  if (lastUser) {
    const words = lastUser.content
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, "").toLowerCase())
      .filter((w) => w.length > 4 && !STOP_WORDS.has(w));
    // Try to form bigrams for better specificity
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]} ${words[i + 1]}`);
    return sanitizeKeywords([...bigrams, ...words]).slice(0, 3);
  }
  return ["machine learning", "neural network"];
}

async function searchTavilyArticles(keywords: string[]): Promise<WebArticle[]> {
  if (!process.env.TAVILY_API_KEY) return [];
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const response = await client.search(keywords.join(" "), {
      maxResults: 8,
      searchDepth: "basic",
    });
    // Sort by score (credibility proxy); prefer academic/gov/org domains
    const credibleDomains = /\.(edu|gov|ac\.|org|ieee\.org|nature\.com|springer|acm\.org)/i;
    const scored = response.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content?.slice(0, 300) ?? null,
      score: r.score * (credibleDomains.test(r.url) ? 1.3 : 1.0),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5).map((r) => ({ ...r, score: Math.min(r.score, 1) }));
  } catch {
    return [];
  }
}

async function fetchLtmMemories(
  messages: MessageLike[],
): Promise<LtmMemory[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log("[LTM] no authenticated user — skipping");
      return [];
    }

    const queryText = messages
      .slice(-5)
      .map((m) => m.content)
      .join(" ")
      .slice(0, 1000);

    const chunks = await retrieveMemory(supabase, {
      userId: user.id,
      queryText,
      k: 3,
      threshold: 0.55,
    });

    console.log(`[LTM] retrieved ${chunks.length} chunk(s) for user ${user.id.slice(0, 8)}… (threshold 0.55)`);
    return chunks.map((c) => ({ id: c.id, content: c.content }));
  } catch (err) {
    console.error("[LTM] fetchLtmMemories error:", err);
    return [];
  }
}

async function searchPapers(keywords: string[], max: number) {
  // Run both in parallel; prefer Semantic Scholar (citation counts) but always
  // fall back to arXiv so the section never disappears silently.
  const [ssResults, arxivResults] = await Promise.all([
    searchSemanticScholar(keywords, max).catch((e) => {
      console.error("[research] Semantic Scholar error:", e);
      return [] as Awaited<ReturnType<typeof searchSemanticScholar>>;
    }),
    searchArxiv(keywords, max).catch((e) => {
      console.error("[research] arXiv error:", e);
      return [] as Awaited<ReturnType<typeof searchArxiv>>;
    }),
  ]);
  console.log(`[research] SS=${ssResults.length} arXiv=${arxivResults.length} keywords=${JSON.stringify(keywords)}`);
  // Merge: SS first (deduplicated by arXiv ID), then arXiv fill-up
  const seen = new Set<string>();
  const merged: typeof ssResults = [];
  for (const p of ssResults) { seen.add(p.id); merged.push(p); }
  for (const p of arxivResults) { if (!seen.has(p.id) && merged.length < max) merged.push(p); }
  return merged;
}

async function enrichReposWithReadme(
  repos: Awaited<ReturnType<typeof searchGitHub>>,
) {
  const token = process.env.GITHUB_TOKEN;
  const top3 = repos.slice(0, 3);
  const readmes = await Promise.allSettled(
    top3.map((r) => fetchRepoReadme(r.full_name, token)),
  );
  return repos.map((repo, i) => ({
    ...repo,
    readme: i < 3 && readmes[i].status === "fulfilled" ? (readmes[i].value ?? undefined) : undefined,
  }));
}

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: MessageLike[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    const [rawKeywords, ltmMemories] =
      await Promise.all([extractKeywords(messages), fetchLtmMemories(messages)]);
    const keywords = sanitizeKeywords(rawKeywords);
    console.log("[research] rawKeywords=", rawKeywords, "→ sanitized=", keywords);

    const [githubResult, papersResult, tavilyResult] = await Promise.allSettled([
      searchGitHub(keywords, 5),
      searchPapers(keywords, 5),
      searchTavilyArticles(keywords),
    ]);

    const repos =
      githubResult.status === "fulfilled" ? githubResult.value : [];
    const enrichedRepos = await enrichReposWithReadme(repos);

    return Response.json({
      keywords,
      repos: enrichedRepos,
      papers: papersResult.status === "fulfilled" ? papersResult.value : [],
      articles: tavilyResult.status === "fulfilled" ? tavilyResult.value : [],
      ltmMemories,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
