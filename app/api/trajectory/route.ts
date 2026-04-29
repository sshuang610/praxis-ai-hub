import { generateText } from "ai";
import { dashscope } from "@/lib/providers/dashscope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { retrieveMemory } from "@/lib/memory/rag";

export const runtime = "nodejs";
export const maxDuration = 30;

type TrajectoryNode = { name: string; subtopics?: string[] };

// Keep only alphanumeric, spaces, and CJK/Kana characters — strip everything else
function sanitizeLabel(s: string): string {
  return (s ?? "")
    .replace(/[^\w\s　-鿿぀-ヿ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16) || "未知";
}

function toMermaid(topics: TrajectoryNode[]): string {
  // Use graph TD (top-down) — most compatible with Mermaid v11.
  // Plain [label] syntax (no inner quotes) avoids quote-escaping issues.
  const lines: string[] = ["graph TD", "  ROOT[研究軌跡]"];
  topics.forEach((topic, ti) => {
    const topicId = `T${ti}`;
    const topicLabel = sanitizeLabel(topic.name);
    lines.push(`  ROOT --> ${topicId}[${topicLabel}]`);
    (topic.subtopics ?? []).forEach((sub, si) => {
      const subId = `T${ti}S${si}`;
      const subLabel = sanitizeLabel(sub);
      lines.push(`  ${topicId} --> ${subId}[${subLabel}]`);
    });
  });
  return lines.join("\n");
}

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const chunks = await retrieveMemory(supabase, {
      userId: user.id,
      queryText: "research knowledge topics learning interests projects",
      k: 10,
      threshold: 0.45,
    });

    if (chunks.length === 0) {
      return Response.json({
        error: "No memory found — start a few research conversations first.",
      });
    }

    const summary = chunks
      .map((c) => `- ${c.content.slice(0, 150)}`)
      .join("\n");

    const { text } = await generateText({
      model: dashscope("qwen-flash-2025-07-28"),
      system:
        'Output ONLY valid JSON — no explanation, no code fences.\n' +
        'Format: [{"name":"Topic","subtopics":["Sub1","Sub2"]}, ...]\n' +
        'Rules: (1) 3-5 top-level topics. (2) 2-4 subtopics each. ' +
        '(3) Names are short (≤15 chars). (4) No quotes or brackets inside names.',
      prompt: `Summarize this user's research trajectory as a JSON topic tree:\n\n${summary}`,
      maxTokens: 400,
      temperature: 0.2,
    });

    const cleaned = text
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let topics: TrajectoryNode[];
    try {
      topics = JSON.parse(cleaned) as TrajectoryNode[];
      if (!Array.isArray(topics) || topics.length === 0) throw new Error("empty");
    } catch {
      // Fallback: extract any JSON array from the response
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) {
        return Response.json({ error: "Failed to parse trajectory structure." });
      }
      topics = JSON.parse(match[0]) as TrajectoryNode[];
    }

    const mermaidCode = toMermaid(topics);
    console.log("[trajectory] generated Mermaid:\n" + mermaidCode);
    return Response.json({ mermaidCode });
  } catch (err) {
    console.error("[trajectory]", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
