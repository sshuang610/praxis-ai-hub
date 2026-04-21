import { tool } from "ai";
import { z } from "zod";
import { tavily } from "@tavily/core";

// Lazily initialized so missing API key doesn't crash module load
let _client: ReturnType<typeof tavily> | null = null;
function getClient() {
  if (!_client && process.env.TAVILY_API_KEY) {
    _client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return _client;
}

export const webSearchTool = tool({
  description:
    "Search the web for current information, recent papers, documentation, or any topic requiring up-to-date knowledge.",
  parameters: z.object({
    query: z.string().describe("The search query"),
    maxResults: z.number().optional().default(5).describe("Max results to return (1-10)"),
  }),
  execute: async ({ query, maxResults }) => {
    const client = getClient();
    if (!client) return { error: "TAVILY_API_KEY not configured", results: [] };
    try {
      const response = await client.search(query, {
        maxResults: Math.min(maxResults, 10),
        searchDepth: "basic",
      });
      return {
        answer: response.answer ?? null,
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content?.slice(0, 500),
          score: r.score,
        })),
      };
    } catch (err) {
      console.error("[webSearch] error:", err);
      return { error: "Search failed", results: [] };
    }
  },
});
