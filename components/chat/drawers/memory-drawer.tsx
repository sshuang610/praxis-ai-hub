"use client";

import { useCallback, useEffect, useState } from "react";
import { LeftDrawer } from "./left-drawer";
import { FEATURE_META } from "../feature-icons";

// Memory drawer — browses all long-term memory chunks stored in pgvector,
// with per-chunk delete. Replaces the old MemoryBrowser which used hardcoded
// zinc classes; this version is fully token-driven.
type MemoryEntry = {
  id: string;
  content: string;
  source_type: "conversation" | "file" | "summary";
  chat_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const SOURCE_LABEL: Record<MemoryEntry["source_type"], string> = {
  conversation: "對話",
  file: "檔案",
  summary: "摘要",
};

export function MemoryDrawer() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory?limit=50", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { chunks?: MemoryEntry[] };
      setEntries(data.chunks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入記憶，請重新整理後重試。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("確定刪除這條記憶？此操作無法復原。");
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "刪除失敗，請重試。");
    }
  };

  const filtered = query.trim()
    ? entries.filter((e) =>
        e.content.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : entries;

  return (
    <LeftDrawer
      id="memory"
      title="長期記憶 · Memory"
      titleId="memory-drawer-title"
      headerRight={
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh memory"
          className="inline-flex h-7 items-center rounded-md border border-border px-2 text-2xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          重整
        </button>
      }
    >
      <div className="space-y-3 border-b border-border p-4">
        <label htmlFor="memory-drawer-search" className="sr-only">
          Search memory
        </label>
        <input
          id="memory-drawer-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="依內容篩選…"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <div className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
          <FEATURE_META.memory.Icon
            aria-hidden="true"
            className={`h-3 w-3 ${FEATURE_META.memory.tone}`}
            strokeWidth={2}
          />
          <span>
            {entries.length} 條記憶
            {query.trim() ? ` · 顯示 ${filtered.length} 條` : ""}
          </span>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">載入中…</p>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        {!loading && !error && entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚未累積長期記憶。當你對話多一些之後，重要片段會自動沉澱到這裡。
          </p>
        ) : null}

        {!loading && !error && filtered.length === 0 && entries.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            沒有符合「{query}」的記憶片段。
          </p>
        ) : null}

        <ul className="space-y-2">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="space-y-2 rounded-md border border-border bg-surface-paper p-3 text-xs"
            >
              <div className="flex items-center justify-between text-2xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <FEATURE_META.memory.Icon
                    aria-hidden="true"
                    className={`h-3 w-3 ${FEATURE_META.memory.tone}`}
                    strokeWidth={2}
                  />
                  <span>{SOURCE_LABEL[entry.source_type] || entry.source_type}</span>
                </span>
                <span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
              <p className="max-h-28 overflow-hidden text-xs leading-relaxed text-foreground/90">
                {entry.content.slice(0, 280)}
                {entry.content.length > 280 ? "…" : ""}
              </p>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void handleDelete(entry.id)}
                  className="inline-flex h-7 items-center rounded-md border border-destructive/40 bg-destructive/5 px-2 text-2xs text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </LeftDrawer>
  );
}
