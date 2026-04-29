import { webSearchTool } from "@/lib/tools/web-search";
import { generateImageTool } from "@/lib/tools/image-generator";
import { generateMermaidTool } from "@/lib/tools/mermaid-generator";

export const runtime = "nodejs";
export const maxDuration = 30;

const DUMMY_OPTIONS = { toolCallId: "direct", messages: [] as never[] };

export async function POST(req: Request) {
  try {
    const { tool, params } = (await req.json()) as {
      tool: string;
      params: Record<string, unknown>;
    };

    let result: unknown;

    switch (tool) {
      case "webSearch":
        result = await webSearchTool.execute!(
          { query: String(params.query ?? ""), maxResults: Number(params.maxResults ?? 5) },
          DUMMY_OPTIONS,
        );
        break;

      case "generateImage":
        result = await generateImageTool.execute!(
          {
            prompt: String(params.prompt ?? ""),
            size: (params.size as "1024x1024" | "720x1280" | "1280x720") ?? "1024x1024",
          },
          DUMMY_OPTIONS,
        );
        break;

      case "generateMermaid": {
        const validTypes = ["flowchart", "sequenceDiagram", "erDiagram", "gantt", "mindmap", "classDiagram"] as const;
        type DiagramType = typeof validTypes[number];
        const rawType = String(params.diagramType ?? "flowchart");
        const diagramType: DiagramType = (validTypes as readonly string[]).includes(rawType)
          ? rawType as DiagramType
          : "flowchart";
        result = await generateMermaidTool.execute!(
          { description: String(params.description ?? ""), diagramType },
          DUMMY_OPTIONS,
        );
        break;
      }

      default:
        return Response.json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }

    return Response.json({ result });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
