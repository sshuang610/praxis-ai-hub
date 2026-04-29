"use client";

import { useEffect, useMemo } from "react";
import { useChatContext } from "@/lib/chat-context";
import { useResearchContext } from "@/lib/research-context";
import { CodeBlock } from "@/components/chat/code-block";
import { MermaidBlock } from "@/components/chat/mermaid-block";
import { RightDrawer } from "./right-drawer";
import { FEATURE_META } from "../feature-icons";

type Artifact = {
  id: string;
  language: string;
  code: string;
};

function extractArtifacts(
  messages: Array<{ role: string; content: string }>,
): Artifact[] {
  const artifacts: Artifact[] = [];
  const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    let match: RegExpExecArray | null;
    let blockIndex = 0;
    while ((match = regex.exec(message.content)) !== null) {
      const language = match[1] || "text";
      const code = (match[2] || "").trim();
      artifacts.push({ id: `m${index}-b${blockIndex}`, language, code });
      blockIndex += 1;
    }
  });

  return artifacts;
}

// Artifacts drawer — right-side push panel for code and mermaid outputs.
// Reads current chat messages, extracts fenced code blocks, and renders
// with auto/manual diff mode. Migrated from the retired StudioPanel's ArtifactsTab.
export function ArtifactsDrawer() {
  const ctx = useChatContext();
  const researchCtx = useResearchContext();

  const artifacts = useMemo(
    () =>
      extractArtifacts(
        ctx.messages.map((m) => ({
          role: m.role,
          content: String(m.content),
        })),
      ),
    [ctx.messages],
  );

  const artifactDiffBaseById = useMemo(() => {
    const lastIndexByLanguage = new Map<string, number>();
    const result = new Map<string, { code: string; index: number }>();
    artifacts.forEach((artifact, idx) => {
      const normalizedLanguage = artifact.language.toLowerCase();
      const previousIndex = lastIndexByLanguage.get(normalizedLanguage);
      if (typeof previousIndex === "number") {
        const previousArtifact = artifacts[previousIndex];
        result.set(artifact.id, {
          code: previousArtifact.code,
          index: previousIndex,
        });
      }
      lastIndexByLanguage.set(normalizedLanguage, idx);
    });
    return result;
  }, [artifacts]);

  const artifactIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    artifacts.forEach((artifact, idx) => indexMap.set(artifact.id, idx));
    return indexMap;
  }, [artifacts]);

  const manualDiffBaseArtifact = useMemo(() => {
    if (!ctx.manualDiffBaseId) return undefined;
    return artifacts.find((a) => a.id === ctx.manualDiffBaseId);
  }, [artifacts, ctx.manualDiffBaseId]);

  const { manualDiffBaseId, setManualDiffBaseId } = ctx;
  useEffect(() => {
    if (artifacts.length === 0) {
      if (manualDiffBaseId) setManualDiffBaseId("");
      return;
    }
    if (manualDiffBaseId && artifacts.some((a) => a.id === manualDiffBaseId))
      return;
    setManualDiffBaseId(artifacts[0].id);
  }, [artifacts, manualDiffBaseId, setManualDiffBaseId]);

  return (
    <RightDrawer
      id="artifacts"
      title="產物 · Artifacts"
      titleId="artifacts-drawer-title"
      headerRight={
        artifacts.length > 0 ? (
          <span className="text-2xs text-muted-foreground">
            {artifacts.length} 個產出
          </span>
        ) : null
      }
    >
      {researchCtx.pendingLiteratureReview ? (
        <div className="border-b border-border p-4 space-y-2">
          <div className="flex items-center justify-between text-2xs font-medium text-foreground">
            <span><span aria-hidden="true">📑</span> 文獻綜述</span>
            <button
              type="button"
              onClick={researchCtx.clearLiteratureReview}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close literature review"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <CodeBlock language="markdown" code={researchCtx.pendingLiteratureReview} />
        </div>
      ) : null}

      {artifacts.length === 0 ? (
        <div className="p-6 text-xs text-muted-foreground">
          <FEATURE_META.artifact.Icon
            aria-hidden="true"
            className={`mb-2 h-5 w-5 ${FEATURE_META.artifact.tone}`}
            strokeWidth={1.75}
          />
          <p className="text-foreground">這個對話尚無產出</p>
          <p className="mt-1">
            試著請 AI 寫程式、畫流程圖或產出 Markdown 文件。
          </p>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <fieldset className="rounded-md border border-border p-3">
            <legend className="px-1 text-2xs uppercase tracking-widest text-muted-foreground">
              比較模式 · Diff
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => ctx.setArtifactDiffMode("auto")}
                className={[
                  "inline-flex h-7 items-center rounded-md border px-2.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ctx.artifactDiffMode === "auto"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                自動
              </button>
              <button
                type="button"
                onClick={() => ctx.setArtifactDiffMode("manual")}
                className={[
                  "inline-flex h-7 items-center rounded-md border px-2.5 text-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ctx.artifactDiffMode === "manual"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                手動
              </button>
            </div>
            {ctx.artifactDiffMode === "manual" ? (
              <label className="mt-2 block">
                <span className="sr-only">Manual diff base artifact</span>
                <select
                  value={ctx.manualDiffBaseId}
                  onChange={(e) => ctx.setManualDiffBaseId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-2xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {artifacts.map((artifact, idx) => (
                    <option key={artifact.id} value={artifact.id}>
                      #{idx + 1} · {artifact.language}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>

          <div className="space-y-6">
            {artifacts.map((artifact, idx) => {
              const autoDiffBase = artifactDiffBaseById.get(artifact.id);
              const manualDiffBaseIndex = manualDiffBaseArtifact
                ? artifactIndexById.get(manualDiffBaseArtifact.id)
                : undefined;
              const diffBase =
                ctx.artifactDiffMode === "manual"
                  ? manualDiffBaseArtifact &&
                    manualDiffBaseArtifact.id !== artifact.id
                    ? {
                        code: manualDiffBaseArtifact.code,
                        index: manualDiffBaseIndex ?? -1,
                      }
                    : undefined
                  : autoDiffBase;

              const isMermaid = artifact.language.toLowerCase() === "mermaid";

              return (
                <div key={artifact.id} className="space-y-2">
                  <div className="flex items-baseline justify-between text-2xs text-muted-foreground">
                    <span className="inline-flex items-baseline gap-1.5">
                      <FEATURE_META.artifact.Icon
                        aria-hidden="true"
                        className={`h-3 w-3 ${FEATURE_META.artifact.tone}`}
                        strokeWidth={2}
                      />
                      <span>#{idx + 1}</span>
                      <span className="opacity-70">· {artifact.language}</span>
                    </span>
                    {!isMermaid && diffBase && diffBase.index >= 0 ? (
                      <span>比較對象 #{diffBase.index + 1}</span>
                    ) : null}
                  </div>
                  {isMermaid ? (
                    <MermaidBlock
                      code={artifact.code}
                      id={`artifact-${artifact.id}`}
                    />
                  ) : (
                    <CodeBlock
                      language={artifact.language}
                      code={artifact.code}
                      originalCode={diffBase?.code}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </RightDrawer>
  );
}
