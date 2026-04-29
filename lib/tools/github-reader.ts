import { tool } from "ai";
import { z } from "zod";

type GitHubItem = { name: string; type: string; size: number; path: string };
type GitHubFile = { name: string; path: string; content?: string; encoding?: string; size: number };

function parseGitHubUrl(input: string): { owner: string; repo: string; branch: string; filePath: string } {
  const cleaned = input.trim().replace(/\/$/, "");

  // Full URL: https://github.com/owner/repo[/tree|blob/branch[/path]]
  const m = cleaned.match(/github\.com\/([^/\s]+)\/([^/\s]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.+))?)?/);
  if (m) return { owner: m[1], repo: m[2], branch: m[3] ?? "", filePath: m[4] ?? "" };

  // Short form: owner/repo
  const short = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], repo: short[2], branch: "", filePath: "" };

  throw new Error(`Cannot parse GitHub URL or owner/repo: "${input}"`);
}

export const githubReaderTool = tool({
  description:
    "Read files and directory listings from any public GitHub repository. " +
    "Accepts full GitHub URLs (https://github.com/owner/repo, .../tree/branch/path, .../blob/branch/file) " +
    "or short owner/repo format. Leave path empty to list the root directory.",
  parameters: z.object({
    repoUrl: z
      .string()
      .describe("GitHub repo URL or owner/repo string (e.g. https://github.com/vercel/next.js or vercel/next.js)"),
    path: z
      .string()
      .optional()
      .default("")
      .describe("File or directory path inside the repo (e.g. 'src/index.ts'). Empty = root."),
    branch: z
      .string()
      .optional()
      .default("")
      .describe("Branch name. Leave empty to use the repo's default branch."),
  }),
  execute: async ({ repoUrl, path: inputPath, branch: inputBranch }) => {
    try {
      const parsed = parseGitHubUrl(repoUrl);
      const owner = parsed.owner;
      const repo = parsed.repo;
      const branch = inputBranch || parsed.branch || "";
      const filePath = (inputPath || parsed.filePath || "").replace(/^\//, "");

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Praxis-AI-Hub/1.0",
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
          return { error: "GitHub API rate-limited or access denied. Set GITHUB_TOKEN for higher limits." };
        return { error: `GitHub API error ${res.status}` };
      }

      const data = (await res.json()) as GitHubItem[] | GitHubFile;

      // ── Directory listing ────────────────────────────────────────────────────
      if (Array.isArray(data)) {
        const lines = (data as GitHubItem[])
          .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
          .map((item) => `${item.type === "dir" ? "📁" : "📄"} ${item.name}${item.type === "file" ? ` (${item.size} B)` : ""}`);
        return {
          type: "directory",
          repo: `${owner}/${repo}`,
          path: `/${filePath}`,
          branch: branch || "default",
          itemCount: lines.length,
          listing: lines.join("\n"),
        };
      }

      // ── Single file ──────────────────────────────────────────────────────────
      const file = data as GitHubFile;
      if (file.encoding === "base64" && file.content) {
        const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf-8");
        const MAX_CHARS = 8000;
        const content =
          decoded.length > MAX_CHARS
            ? decoded.slice(0, MAX_CHARS) + `\n\n...[truncated — ${decoded.length - MAX_CHARS} more chars]`
            : decoded;
        return {
          type: "file",
          repo: `${owner}/${repo}`,
          path: file.path,
          sizeBytes: file.size,
          content,
        };
      }

      return { error: "Unexpected response format from GitHub API" };
    } catch (err) {
      return { error: String(err) };
    }
  },
});
