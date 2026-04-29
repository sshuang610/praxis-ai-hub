"use client";

import { memo, ReactNode, useMemo, useRef, useState, useEffect, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { useChatContext } from "@/lib/chat-context";
import { useResearchContext } from "@/lib/research-context";
import { CodeBlock } from "@/components/chat/code-block";
import { MermaidBlock } from "@/components/chat/mermaid-block";
import { ToolExecutionStatus } from "@/components/chat/tool-execution-status";
import { MetaLine } from "./meta-line";
import { WelcomeHero } from "./welcome-hero";
import { StatusStrip } from "./status-strip";
import { ContextActions } from "./context-actions";
import { DiagramWizard } from "./diagram-wizard";
import { useDrawer } from "./drawers/drawer-context";
import { FEATURE_META } from "./feature-icons";
import { itemKey } from "@/hooks/useResearchOrchestrator";
import type { ChatMessage, ToolInvocation, DirectToolResult } from "@/hooks/useChatOrchestrator";

// Markdown rendering — keeps v1 primitives (CodeBlock, MermaidBlock) untouched.
function renderMarkdownCode(props: {
  className?: string;
  children?: ReactNode;
  inline?: boolean;
}) {
  const { className, children, inline } = props;
  const raw = String(children || "").replace(/\n$/, "");
  const language = (className?.replace("language-", "") || "text").toLowerCase();
  const hasLanguageClass = Boolean(className?.includes("language-"));
  const isMultiline = raw.includes("\n");
  const isBlockCode = inline === false || hasLanguageClass || isMultiline;
  const isPlainTextBlock = /^(text|txt|plaintext)$/.test(language);
  const isTinySnippet = raw.length <= 64 && raw.split("\n").length <= 2;

  if (!isBlockCode || (isPlainTextBlock && isTinySnippet)) {
    return (
      <code className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.85em] text-foreground">
        {raw}
      </code>
    );
  }

  if (language === "mermaid") {
    return <MermaidBlock code={raw.trim()} />;
  }

  return (
    <CodeBlock
      language={language}
      code={raw.trim()}
      showActions={!isPlainTextBlock}
    />
  );
}

const MARKDOWN_COMPONENTS = { code: renderMarkdownCode };
const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];

export function Conversation() {
  const ctx = useChatContext();
  const researchCtx = useResearchContext();
  const { openDrawer } = useDrawer();
  const showWelcome = ctx.messages.length === 0 && !ctx.isLoading;
  const [composerHidden, setComposerHidden] = useState(false);

  // Track whether the scroll container is near the bottom so ContextActions
  // fades out when the user scrolls up to read history.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const rafRef = useRef<number | null>(null);
  const onScroll = useCallback(() => {
    if (rafRef.current !== null) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = ctx.chatScrollRef.current;
      if (!el) return;
      const threshold = 80;
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
    });
  }, [ctx.chatScrollRef]);

  useEffect(() => {
    const el = ctx.chatScrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [onScroll]);

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      {ctx.currentChat ? <ChatHeader /> : null}

      <div
        ref={ctx.chatScrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label="Chat conversation"
        tabIndex={-1}
        data-role="messages-log"
        className="flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {showWelcome ? (
          <WelcomeHero />
        ) : (
          <MessagesList
            messages={ctx.messages}
            bottomAnchorRef={ctx.bottomAnchorRef}
            isStreaming={ctx.isLoading}
          />
        )}
      </div>

      <StatusStrip />
      <ContextActions
        messageCount={ctx.messages.length}
        isLoading={ctx.isLoading}
        isResearching={researchCtx.isResearching}
        isAtBottom={isAtBottom}
        onResearch={() => {
          openDrawer("research");
          void researchCtx.triggerResearch(ctx.messages);
        }}
        onDiagram={() => researchCtx.openDiagramWizard(ctx.messages)}
      />
      <DiagramWizard
        open={researchCtx.isDiagramWizardOpen}
        onClose={researchCtx.closeDiagramWizard}
        conversationSummary={researchCtx.conversationSummary}
      />

      {/* Composer toggle tab */}
      <div className="flex justify-center border-t border-border">
        <button
          type="button"
          onClick={() => setComposerHidden((v) => !v)}
          aria-label={composerHidden ? "展開打字框" : "收合打字框"}
          title={composerHidden ? "展開打字框" : "收合打字框"}
          className="flex h-5 w-16 items-center justify-center rounded-b-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {composerHidden
            ? <ChevronUp aria-hidden="true" className="h-3 w-3" />
            : <ChevronDown aria-hidden="true" className="h-3 w-3" />}
        </button>
      </div>

      {composerHidden ? null : <Composer />}
    </main>
  );
}

function ChatHeader() {
  const ctx = useChatContext();
  const RoutingIcon = FEATURE_META.routing.Icon;

  // When auto-routing, show the actually-used model from the last assistant message
  const displayModel = useMemo(() => {
    if (ctx.model !== "auto") return ctx.model;
    const lastAssistant = [...ctx.messages].reverse().find(
      (m) => m.role === "assistant" && m.routing?.model,
    );
    return lastAssistant?.routing?.model ?? "auto";
  }, [ctx.model, ctx.messages]);

  return (
    <header className="flex h-11 flex-none items-center justify-between gap-3 border-b border-border px-6">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {ctx.currentChat?.title || "新對話"}
      </h1>
      <div className="flex flex-none items-center gap-x-2.5 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <RoutingIcon
            aria-hidden="true"
            className="h-3 w-3 text-routing"
            strokeWidth={2}
          />
          {displayModel}
          {ctx.model === "auto" && displayModel !== "auto" ? (
            <span className="opacity-60">· auto</span>
          ) : null}
        </span>
        <span aria-hidden="true" className="opacity-60">·</span>
        <span>temp {ctx.temperature.toFixed(2)}</span>
      </div>
    </header>
  );
}

function ToolResultCard({ result }: { result: DirectToolResult }) {
  const { toolName, params, result: data } = result;

  if (toolName === "generateImage") {
    const r = data as { imageUrl?: string; error?: string };
    if (r.error) return (
      <p className="text-xs text-destructive">{r.error}<span className="ml-2 text-muted-foreground">請重新描述或縮短提示詞後重試。</span></p>
    );
    return (
      <figure className="mt-2">
        <img
          src={r.imageUrl}
          alt={String(params.prompt ?? "")}
          loading="lazy"
          style={{ aspectRatio: "4/3" }}
          className="max-h-[480px] w-auto max-w-full rounded-lg border border-border object-contain"
        />
        <figcaption className="mt-1.5 text-2xs text-muted-foreground"><span aria-hidden="true">✦</span> {String(params.prompt ?? "")}</figcaption>
      </figure>
    );
  }

  if (toolName === "webSearch") {
    const r = data as { answer?: string; results?: Array<{ title: string; url: string; content?: string }>; error?: string };
    if (r.error) return (
      <p className="text-xs text-destructive">{r.error}<span className="ml-2 text-muted-foreground">試試更短的關鍵字或不同的搜尋詞。</span></p>
    );
    return (
      <div className="mt-2 space-y-2">
        {r.answer ? (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-foreground">{r.answer}</p>
        ) : null}
        <ol className="space-y-2">
          {(r.results ?? []).map((item, i) => (
            <li key={i} className="rounded-md border border-border p-2.5 text-xs">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary hover:underline"
              >
                {item.title}
              </a>
              {item.content ? (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{item.content}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (toolName === "generateMermaid") {
    const r = data as { diagram?: string; error?: string };
    if (r.error) return <p className="text-xs text-destructive">{r.error}</p>;
    if (r.diagram) return <MermaidBlock code={r.diagram} />;
  }

  return (
    <pre className="mt-2 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-2xs text-foreground">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function InlineImages({ invocations }: { invocations: ToolInvocation[] }) {
  const images = invocations.filter(
    (inv) =>
      inv.toolName === "generateImage" &&
      inv.state === "result" &&
      typeof inv.result === "object" &&
      inv.result !== null &&
      "imageUrl" in (inv.result as object),
  );
  if (images.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-4">
      {images.map((inv) => {
        const res = inv.result as { imageUrl: string; prompt: string };
        return (
          <figure key={inv.toolCallId}>
            <img
              src={res.imageUrl}
              alt={res.prompt}
              loading="lazy"
              style={{ aspectRatio: "4/3" }}
              className="max-h-[480px] w-auto max-w-full rounded-lg border border-border object-contain"
            />
            <figcaption className="mt-1.5 text-2xs text-muted-foreground">
              <span aria-hidden="true">✦</span> {res.prompt}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

// Renders the text body of a single message.
// During streaming: imperatively appends each new token batch as a <span
// class="token-in"> so only newly-arrived text plays the blur-fade animation.
// Raw markdown is shown as plain text while streaming; the full ReactMarkdown
// output fades in with "settle-in" the moment the stream ends.
function MessageContent({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const containerRef = useRef<HTMLSpanElement>(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      prevLenRef.current = 0;
      // containerRef is already unmounted at this point; nothing to clear.
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const newText = content.slice(prevLenRef.current);
    if (!newText) return;
    prevLenRef.current = content.length;

    const span = document.createElement("span");
    if (!prefersReduced) span.className = "token-in";
    span.textContent = newText;
    container.appendChild(span);
  }, [content, isStreaming, prefersReduced]);

  if (isStreaming) {
    return (
      <div className="chat-md">
        {/* Inline block so the cursor sits flush after the last character */}
        <span style={{ display: "block" }}>
          <span
            ref={containerRef}
            className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
          />
          <span aria-hidden="true" className="streaming-cursor" />
        </span>
      </div>
    );
  }

  return (
    <div className={`chat-md${prefersReduced ? "" : " settle-in"}`}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const MessagesList = memo(function MessagesList({
  messages,
  bottomAnchorRef,
  isStreaming,
}: {
  messages: ChatMessage[];
  bottomAnchorRef: React.MutableRefObject<HTMLDivElement | null>;
  isStreaming: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex flex-col">
      {messages.map((message, idx) => {
        const isStreamingMessage =
          isStreaming && idx === messages.length - 1 && message.role === "assistant";
        return (
        <motion.article
          key={message.id}
          initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.18 }}
          className={[
            "space-y-2 border-b border-border/60 px-6 last:border-b-0",
            message.role === "user"
              ? "bg-surface-ink py-4"
              : "bg-background py-6",
          ].join(" ")}
        >
          <header className="flex flex-wrap items-center gap-x-3 text-2xs text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {message.role === "user" ? "You" : "Assistant"}
            </span>
          </header>

          {message.role === "assistant" &&
          message.toolInvocations &&
          message.toolInvocations.length > 0 &&
          message.toolInvocations.some((t) => t.state === "call") ? (
            <ToolExecutionStatus invocations={message.toolInvocations} />
          ) : null}

          {message.directToolResult ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <FEATURE_META.tools.Icon aria-hidden="true" className={`h-3 w-3 ${FEATURE_META.tools.tone}`} strokeWidth={2} />
                <span>直接工具呼叫 · {message.directToolResult.toolName}</span>
              </div>
              <ToolResultCard result={message.directToolResult} />
            </div>
          ) : (
            <MessageContent
              content={String(message.content)}
              isStreaming={isStreamingMessage}
            />
          )}

          {message.role === "assistant" && message.toolInvocations ? (
            <InlineImages invocations={message.toolInvocations} />
          ) : null}

          {message.role === "assistant" ? <MetaLine message={message} /> : null}
        </motion.article>
        );
      })}
      <div ref={bottomAnchorRef} />
    </div>
  );
});

MessagesList.displayName = "MessagesList";

type SlashCommand = {
  cmd: string;
  icon: string;
  label: string;
  hint: string;
  toolName: string;
  paramKey: string;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "/search",  icon: "🔍", label: "網路搜尋",  hint: "/search <查詢內容>",  toolName: "webSearch",      paramKey: "query" },
  { cmd: "/image",   icon: "🖼️", label: "生成圖片",  hint: "/image <圖片描述>",  toolName: "generateImage",  paramKey: "prompt" },
  { cmd: "/diagram", icon: "📊", label: "畫流程圖",  hint: "/diagram <描述>",    toolName: "generateMermaid", paramKey: "description" },
  { cmd: "/read",    icon: "📄", label: "讀取檔案",  hint: "/read <檔案路徑>",   toolName: "read_file",      paramKey: "path" },
  { cmd: "/ls",      icon: "📁", label: "列出目錄",  hint: "/ls <目錄路徑>",     toolName: "list_directory", paramKey: "path" },
];

function SlashMenu({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (cmd: SlashCommand) => void;
}) {
  const query = value.slice(1).toLowerCase();
  const matches = SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(query));
  if (!value.startsWith("/") || matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
      {matches.map((cmd) => (
        <button
          key={cmd.cmd}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd); }}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-base" aria-hidden="true">{cmd.icon}</span>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs font-medium text-foreground">{cmd.label}</span>
            <span className="text-2xs text-muted-foreground">{cmd.hint}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

const DIAGRAM_TYPE_LABELS: Record<string, string> = {
  flowchart: "流程圖",
  mindmap: "心智圖",
  sequenceDiagram: "時序圖",
  erDiagram: "ER 圖",
  classDiagram: "類別圖",
  gantt: "甘特圖",
};

function Composer() {
  const ctx = useChatContext();
  const researchCtx = useResearchContext();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [injectAndSubmit, setInjectAndSubmit] = useState(false);
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const githubInputRef = useRef<HTMLInputElement | null>(null);

  const handleGithubInsert = () => {
    const url = githubUrl.trim();
    if (!url) return;
    ctx.setInput(`請讀取 GitHub repo：${url}`);
    setGithubUrl("");
    setShowGithubInput(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // After injecting the diagram code into input, re-trigger submit so
  // ctx.onSubmit reads the updated input value in the next render cycle.
  useEffect(() => {
    if (!injectAndSubmit) return;
    setInjectAndSubmit(false);
    formRef.current?.requestSubmit();
  }, [injectAndSubmit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = ctx.input.trim();
    const diagram = researchCtx.pendingDiagram;
    const hasSelection = researchCtx.selectedItems.length > 0;

    if (!raw && !diagram && ctx.uploadedFiles.length === 0) return;

    // If there's a pending diagram or selected context items, combine everything
    // into one injection and re-submit on the next render cycle.
    if (diagram || hasSelection) {
      let combined = raw;

      if (diagram) {
        const mermaidBlock = "```mermaid\n" + diagram.code + "\n```";
        combined = combined ? mermaidBlock + "\n\n" + combined : mermaidBlock;
        researchCtx.clearPendingDiagram();
      }

      if (hasSelection) {
        const contextLines = researchCtx.selectedItems.map((item) => {
          if (item.type === "repo") {
            const base = `- [GitHub Repo] ${item.data.full_name} (⭐${item.data.stargazers_count}): ${item.data.description ?? ""}`;
            return item.data.readme
              ? base + `\n  README excerpt: ${item.data.readme.slice(0, 300)}`
              : base;
          }
          if (item.type === "paper") {
            const cite = typeof item.data.citationCount === "number"
              ? ` [${item.data.citationCount} citations]`
              : "";
            return `- [Paper] "${item.data.title}"${cite} (${item.data.published}): ${item.data.summary.slice(0, 200)}`;
          }
          return `- [Web] ${item.data.title}: ${item.data.content ?? ""}`;
        });
        combined += "\n\n[參考資料 Context References]\n" + contextLines.join("\n");
        researchCtx.clearSelection();
      }

      ctx.setInput(combined);
      setInjectAndSubmit(true);
      return;
    }

    const matched = SLASH_COMMANDS.find((c) => raw.toLowerCase().startsWith(c.cmd + " ") || raw.toLowerCase() === c.cmd);
    if (matched) {
      const argPart = raw.slice(matched.cmd.length).trim();
      if (!argPart) {
        textareaRef.current?.focus();
        return;
      }
      ctx.setInput("");
      await ctx.runTool(matched.toolName, { [matched.paramKey]: argPart });
      return;
    }

    ctx.onSubmit(e);
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="border-t border-border bg-background px-6 py-4"
      aria-label="Compose a message"
    >
      <div className="space-y-3">
        {/* Shopping cart chips — selected research context items */}
        {researchCtx.selectedItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {researchCtx.selectedItems.map((item) => (
              <span
                key={itemKey(item)}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-2xs text-foreground"
              >
                <span aria-hidden="true">{item.type === "repo" ? "📦" : item.type === "paper" ? "📄" : "🌐"}</span>
                <span className="max-w-[12rem] truncate">
                  {item.type === "repo"
                    ? item.data.full_name
                    : item.data.title}
                </span>
                <button
                  type="button"
                  onClick={() => researchCtx.toggleItem(item)}
                  aria-label="Remove"
                  className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={researchCtx.clearSelection}
              className="text-2xs text-muted-foreground hover:text-foreground"
            >
              全部清除
            </button>
          </div>
        ) : null}

        <div className="relative">
          <label htmlFor="message-input" className="sr-only">
            Message
          </label>
          <SlashMenu
            value={ctx.input}
            onSelect={(cmd) => {
              ctx.setInput(cmd.cmd + " ");
              requestAnimationFrame(() => textareaRef.current?.focus());
            }}
          />
          <textarea
            ref={textareaRef}
            id="message-input"
            data-role="composer"
            value={ctx.input}
            onChange={(e) => ctx.setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
              if (e.key === "Escape" && ctx.input.startsWith("/")) {
                ctx.setInput("");
              }
            }}
            placeholder="輸入訊息，或 / 呼叫工具 — Ctrl/⌘+Enter 送出"
            rows={3}
            className="w-full resize-y rounded-md border border-input bg-background px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <button
            type="submit"
            disabled={ctx.isLoading || !ctx.input.trim()}
            className="absolute bottom-2 right-2 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            {ctx.isLoading ? "傳送中…" : "送出"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={ctx.fileInputRef}
            type="file"
            multiple
            accept=".c,.cpp,.h,.hpp,.py,.js,.ts,.tsx,.pdf,.txt,.md,.json,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              ctx.appendUploadedFilesForCurrentChat(files);
              e.currentTarget.value = "";
            }}
            className="hidden"
            aria-label="Attach files"
          />

          <button
            type="button"
            onClick={ctx.handlePickFilesClick}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span aria-hidden="true">+</span>
            附加檔案
          </button>

          <button
            type="button"
            onClick={() => {
              setShowGithubInput((v) => !v);
              if (!showGithubInput) {
                requestAnimationFrame(() => githubInputRef.current?.focus());
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span aria-hidden="true">⌥</span>
            GitHub
          </button>

          {showGithubInput ? (
            <div className="flex w-full items-center gap-2">
              <input
                ref={githubInputRef}
                type="url"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleGithubInsert(); }
                  if (e.key === "Escape") { setShowGithubInput(false); setGithubUrl(""); }
                }}
                placeholder="https://github.com/owner/repo 或 owner/repo"
                className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={handleGithubInsert}
                disabled={!githubUrl.trim()}
                className="inline-flex h-8 items-center rounded-md border border-primary/40 bg-primary/5 px-3 text-xs text-foreground hover:bg-primary/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                插入
              </button>
            </div>
          ) : null}

          {ctx.isLoading ? (
            <button
              type="button"
              onClick={ctx.stop}
              className="inline-flex h-8 items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs text-destructive hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              停止
            </button>
          ) : null}

          {!ctx.isLoading && ctx.canRetryLastRequest ? (
            <button
              type="button"
              onClick={() => void ctx.retryLastRequest()}
              className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              重試
            </button>
          ) : null}

          <label className="ml-auto inline-flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={ctx.streamingEnabled}
              onChange={(e) => ctx.setStreamingEnabled(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Streaming
          </label>
        </div>

        {ctx.uploadedFiles.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border bg-surface-paper p-3">
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>
                {ctx.uploadedFiles.length} 個檔案待附加
              </span>
              <button
                type="button"
                onClick={() => ctx.setUploadedFilesForCurrentChat([])}
                className="rounded text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                全部移除
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {ctx.uploadedFiles.map((file) => {
                const key = `${file.name}:${file.size}:${file.lastModified}`;
                return (
                  <li
                    key={key}
                    className="inline-flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <span
                      className="max-w-[180px] truncate text-foreground"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => ctx.handleRemoveQueuedFile(file)}
                      aria-label={`Remove ${file.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {researchCtx.pendingDiagram ? (
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span aria-hidden="true" className="text-sm">📊</span>
            <span className="flex-1 text-xs text-foreground">
              Mermaid: {DIAGRAM_TYPE_LABELS[researchCtx.pendingDiagram.diagramType] ?? researchCtx.pendingDiagram.diagramType}
            </span>
            <button
              type="button"
              onClick={researchCtx.clearPendingDiagram}
              aria-label="Remove diagram attachment"
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
