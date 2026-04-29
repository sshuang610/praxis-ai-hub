"use client";

import { memo, useState } from "react";
import { Star, ExternalLink, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { RightDrawer } from "./drawers/right-drawer";
import { MermaidBlock } from "./mermaid-block";
import { useDrawer } from "./drawers/drawer-context";
import { useResearchContext } from "@/lib/research-context";
import { useChatContext } from "@/lib/chat-context";
import { itemKey } from "@/hooks/useResearchOrchestrator";
import type { ResearchOrchestrator, SelectedItem } from "@/hooks/useResearchOrchestrator";
import type { GitHubRepo } from "@/lib/search/github";
import type { ArxivPaper } from "@/lib/search/arxiv";
import type { WebArticle } from "@/hooks/useResearchOrchestrator";

// ── Skeleton ──────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-border p-3 space-y-2">
      <div className="h-3 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-foreground/80 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>
          {title}{" "}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            {count}
          </span>
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open ? <div className="space-y-2 px-4 pb-3">{children}</div> : null}
    </div>
  );
}

// ── BibTeX helper ─────────────────────────────────────────────────────────

function toPaperBibTeX(paper: ArxivPaper): string {
  const rawId = paper.id.split("/abs/").at(-1) ?? paper.id;
  const year = paper.published.slice(0, 4);
  const lastAuthor = (paper.authors[0] ?? "Unknown").split(" ").at(-1) ?? "Unknown";
  const key = `${lastAuthor}${year}`;
  return [
    `@article{${key},`,
    `  title   = {${paper.title}},`,
    `  author  = {${paper.authors.join(" and ")}},`,
    `  year    = {${year}},`,
    `  eprint  = {${rawId}},`,
    `  archivePrefix = {arXiv},`,
    `  primaryClass  = {${paper.categories[0] ?? ""}}`,
    `}`,
  ].join("\n");
}

// ── Card components ───────────────────────────────────────────────────────

const RepoCard = memo(function RepoCard({
  repo,
  researchCtx,
}: {
  repo: GitHubRepo;
  researchCtx: ResearchOrchestrator;
}) {
  const item: SelectedItem = { type: "repo", data: repo };
  const checked = researchCtx.isSelected(item);

  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <label className="mt-0.5 flex shrink-0 cursor-pointer p-1 -m-1">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => researchCtx.toggleItem(item)}
              aria-label={`Select ${repo.full_name}`}
              className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
            />
          </label>
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1 min-w-0"
          >
            <span className="truncate">{repo.full_name}</span>
            <ExternalLink aria-hidden="true" className="h-3 w-3 flex-none" />
          </a>
        </div>
        <div className="flex flex-none items-center gap-2 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <Star aria-hidden="true" className="h-3 w-3" />
            {repo.stargazers_count.toLocaleString()}
          </span>
          {repo.forks_count > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <span aria-hidden="true">🍴</span> {repo.forks_count.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {repo.language ? (
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            {repo.language}
          </span>
        ) : null}
        {repo.topics.slice(0, 3).map((t) => (
          <span key={t} className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            {t}
          </span>
        ))}
      </div>
      {repo.description ? (
        <p className="text-2xs text-muted-foreground line-clamp-2">{repo.description}</p>
      ) : null}
      <p className="text-2xs text-muted-foreground/70">
        Updated {new Date(repo.updated_at).toLocaleDateString()}
      </p>
    </div>
  );
});

const PaperCard = memo(function PaperCard({
  paper,
  researchCtx,
}: {
  paper: ArxivPaper;
  researchCtx: ResearchOrchestrator;
}) {
  const item: SelectedItem = { type: "paper", data: paper };
  const checked = researchCtx.isSelected(item);
  const displayAuthors =
    paper.authors.length > 2
      ? `${paper.authors.slice(0, 2).join(", ")} et al.`
      : paper.authors.join(", ");

  const [deepSummary, setDeepSummary] = useState<{
    contributions: string[];
    limitations: string[];
  } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function handleDeepSummary() {
    setIsSummarizing(true);
    setSummaryError(null);
    try {
      const res = await fetch("/api/paper-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: paper.title, abstract: paper.summary }),
      });
      const data = (await res.json()) as {
        contributions: string[];
        limitations: string[];
        error?: string;
      };
      if (data.contributions) setDeepSummary(data);
      else setSummaryError("AI 總結失敗，請重試。");
    } catch {
      setSummaryError("AI 總結失敗，請重試。");
    } finally {
      setIsSummarizing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <label className="mt-0.5 flex shrink-0 cursor-pointer p-1 -m-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => researchCtx.toggleItem(item)}
            aria-label={`Select ${paper.title}`}
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
        </label>
        <a
          href={paper.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline flex items-start gap-1 min-w-0"
        >
          <span className="flex-1">{paper.title}</span>
          <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 flex-none" />
        </a>
      </div>
      {displayAuthors ? (
        <p className="text-2xs text-muted-foreground">{displayAuthors}</p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {paper.categories.map((c) => (
          <span key={c} className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
            {c}
          </span>
        ))}
      </div>
      {paper.summary ? (
        <p className="text-2xs text-muted-foreground line-clamp-3">{paper.summary}</p>
      ) : null}
      <div className="flex items-center gap-3 text-2xs text-muted-foreground/70">
        {paper.published ? <span>{paper.published}</span> : null}
        {typeof paper.citationCount === "number" ? (
          <span className="inline-flex items-center gap-0.5 text-primary/70 font-medium">
            <span aria-hidden="true">✦</span> {paper.citationCount.toLocaleString()} 引用
          </span>
        ) : null}
      </div>

      {/* Paper action buttons */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(toPaperBibTeX(paper))}
          className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">📝</span> 複製 BibTeX
        </button>
        <button
          type="button"
          onClick={() => void handleDeepSummary()}
          disabled={isSummarizing}
          className="inline-flex h-7 items-center gap-1 rounded border border-border bg-background px-2 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isSummarizing ? (
            <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
          ) : (
            <span aria-hidden="true">✨</span>
          )}{" "}
          AI 深度總結
        </button>
      </div>

      {summaryError ? (
        <p className="mt-1.5 text-2xs text-destructive">{summaryError}</p>
      ) : null}
      {deepSummary ? (
        <div className="mt-2 rounded-md border border-primary/20 bg-primary/5 p-2 space-y-1.5 text-2xs">
          <p className="font-medium text-foreground">貢獻</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {deepSummary.contributions.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
          <p className="font-medium text-foreground mt-1.5">限制</p>
          <ul className="space-y-0.5 text-muted-foreground">
            {deepSummary.limitations.map((l, i) => (
              <li key={i}>• {l}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

const ArticleCard = memo(function ArticleCard({
  article,
  researchCtx,
}: {
  article: WebArticle;
  researchCtx: ResearchOrchestrator;
}) {
  const item: SelectedItem = { type: "article", data: article };
  const checked = researchCtx.isSelected(item);
  const relevancePct = Math.round(Math.min(article.score, 1) * 100);

  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <label className="mt-0.5 flex shrink-0 cursor-pointer p-1 -m-1">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => researchCtx.toggleItem(item)}
            aria-label={`Select ${article.title}`}
            className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
          />
        </label>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline flex items-start gap-1 min-w-0"
        >
          <span className="flex-1">{article.title}</span>
          <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 flex-none" />
        </a>
      </div>
      {article.content ? (
        <p className="text-2xs text-muted-foreground line-clamp-2">{article.content}</p>
      ) : null}
      <div className="flex items-center gap-1.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/50"
            style={{ width: `${relevancePct}%` }}
            aria-label={`Relevance ${relevancePct}%`}
          />
        </div>
        <span className="text-2xs text-muted-foreground/70">{relevancePct}%</span>
      </div>
    </div>
  );
});

// ── Main panel ────────────────────────────────────────────────────────────

export function ResearchPanel() {
  const researchCtx = useResearchContext();
  const chatCtx = useChatContext();
  const { closeDrawer, openDrawer } = useDrawer();
  const { isResearching, results, researchError, selectedItems, ltmMemories } = researchCtx;

  const keywords = results?.keywords ?? [];
  const repos = results?.repos ?? [];
  const papers = results?.papers ?? [];
  const articles = results?.articles ?? [];
  const totalResults = repos.length + papers.length + articles.length;

  async function handleExportLiterature() {
    await researchCtx.exportLiteratureReview();
    openDrawer("artifacts");
  }

  const headerRight = (
    <div className="flex items-center gap-2 mr-1">
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {keywords.slice(0, 3).map((kw) => (
            <span key={kw} className="rounded bg-primary/10 px-1.5 py-0.5 text-2xs text-primary">
              {kw}
            </span>
          ))}
        </div>
      ) : null}
      {selectedItems.length > 0 ? (
        <span className="text-2xs font-medium text-primary whitespace-nowrap">
          {selectedItems.length} 選取
        </span>
      ) : null}
    </div>
  );

  return (
    <RightDrawer
      id="research"
      title="研究資料 · Research"
      titleId="research-panel-title"
      headerRight={headerRight}
    >
      {/* LTM badge + trajectory */}
      {ltmMemories.length > 0 ? (
        <div className="border-b border-border px-4 py-2 space-y-2">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-2xs text-primary select-none">
              <span aria-hidden="true">🧠</span> 融合 {ltmMemories.length} 筆歷史記憶優化搜尋
              <ChevronDown
                aria-hidden="true"
                className="h-3 w-3 transition-transform group-open:rotate-180"
              />
            </summary>
            <ul className="mt-1.5 space-y-1 pl-4 text-2xs text-muted-foreground">
              {ltmMemories.map((m) => (
                <li key={m.id} className="line-clamp-2">
                  {m.content.slice(0, 120)}
                </li>
              ))}
            </ul>
          </details>

          <button
            type="button"
            onClick={() => void researchCtx.generateTrajectory()}
            disabled={researchCtx.isGeneratingTrajectory}
            className="inline-flex h-7 items-center gap-1.5 rounded border border-border bg-background px-3 text-2xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {researchCtx.isGeneratingTrajectory ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            ) : (
              <span aria-hidden="true">🗺️</span>
            )}{" "}
            繪製我的研究軌跡
          </button>

          {researchCtx.trajectoryDiagram ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex justify-end border-b border-border px-2 py-1">
                <button
                  type="button"
                  onClick={researchCtx.clearTrajectory}
                  className="text-2xs text-muted-foreground hover:text-foreground"
                >
                  關閉
                </button>
              </div>
              <div className="max-h-64 overflow-auto p-2">
                <MermaidBlock code={researchCtx.trajectoryDiagram} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Literature review export button */}
      {selectedItems.length > 0 ? (
        <div className="border-b border-border px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-2xs text-muted-foreground">
            {selectedItems.length} 項已選取
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={researchCtx.clearSelection}
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              清除
            </button>
            <button
              type="button"
              onClick={() => void handleExportLiterature()}
              disabled={researchCtx.isExportingLiterature}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-primary/30 bg-primary/5 px-3 text-2xs font-medium text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {researchCtx.isExportingLiterature ? (
                <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <span aria-hidden="true">📑</span>
              )}{" "}
              匯出為文獻綜述
            </button>
          </div>
        </div>
      ) : null}

      {/* Main results area */}
      {isResearching ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : researchError ? (
        <div className="p-4 space-y-1 text-xs">
          <p className="text-destructive">搜尋失敗：{researchError}</p>
          <p className="text-muted-foreground">試試縮短關鍵字，或確認網路連線是否正常。</p>
        </div>
      ) : totalResults === 0 ? (
        <div className="flex h-40 items-center justify-center px-6 text-center text-xs text-muted-foreground">
          尚未搜尋。
          <br />
          點選「搜尋相關資料」開始。
        </div>
      ) : (
        <>
          <Section title="GitHub Repos" count={repos.length}>
            {repos.map((r) => (
              <RepoCard key={r.id} repo={r} researchCtx={researchCtx} />
            ))}
          </Section>
          <Section title="Arxiv Papers" count={papers.length}>
            {papers.map((p) => (
              <PaperCard key={p.id} paper={p} researchCtx={researchCtx} />
            ))}
          </Section>
          <Section title="Web Articles" count={articles.length}>
            {articles.map((a) => (
              <ArticleCard key={a.url} article={a} researchCtx={researchCtx} />
            ))}
          </Section>
        </>
      )}

    </RightDrawer>
  );
}
