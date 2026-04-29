import { Server } from "@modelcontextprotocol/sdk/server";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory";
import { experimental_createMCPClient } from "ai";
import type { MCPTransport } from "ai";

// ── GitHub API helpers ────────────────────────────────────────────────────────

type GitHubItem = { name: string; type: string; size: number; path: string };
type GitHubFile = {
  name: string;
  path: string;
  content?: string;
  encoding?: string;
  size: number;
};

function parseGitHubUrl(input: string) {
  const cleaned = input.trim().replace(/\/$/, "");
  const m = cleaned.match(
    /github\.com\/([^/\s]+)\/([^/\s]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?/,
  );
  if (m) return { owner: m[1], repo: m[2], branch: m[3] ?? "", filePath: m[4] ?? "" };
  const short = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], repo: short[2], branch: "", filePath: "" };
  throw new Error(`Cannot parse GitHub URL or owner/repo: "${input}"`);
}

async function readGitHubContent(args: {
  repoUrl: string;
  path?: string;
  branch?: string;
}) {
  const parsed = parseGitHubUrl(args.repoUrl);
  const { owner, repo } = parsed;
  const branch = args.branch || parsed.branch || "";
  const filePath = (args.path || parsed.filePath || "").replace(/^\//, "");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Praxis-AI-Hub-MCP/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const apiUrl =
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}` +
    (branch ? `?ref=${encodeURIComponent(branch)}` : "");

  const res = await fetch(apiUrl, { headers });

  if (!res.ok) {
    if (res.status === 404)
      return { error: `Not found: ${filePath || "/"} in ${owner}/${repo}${branch ? ` (branch: ${branch})` : ""}` };
    if (res.status === 403 || res.status === 429)
      return { error: "GitHub API rate-limited. Set GITHUB_TOKEN for higher limits." };
    return { error: `GitHub API error ${res.status}` };
  }

  const data = (await res.json()) as GitHubItem[] | GitHubFile;

  if (Array.isArray(data)) {
    const lines = (data as GitHubItem[])
      .sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
      )
      .map(
        (item) =>
          `${item.type === "dir" ? "📁" : "📄"} ${item.name}${item.type === "file" ? ` (${item.size} B)` : ""}`,
      );
    return {
      type: "directory",
      repo: `${owner}/${repo}`,
      path: `/${filePath}`,
      branch: branch || "default",
      itemCount: lines.length,
      listing: lines.join("\n"),
    };
  }

  const file = data as GitHubFile;
  if (file.encoding === "base64" && file.content) {
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf-8");
    const MAX_CHARS = 8000;
    const content =
      decoded.length > MAX_CHARS
        ? decoded.slice(0, MAX_CHARS) + `\n\n...[truncated — ${decoded.length - MAX_CHARS} more chars]`
        : decoded;
    return { type: "file", repo: `${owner}/${repo}`, path: file.path, sizeBytes: file.size, content };
  }

  return { error: "Unexpected response format from GitHub API" };
}

// ── MCP Server + Client factory ───────────────────────────────────────────────

/**
 * Creates an in-process MCP Server exposing a `read_github` tool, then
 * connects to it via InMemoryTransport and returns an AI-SDK MCP client.
 *
 * No child processes are spawned — the server and client communicate through
 * an in-memory message queue, making this reliable on all platforms.
 */
export async function createGitHubMCPClient() {
  // 1. Define the MCP server
  const server = new Server(
    { name: "praxis-github-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  // 2. Register tools/list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_github",
        description:
          "Read files and directory listings from any public GitHub repository via MCP. " +
          "Accepts full GitHub URLs (https://github.com/owner/repo, .../tree/branch/path, " +
          ".../blob/branch/file) or short owner/repo format. " +
          "Leave path empty to list the root directory.",
        inputSchema: {
          type: "object" as const,
          properties: {
            repoUrl: {
              type: "string",
              description:
                "GitHub repo URL or owner/repo (e.g. https://github.com/vercel/next.js or vercel/next.js)",
            },
            path: {
              type: "string",
              description:
                "File or directory path inside the repo (e.g. 'src/index.ts'). Empty = root.",
            },
            branch: {
              type: "string",
              description: "Branch name. Leave empty to use the repo's default branch.",
            },
          },
          required: ["repoUrl"],
        },
      },
    ],
  }));

  // 3. Register tools/call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "read_github") {
      const args = request.params.arguments as {
        repoUrl: string;
        path?: string;
        branch?: string;
      };
      try {
        const result = await readGitHubContent(args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error: ${String(err)}` }],
          isError: true,
        };
      }
    }
    throw new Error(`Unknown MCP tool: ${request.params.name}`);
  });

  // 4. Wire server ↔ client via in-memory transport (no child process)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  // 5. Create AI-SDK MCP client using the client-side transport
  //    InMemoryTransport is structurally compatible with MCPTransport.
  const mcpClient = await experimental_createMCPClient({
    transport: clientTransport as unknown as MCPTransport,
  });

  return { mcpClient, server };
}
