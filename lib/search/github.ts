export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
  readme?: string;
};

export async function searchGitHub(
  keywords: string[],
  max = 5,
): Promise<GitHubRepo[]> {
  if (keywords.length === 0) return [];
  const query = encodeURIComponent(
    keywords.map((k) => k.replace(/\b(OR|AND|NOT)\b/gi, " ").replace(/\s+/g, " ").trim()).join(" ")
  );
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${max}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: Array<GitHubRepo & { forks_count?: number }>;
  };
  return (data.items ?? []).slice(0, max).map((item) => ({
    id: item.id,
    name: item.name,
    full_name: item.full_name,
    description: item.description,
    html_url: item.html_url,
    stargazers_count: item.stargazers_count,
    forks_count: item.forks_count ?? 0,
    language: item.language,
    topics: item.topics ?? [],
    updated_at: item.updated_at,
  }));
}

export async function fetchRepoReadme(
  fullName: string,
  token?: string,
): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/readme`,
      { headers },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: string; encoding?: string };
    if (!data.content || data.encoding !== "base64") return null;
    const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    return decoded.slice(0, 500);
  } catch {
    return null;
  }
}
