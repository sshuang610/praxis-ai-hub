import { tool, generateText } from "ai";
import { z } from "zod";
import { dashscope } from "@/lib/providers/dashscope";

// Diagram types that are safe in Mermaid v11 (no lazy-loaded chunks)
const SAFE_TYPES = ["flowchart", "sequenceDiagram", "classDiagram", "gantt"] as const;
type SafeDiagramType = (typeof SAFE_TYPES)[number];

const DIAGRAM_RULES: Record<SafeDiagramType, string> = {
  flowchart:
    "First line: 'flowchart TD' or 'flowchart LR'.\n" +
    "Node IDs: camelCase, no spaces (e.g. myNode).\n" +
    "Labels with spaces: wrap in double quotes A[\"my label\"].\n" +
    "Example:\nflowchart TD\n  A[\"Start\"] --> B[\"End\"]",
  sequenceDiagram:
    "First line: 'sequenceDiagram'.\n" +
    "Participant aliases: no spaces, use camelCase.\n" +
    "Example:\nsequenceDiagram\n  Alice->>Bob: Hello",
  classDiagram:
    "First line: 'classDiagram'.\n" +
    "Class names: PascalCase, no spaces.\n" +
    "Attributes: +Type name (e.g. +String title, +int count()).\n" +
    "Relations: <|-- inheritance, --> association, --o composition.\n" +
    "Example:\nclassDiagram\n  class Animal{\n    +String name\n    +speak() void\n  }",
  gantt:
    "First line: 'gantt'.\n" +
    "Second line: 'dateFormat YYYY-MM-DD'.\n" +
    "Task format: label :id, startDate, duration\n" +
    "Example:\ngantt\n  dateFormat YYYY-MM-DD\n  section Phase1\n    Task1 :a1, 2024-01-01, 7d",
};

// Detect unsupported diagram types that Mermaid v11 lazy-loads (causes chunk errors)
const UNSUPPORTED_PATTERN = /^(erDiagram|mindmap|sankey|xychart|block|kanban)/i;

// Convert a bad erDiagram into a simple flowchart preserving entity relationships
function erDiagramToFlowchart(code: string): string {
  const lines = code.split("\n").slice(1); // skip "erDiagram"
  const edges: string[] = [];
  let nodeCount = 0;
  const nodeMap = new Map<string, string>();

  const getId = (name: string) => {
    if (!nodeMap.has(name)) {
      const id = `N${nodeCount++}`;
      nodeMap.set(name, id);
    }
    return nodeMap.get(name)!;
  };

  for (const line of lines) {
    // Match relationship lines: ENTITY1 ||--o| ENTITY2 : label
    const rel = line.match(/^\s*(\w+)\s+[|o{}.]+\s*[|o{}.]+\s+(\w+)\s*:\s*(.+)$/);
    if (rel) {
      const [, a, b, label] = rel;
      edges.push(`  ${getId(a)} --> |"${label.trim()}"| ${getId(b)}`);
    }
  }

  const nodeDefs = [...nodeMap.entries()]
    .map(([name, id]) => `  ${id}["${name}"]`)
    .join("\n");

  return ["flowchart LR", nodeDefs, ...edges].join("\n");
}

export const generateMermaidTool = tool({
  description:
    "Generate a Mermaid diagram. Use for: flowcharts, sequence diagrams, class diagrams, architecture charts, Gantt charts. " +
    "Do NOT specify erDiagram or mindmap — use classDiagram or flowchart instead.",
  parameters: z.object({
    description: z.string().describe("What to diagram"),
    diagramType: z
      .enum(["flowchart", "sequenceDiagram", "classDiagram", "gantt"])
      .default("flowchart")
      .describe("Diagram type. For code/file structure use 'classDiagram' or 'flowchart', NEVER 'erDiagram'"),
  }),
  execute: async ({ description, diagramType }) => {
    // Coerce to a known-safe type (in case the model passed something unsupported)
    const safeType: SafeDiagramType = SAFE_TYPES.includes(diagramType as SafeDiagramType)
      ? (diagramType as SafeDiagramType)
      : "flowchart";

    try {
      const { text } = await generateText({
        model: dashscope("qwen-max"),
        system:
          "You are a Mermaid v11 diagram expert. Output ONLY the raw Mermaid syntax — no explanation, no markdown code fences, no extra text.\n" +
          "FORBIDDEN diagram types (will break the renderer): erDiagram, mindmap, sankey, xychart, block.\n" +
          "If asked for an ER or entity diagram, use classDiagram instead.\n" +
          "GLOBAL RULES:\n" +
          "1. IDs and names must NOT contain spaces — use camelCase.\n" +
          "2. Text labels with spaces MUST be in double quotes.\n" +
          "3. Max 15 nodes total.\n" +
          `RULES for ${safeType}:\n${DIAGRAM_RULES[safeType]}`,
        prompt: `Create a ${safeType} diagram for: ${description}`,
        maxTokens: 800,
        temperature: 0.2,
      });

      let clean = text.replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();

      // Safety net: if the LLM still generated a forbidden type, convert it
      if (UNSUPPORTED_PATTERN.test(clean)) {
        console.warn("[generateMermaid] LLM generated unsupported type, converting to flowchart");
        clean = clean.startsWith("erDiagram") ? erDiagramToFlowchart(clean) : `flowchart TD\n  A["${description.slice(0, 40)}"]`;
      }

      return { mermaidCode: clean, diagramType: safeType };
    } catch (err) {
      console.error("[generateMermaid] error:", err);
      return { error: "Failed to generate diagram", mermaidCode: "", diagramType: safeType };
    }
  },
});
