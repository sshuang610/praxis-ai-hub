"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useChatContext } from "@/lib/chat-context";
import { useDrawer } from "./drawer-context";
import type { ToolInvocation } from "@/hooks/useChatOrchestrator";
import { LeftDrawer } from "./left-drawer";
import { FEATURE_META } from "../feature-icons";

// Two-section Tools drawer:
//   1. "Available" — static catalog so first-time users know what the agent
//      can do *before* it does it (not a hidden capability).
//   2. "Execution" — the timeline for the current chat. Migrated from the
//      retired StudioPanel's ToolsTab.
// Tool names here are kept in sync with the backend tool registrations. If a
// new tool is wired up server-side, add an entry below and TOOL_LABELS below.

type ToolCatalogEntry = {
  name: string;
  label: string;
  blurb: string;
};

const AVAILABLE_TOOLS: ToolCatalogEntry[] = [
  {
    name: "webSearch",
    label: "網路搜尋 · Web Search",
    blurb: "透過 Tavily API 取得最新外部資訊，用於時事、數據、文獻檢索。",
  },
  {
    name: "generateMermaid",
    label: "產生 Diagram · Mermaid",
    blurb: "把邏輯關係或架構視覺化為 Mermaid 流程圖 / 時序圖 / ER 圖。",
  },
  {
    name: "read_github",
    label: "讀取 GitHub · GitHub MCP",
    blurb: "透過 in-process MCP Server 讀取任意公開 GitHub Repo 的檔案或目錄結構，支援完整 URL 或 owner/repo 格式。",
  },
  {
    name: "generateImage",
    label: "生成圖片 · Image Gen",
    blurb: "使用 Wanx 模型將文字描述轉換為圖片，支援正方形、直式、橫式尺寸。",
  },
];

const TOOL_TEMPLATES: Record<string, string> = {
  webSearch: "請搜尋：",
  generateMermaid: "請用 Mermaid 畫一張圖，描述：",
  read_github: "請讀取 GitHub repo：",
  generateImage: "請生成圖片：",
};

export function ToolsDrawer() {
  const ctx = useChatContext();
  const { closeDrawer } = useDrawer();

  const handleUse = (toolName: string) => {
    const template = TOOL_TEMPLATES[toolName] ?? "";
    ctx.setInput(template);
    closeDrawer();
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>('textarea[data-role="composer"]');
      if (!el) return;
      el.focus();
      el.setSelectionRange(template.length, template.length);
    });
  };

  const allInvocations = useMemo(() => {
    const entries: Array<ToolInvocation & { messageIndex: number }> = [];
    ctx.messages.forEach((message, messageIndex) => {
      if (message.role !== "assistant") return;
      if (!message.toolInvocations) return;
      for (const inv of message.toolInvocations) {
        entries.push({ ...inv, messageIndex });
      }
    });
    return entries;
  }, [ctx.messages]);

  return (
    <LeftDrawer
      id="tools"
      title="工具 · Tools"
      titleId="tools-drawer-title"
    >
      <section aria-labelledby="tools-available" className="space-y-3 border-b border-border p-4">
        <header className="flex items-baseline justify-between">
          <h3
            id="tools-available"
            className="text-2xs uppercase tracking-widest text-muted-foreground"
          >
            可用工具 · Available
          </h3>
          <span className="text-2xs text-muted-foreground">
            {AVAILABLE_TOOLS.length}
          </span>
        </header>
        <ul className="space-y-2">
          {AVAILABLE_TOOLS.map((tool) => (
            <li key={tool.name} className="rounded-md border border-border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <FEATURE_META.tools.Icon
                    aria-hidden="true"
                    className={`mt-0.5 h-3.5 w-3.5 flex-none ${FEATURE_META.tools.tone}`}
                    strokeWidth={2}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-xs font-medium text-foreground">
                      {tool.label}
                    </span>
                    <span className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                      {tool.blurb}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUse(tool.name)}
                  className="flex-none rounded border border-tool/40 bg-tool/5 px-2 py-0.5 text-2xs text-muted-foreground hover:bg-tool/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  插入
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools-timeline" className="p-4">
        <header className="mb-3 flex items-baseline justify-between">
          <h3
            id="tools-timeline"
            className="text-2xs uppercase tracking-widest text-muted-foreground"
          >
            執行紀錄 · Execution
          </h3>
          <span className="text-2xs text-muted-foreground">
            {allInvocations.length}
          </span>
        </header>

        {allInvocations.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            本次對話尚未有工具執行。送出訊息後，若 AI 決定呼叫工具（網路搜尋、讀檔、
            產 diagram 等），執行軌跡會出現在這裡。
          </p>
        ) : (
          <ol className="-mx-4 divide-y divide-border border-y border-border">
            {allInvocations.map((inv, idx) => {
              const isRunning = inv.state === "call";
              const ToolIcon = FEATURE_META.tools.Icon;
              return (
                <li
                  key={`${inv.toolCallId}-${idx}`}
                  className="space-y-2 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm">
                      {isRunning ? (
                        <Loader2
                          aria-hidden="true"
                          className="h-3.5 w-3.5 animate-spin text-info"
                          strokeWidth={2}
                        />
                      ) : (
                        <ToolIcon
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 ${FEATURE_META.tools.tone}`}
                          strokeWidth={2}
                        />
                      )}
                      <span className="font-medium text-foreground">
                        {inv.toolName}
                      </span>
                      <span className="text-2xs text-muted-foreground">
                        · {isRunning ? "執行中" : "完成"}
                      </span>
                    </span>
                    <span className="text-2xs text-muted-foreground">
                      訊息 #{inv.messageIndex + 1}
                    </span>
                  </div>
                  {inv.args ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        參數
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded border border-border bg-muted p-2 font-mono text-2xs text-foreground">
                        {JSON.stringify(inv.args, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {inv.result !== undefined ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        結果
                      </summary>
                      <pre className="mt-1 max-h-[260px] overflow-auto rounded border border-border bg-muted p-2 font-mono text-2xs text-foreground">
                        {typeof inv.result === "string"
                          ? inv.result
                          : JSON.stringify(inv.result, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </LeftDrawer>
  );
}
