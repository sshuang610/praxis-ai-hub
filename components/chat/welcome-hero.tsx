"use client";

import { Pin } from "lucide-react";
import { useChatContext } from "@/lib/chat-context";
import { FEATURE_META, type FeatureKey } from "./feature-icons";

// Shown when a chat has no messages yet. Three layers of orientation:
//   1. Title + sublabel (bilingual)
//   2. Four feature cards teaching the interface surface
//   3. Suggested prompts (tap to fill composer) + recent chats strip
// Spatial rhythm: generous top (48), tight card rows (gap-3), hairline dividers.
const FEATURE_CARDS: Array<{ key: FeatureKey; blurb: string }> = [
  { key: "memory", blurb: "跨對話累積你問過的一切" },
  { key: "routing", blurb: "依題目選擇最合適的模型" },
  { key: "tools", blurb: "代理會執行程式、查詢、計算" },
  { key: "artifact", blurb: "程式碼、diagram、文件自動彙整" },
];

const SUGGESTED_PROMPTS = [
  "整理我最近問過關於 transformer 的內容",
  "把這段 code 改成 functional 寫法並畫出資料流 diagram",
  "Summarize today's arxiv CS.CL papers for me",
  "解釋 pgvector 的 HNSW 索引與 IVFFlat 差異",
  "讀取 github.com/vercel/next.js 的 README 並總結核心功能",
] as const;

function focusComposer(text: string, setInput: (v: string) => void) {
  setInput(text);
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-role="composer"]',
    );
    el?.focus();
    const len = el?.value.length ?? 0;
    el?.setSelectionRange(len, len);
  });
}

export function WelcomeHero() {
  const ctx = useChatContext();
  const recent = ctx.visibleRecentChats.slice(0, 5);

  return (
    <div className="flex flex-col gap-10 px-6 pb-16 pt-20">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          今天要探索什麼？
        </h1>
        <p className="text-sm text-muted-foreground">
          What are you exploring today?
        </p>
        <p className="text-xs text-muted-foreground/70">
          輸入 <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[11px]">/</kbd> 呼叫工具，或點選左側欄位探索記憶、模型與產出功能。
        </p>
      </header>

      <section aria-label="Feature overview">
        <h2 className="sr-only">Available capabilities</h2>
        <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {FEATURE_CARDS.map((card) => {
            const meta = FEATURE_META[card.key];
            const Icon = meta.Icon;
            return (
              <li key={card.key} className="bg-background p-5">
                <div className="flex items-start gap-3">
                  <Icon
                    aria-hidden="true"
                    size={20}
                    strokeWidth={1.75}
                    className={`${meta.tone} flex-none`}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {meta.zh}
                      <span className="ml-2 text-2xs font-normal text-muted-foreground">
                        · {meta.en}
                      </span>
                    </span>
                    <span className="mt-0.5 text-xs text-muted-foreground">
                      {card.blurb}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Suggested prompts" className="space-y-3">
        <h2 className="text-2xs uppercase tracking-widest text-muted-foreground">
          建議 · Try one
        </h2>
        <ul className="space-y-1.5">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => focusComposer(prompt, ctx.setInput)}
                className="group flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 text-muted-foreground transition-colors group-hover:text-primary"
                >
                  →
                </span>
                <span className="flex-1">{prompt}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 ? (
        <section aria-label="Recent conversations" className="space-y-3">
          <h2 className="text-2xs uppercase tracking-widest text-muted-foreground">
            最近對話 · Recent
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {recent.map((chat) => (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => ctx.selectChat(chat.id, chat.model)}
                  className="group flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-3 w-3 items-center justify-center text-muted-foreground"
                  >
                    {chat.metadata?.pinned ? (
                      <Pin
                        className="h-3 w-3 text-primary"
                        strokeWidth={2}
                        fill="currentColor"
                      />
                    ) : (
                      "·"
                    )}
                  </span>
                  <span className="flex-1 truncate text-sm text-foreground">
                    {chat.title || "未命名對話"}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {chat.model}
                  </span>
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {new Date(chat.updated_at).toLocaleDateString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
