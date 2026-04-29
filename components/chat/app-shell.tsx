"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatContext } from "@/lib/chat-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "./command-palette";
import { LeftRail } from "./left-rail";
import { Conversation } from "./conversation";
import {
  DrawerProvider,
  DrawerAPI,
  DrawerId,
} from "./drawers/drawer-context";
import { ChatsDrawer } from "./drawers/chats-drawer";
import { MemoryDrawer } from "./drawers/memory-drawer";
import { RoutingDrawer } from "./drawers/routing-drawer";
import { ToolsDrawer } from "./drawers/tools-drawer";
import { ArtifactsDrawer } from "./drawers/artifacts-drawer";
import { ResearchPanel } from "./research-panel";

// Root shell for the conversation-centric + feature-summonable paradigm.
//
// Layout hierarchy:
//   header (h-12, full width)
//   └ body (flex row)
//      ├ rail (w-14, permanent)
//      ├ conversation-region (flex-1, position:relative)
//      │  ├ left drawers (absolute, overlay)
//      │  └ Conversation (flex-1)
//      └ Artifacts drawer (flex-none, width 0 → 440, push)
//
// Drawer mutex enforced here: opening any drawer closes the current one.
// Keyboard shortcuts (⌘1/2/3/4, ⌘K) installed as window listeners.
export function AppShell() {
  const ctx = useChatContext();
  const [activeDrawer, setActiveDrawer] = useState<DrawerId | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const drawerAPI = useMemo<DrawerAPI>(
    () => ({
      activeDrawer,
      openDrawer: (id) => setActiveDrawer(id),
      closeDrawer: () => setActiveDrawer(null),
      toggleDrawer: (id) =>
        setActiveDrawer((prev) => (prev === id ? null : id)),
    }),
    [activeDrawer],
  );

  // ⌘K palette + ⌘1/2/3/4 drawer shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      const drawerByNumber: Record<string, DrawerId> = {
        "1": "memory",
        "2": "routing",
        "3": "tools",
        "4": "artifacts",
        "5": "research",
      };
      const drawerId = drawerByNumber[e.key];
      if (drawerId) {
        e.preventDefault();
        drawerAPI.toggleDrawer(drawerId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerAPI]);

  // Close user menu on outside click / Esc
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      const menuEl = userMenuRef.current;
      if (menuEl?.contains(e.target as Node)) return;
      // The rail button triggers re-opening via onOpenUserMenu toggle; when
      // clicked while open, outside-click fires first and closes it, then the
      // button's onClick toggles it back. To keep it simple, allow the button
      // itself to handle the close case via stopPropagation in the rail.
      setUserMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  const focusComposer = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-role="composer"]',
    );
    el?.focus();
  }, []);

  const focusMessages = useCallback(() => {
    const el = document.querySelector<HTMLElement>('[data-role="messages-log"]');
    el?.focus();
  }, []);

  return (
    <DrawerProvider value={drawerAPI}>
      <div
        className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground"
        onClick={() => {
          if (ctx.chatMenu) ctx.setChatMenu(null);
        }}
      >
        <AppHeader onOpenPalette={() => setPaletteOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <LeftRail
            onOpenUserMenu={() => {
              setUserMenuOpen((v) => !v);
            }}
          />

          <div className="flex min-w-0 flex-1">
            <ChatsDrawer />
            <MemoryDrawer />
            <RoutingDrawer />
            <ToolsDrawer />

            <div className="flex min-w-0 flex-1">
              <Conversation />
            </div>
          </div>

          <ArtifactsDrawer />
          <ResearchPanel />
        </div>

        {userMenuOpen ? (
          <div
            ref={userMenuRef}
            role="menu"
            aria-label="Account menu"
            className="fixed bottom-3 left-[72px] z-40 w-60 rounded-md border border-border bg-background p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-3 py-2">
              <div className="text-2xs uppercase tracking-widest text-muted-foreground">
                Signed in
              </div>
              <div
                className="mt-0.5 truncate text-sm text-foreground"
                title={ctx.userEmail || ""}
              >
                {ctx.userEmail || "unknown user"}
              </div>
            </div>
            {ctx.onSignOut ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  ctx.onSignOut?.();
                }}
                className="mt-1 block w-full rounded px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Sign out
              </button>
            ) : null}
          </div>
        ) : null}

        {ctx.chatMenu ? (
          <div
            className="fixed z-50 min-w-[140px] rounded-md border border-border bg-background p-1 shadow-lg"
            style={{ left: ctx.chatMenu.x, top: ctx.chatMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void ctx.handleTogglePinChat(ctx.chatMenu!.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ctx.chatMenu.chat.metadata?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => void ctx.handleRenameChat(ctx.chatMenu!.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => void ctx.handleDeleteChat(ctx.chatMenu!.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Delete
            </button>
          </div>
        ) : null}

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onFocusComposer={focusComposer}
          onFocusMessages={focusMessages}
        />
      </div>
    </DrawerProvider>
  );
}

function AppHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="flex h-12 flex-none items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-sm border border-border text-2xs font-semibold text-primary"
        >
          P
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-foreground">Praxis</span>
          <span className="text-2xs text-muted-foreground">
            AI Hub · 研究工作平台
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette"
          title="Command palette (⌘K)"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">⌘</span>
          <span>K</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
