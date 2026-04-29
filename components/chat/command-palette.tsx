"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Cpu,
  FileText,
  History,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useChatContext } from "@/lib/chat-context";
import { useDrawer, DrawerId } from "./drawers/drawer-context";
import { FEATURE_META } from "./feature-icons";

// Manual ⌘K palette — no cmdk dependency. Scholarly register: hairline borders,
// sentence-case labels, Lucide icons encode category (drawer = feature icon
// from FEATURE_META · model = Cpu · template = FileText · chat = History ·
// action = ChevronRight). Focus-trapped; Esc or click-outside closes.

type PaletteItem = {
  id: string;
  Icon: LucideIcon;
  tone?: string;
  label: string;
  hint?: string;
  shortcut?: string;
  run: () => void | Promise<void>;
};

const DRAWER_META: Record<
  DrawerId,
  { Icon: LucideIcon; tone: string; label: string; shortcut?: string }
> = {
  chats: { Icon: History, tone: "text-muted-foreground", label: "Open chats" },
  memory: {
    Icon: FEATURE_META.memory.Icon,
    tone: FEATURE_META.memory.tone,
    label: "Open memory",
    shortcut: "⌘1",
  },
  routing: {
    Icon: FEATURE_META.routing.Icon,
    tone: FEATURE_META.routing.tone,
    label: "Open routing",
    shortcut: "⌘2",
  },
  tools: {
    Icon: FEATURE_META.tools.Icon,
    tone: FEATURE_META.tools.tone,
    label: "Open tools",
    shortcut: "⌘3",
  },
  artifacts: {
    Icon: FEATURE_META.artifact.Icon,
    tone: FEATURE_META.artifact.tone,
    label: "Open artifacts",
    shortcut: "⌘4",
  },
  research: {
    Icon: Search,
    tone: "text-primary",
    label: "Open research panel",
    shortcut: "⌘5",
  },
};

export function CommandPalette({
  open,
  onClose,
  onFocusComposer,
  onFocusMessages,
}: {
  open: boolean;
  onClose: () => void;
  onFocusComposer?: () => void;
  onFocusMessages?: () => void;
}) {
  const ctx = useChatContext();
  const { openDrawer } = useDrawer();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = [];

    result.push({
      id: "new-chat",
      Icon: ChevronRight,
      label: "New chat",
      hint: "Start a fresh conversation",
      run: () => void ctx.handleCreateChat(),
    });
    result.push({
      id: "toggle-theme",
      Icon: ChevronRight,
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    });

    (Object.entries(DRAWER_META) as [DrawerId, typeof DRAWER_META[DrawerId]][]).forEach(
      ([id, meta]) => {
        result.push({
          id: `drawer-${id}`,
          Icon: meta.Icon,
          tone: meta.tone,
          label: meta.label,
          shortcut: meta.shortcut,
          run: () => openDrawer(id),
        });
      },
    );

    result.push({
      id: "focus-composer",
      Icon: ChevronRight,
      label: "Focus composer",
      hint: "Jump to input",
      run: () => onFocusComposer?.(),
    });
    result.push({
      id: "focus-messages",
      Icon: ChevronRight,
      label: "Focus messages",
      run: () => onFocusMessages?.(),
    });
    result.push({
      id: "export",
      Icon: ChevronRight,
      label: "Export conversation",
      hint: "Download as JSON",
      run: () => ctx.onExport(),
    });
    result.push({
      id: "reset",
      Icon: ChevronRight,
      label: "Reset current chat",
      hint: "Clear all messages",
      run: () => void ctx.handleResetCurrentChat(),
    });

    if (ctx.onSignOut) {
      result.push({
        id: "sign-out",
        Icon: ChevronRight,
        label: "Sign out",
        run: () => ctx.onSignOut?.(),
      });
    }

    for (const m of ctx.modelOptions) {
      if (m === ctx.model) continue;
      result.push({
        id: `model-${m}`,
        Icon: Cpu,
        tone: "text-muted-foreground",
        label: `Switch model to ${m}`,
        hint: "Model",
        run: () => ctx.setModel(m),
      });
    }

    for (const t of ctx.allPromptTemplates) {
      result.push({
        id: `template-${t.id}`,
        Icon: FileText,
        tone: "text-muted-foreground",
        label: `Use template: ${t.label}`,
        hint: "Template",
        run: () => ctx.handleSelectTemplate(t.id),
      });
    }

    for (const chat of ctx.visibleRecentChats.slice(0, 8)) {
      if (chat.id === ctx.chatId) continue;
      result.push({
        id: `chat-${chat.id}`,
        Icon: History,
        tone: "text-muted-foreground",
        label: `Open chat: ${chat.title || "Untitled chat"}`,
        hint: chat.model,
        run: () => ctx.selectChat(chat.id, chat.model),
      });
    }

    return result;
  }, [ctx, theme, setTheme, openDrawer, onFocusComposer, onFocusMessages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.hint ? i.hint.toLowerCase().includes(q) : false),
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  const runItem = useCallback(
    async (item: PaletteItem) => {
      await item.run();
      onClose();
    },
    [onClose],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) void runItem(item);
      }
    },
    [activeIndex, filtered, onClose, runItem],
  );

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLLIElement>(
      `[data-index="${activeIndex}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="border-b border-border px-4 py-3">
          <label htmlFor="palette-input" className="sr-only">
            Command
          </label>
          <input
            id="palette-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, drawers, models, templates, chats…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-[50vh] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              No matches.
            </li>
          ) : null}
          {filtered.map((item, idx) => {
            const active = idx === activeIndex;
            const Icon = item.Icon;
            return (
              <li
                key={item.id}
                data-index={idx}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => void runItem(item)}
                className={[
                  "flex cursor-pointer items-center gap-3 px-4 py-2",
                  active ? "bg-accent text-accent-foreground" : "text-foreground/90",
                ].join(" ")}
              >
                <Icon
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 flex-none ${item.tone || "text-muted-foreground"}`}
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-sm">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                ) : null}
                {item.hint && !item.shortcut ? (
                  <span className="text-2xs text-muted-foreground">{item.hint}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-2xs text-muted-foreground">
          <span>
            <kbd className="rounded border border-border px-1">↑↓</kbd> navigate ·{" "}
            <kbd className="rounded border border-border px-1">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded border border-border px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
