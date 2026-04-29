import { generateText } from "ai";
import { dashscope } from "@/lib/providers/dashscope";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { title, abstract } = (await req.json()) as {
      title: string;
      abstract: string;
    };

    if (!title || !abstract) {
      return Response.json({ error: "Missing title or abstract" }, { status: 400 });
    }

    const { text: raw } = await generateText({
      model: dashscope("qwen-max"),
      system:
        'You are an academic paper analyst. Given a paper title and abstract, output ONLY valid JSON with no markdown: {"contributions":["...","..."],"limitations":["...","..."]}',
      prompt: `Title: ${title}\n\nAbstract: ${abstract.slice(0, 1000)}`,
      maxTokens: 400,
      temperature: 0.1,
    });

    const clean = raw
      .trim()
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(clean) as {
      contributions: string[];
      limitations: string[];
    };

    return Response.json(parsed);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
