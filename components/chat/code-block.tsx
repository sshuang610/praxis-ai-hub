"use client";

import { memo, useEffect, useMemo, useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";

type CodeBlockProps = {
  code: string;
  language?: string;
  originalCode?: string;
  showActions?: boolean;
};

const EXT_MAP: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  cxx: "cpp",
  h: "h",
  hpp: "hpp",
  py: "py",
  python: "py",
  js: "js",
  ts: "ts",
  tsx: "tsx",
  json: "json",
  bash: "sh",
  sh: "sh",
};

const highlightCache = new Map<string, string>();

function escapeCodeAsHtml(rawCode: string) {
  const escaped = rawCode
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<pre><code>${escaped}</code></pre>`;
}

export const CodeBlock = memo(function CodeBlock({ code, language = "text", originalCode, showActions = true }: CodeBlockProps) {
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [isDiffOpen, setIsDiffOpen] = useState<boolean>(Boolean(originalCode));
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const normalizedLanguage = useMemo(() => language.toLowerCase(), [language]);
  const canPreviewHtml = useMemo(
    () => (normalizedLanguage === "html" || normalizedLanguage === "htm") && !originalCode,
    [normalizedLanguage, originalCode],
  );

  useEffect(() => {
    const cacheKey = `${normalizedLanguage}::${code}`;
    const cached = highlightCache.get(cacheKey);
    if (cached) {
      setHighlightedHtml(cached);
      return;
    }

    let mounted = true;
    setHighlightedHtml(escapeCodeAsHtml(code));
    void render();

    async function render() {
      try {
        const { codeToHtml } = await import("shiki");
        const html = await codeToHtml(code, {
          lang: normalizedLanguage,
          theme: "github-dark",
        });

        highlightCache.set(cacheKey, html);

        if (mounted) {
          setHighlightedHtml(html);
        }
      } catch {
        if (mounted) {
          setHighlightedHtml(escapeCodeAsHtml(code));
        }
      }
    }

    return () => {
      mounted = false;
    };
  }, [code, normalizedLanguage]);

  useEffect(() => {
    if (!isExpanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isExpanded]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
  };

  const handleDownload = () => {
    const extension = EXT_MAP[normalizedLanguage] || "txt";
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `artifact.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderMainContent = (maxHeightClass: string) => {
    if (originalCode && isDiffOpen) {
      return (
        <div className={`${maxHeightClass} overflow-auto p-2`}>
          <ReactDiffViewer
            oldValue={originalCode}
            newValue={code}
            splitView
            disableWordDiff={false}
            leftTitle="Original"
            rightTitle="Refactored"
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: "#09090b",
                  gutterBackground: "#18181b",
                  addedBackground: "#052e16",
                  removedBackground: "#450a0a",
                  wordAddedBackground: "#14532d",
                  wordRemovedBackground: "#7f1d1d",
                  addedColor: "#bbf7d0",
                  removedColor: "#fecaca",
                  gutterColor: "#a1a1aa",
                  highlightBackground: "#27272a",
                  highlightGutterBackground: "#3f3f46",
                  codeFoldGutterBackground: "#18181b",
                  codeFoldBackground: "#18181b",
                  emptyLineBackground: "#09090b",
                  gutterBackgroundDark: "#18181b",
                },
              },
            }}
          />
        </div>
      );
    }

    if (canPreviewHtml && isPreviewOpen) {
      return (
        <div className={`${maxHeightClass} w-full overflow-hidden bg-white`}>
          <iframe
            title="artifact-live-preview"
            srcDoc={code}
            sandbox="allow-scripts allow-forms"
            className="h-full w-full border-0"
          />
        </div>
      );
    }

    return (
      <div
        className={[
          "prose prose-invert max-w-none overflow-auto [&_pre]:bg-transparent",
          maxHeightClass,
          showActions ? "p-3" : "p-2 text-[13px] leading-6",
        ].join(" ")}
        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
      />
    );
  };

  return (
    <>
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      {showActions ? (
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
          <span>{normalizedLanguage}</span>
          <div className="flex items-center gap-2">
            {originalCode ? (
              <button
                type="button"
                onClick={() => setIsDiffOpen((v) => !v)}
                className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
              >
                {isDiffOpen ? "Hide Diff" : "Show Diff"}
              </button>
            ) : null}
            {canPreviewHtml ? (
              <button
                type="button"
                onClick={() => setIsPreviewOpen((v) => !v)}
                className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
              >
                {isPreviewOpen ? "Hide Preview" : "Live Preview"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="rounded-md border border-zinc-700 px-2 py-1 hover:bg-zinc-800"
            >
              Expand
            </button>
          </div>
        </div>
      ) : null}

      {renderMainContent("max-h-[520px]")}
    </div>

    {isExpanded ? (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
        <div className="flex h-[92vh] w-[96vw] max-w-[1700px] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-sm text-zinc-300">
            <div>
              {normalizedLanguage}
              {originalCode && isDiffOpen ? " · Diff View" : " · Code View"}
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="rounded-md border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1">{renderMainContent("h-full")}</div>
        </div>
      </div>
    ) : null}
    </>
  );
});

CodeBlock.displayName = "CodeBlock";
