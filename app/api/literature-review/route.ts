import { generateText } from "ai";
import { dashscope } from "@/lib/providers/dashscope";
import type { SelectedItem } from "@/hooks/useResearchOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 30;

function buildLiteraturePrompt(items: SelectedItem[]): string {
  const lines = items.map((item) => {
    if (item.type === "repo") {
      return `[GitHub Repo] ${item.data.full_name}: ${item.data.description ?? "No description"}`;
    }
    if (item.type === "paper") {
      const authors = item.data.authors.slice(0, 2).join(", ");
      const year = item.data.published.slice(0, 4);
      return `[Arxiv Paper] "${item.data.title}" (${year}) by ${authors}: ${item.data.summary.slice(0, 200)}`;
    }
    return `[Web Article] "${item.data.title}": ${item.data.content?.slice(0, 200) ?? ""}`;
  });

  return [
    "Generate a comparative literature review in Markdown for the following resources:",
    "",
    ...lines,
    "",
    "Include: ## Introduction, ## Comparative Analysis (compare key ideas and approaches), ## Conclusion.",
    "Use inline citations like [Author, Year] or [Source Name]. Write in a formal academic tone.",
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const { items } = (await req.json()) as { items: SelectedItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "No items provided" }, { status: 400 });
    }

    const { text } = await generateText({
      model: dashscope("qwen-max"),
      system:
        "You are an academic writer. Generate a well-structured comparative literature review in Markdown. Be concise, analytical, and cite sources properly.",
      prompt: buildLiteraturePrompt(items),
      maxTokens: 2000,
      temperature: 0.3,
    });

    return Response.json({ markdown: text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
