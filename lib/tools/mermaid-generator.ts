import { tool, generateText } from "ai";
import { z } from "zod";
import { dashscope } from "@/lib/providers/dashscope";

export const generateMermaidTool = tool({
  description:
    "Generate a Mermaid diagram from a description. Use when the user asks to draw, visualize, or create a diagram, flowchart, sequence diagram, ER diagram, or architecture chart.",
  parameters: z.object({
    description: z.string().describe("What to diagram"),
    diagramType: z
      .enum(["flowchart", "sequenceDiagram", "erDiagram", "gantt", "mindmap", "classDiagram"])
      .default("flowchart")
      .describe("Type of Mermaid diagram"),
  }),
  execute: async ({ description, diagramType }) => {
    try {
      const { text } = await generateText({
        model: dashscope("qwen-max"),
        system:
          "You are a Mermaid diagram expert. Output ONLY valid Mermaid code — no explanation, no markdown fences, no extra text.",
        prompt: `Create a ${diagramType} diagram for: ${description}`,
        maxTokens: 800,
        temperature: 0.2,
      });
      const clean = text.replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
      return { mermaidCode: clean, diagramType };
    } catch (err) {
      console.error("[generateMermaid] error:", err);
      return { error: "Failed to generate diagram", mermaidCode: "", diagramType };
    }
  },
});
