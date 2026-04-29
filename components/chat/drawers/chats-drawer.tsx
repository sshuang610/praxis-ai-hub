"use client";

import { Pin } from "lucide-react";
import { useChatContext } from "@/lib/chat-context";
import { useDrawer } from "./drawer-context";
import { LeftDrawer } from "./left-drawer";

// Chats list: search + create + pin/rename/delete via context menu on hover.
export function ChatsDrawer() {
  const ctx = useChatContext();
  const { closeDrawer } = useDrawer();

  return (
    <LeftDrawer
      id="chats"
      title="對話紀錄 · Chats"
      titleId="chats-drawer-title"
      headerRight={
        <button
          type="button"
          onClick={() => {
            void ctx.handleCreateChat();
            closeDrawer();
          }}
          aria-label="New chat"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-2xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">+</span>
          New
        </button>
      }
    >
      <div className="space-y-3 border-b border-border p-4">
        <label htmlFor="drawer-chat-search" className="sr-only">
          Search chats
        </label>
        <input
          id="drawer-chat-search"
          type="search"
          value={ctx.chatSearch}
          onChange={(e) => ctx.setChatSearch(e.target.value)}
          placeholder="依標題篩選…"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      <ul aria-label="Recent chats">
        {ctx.chatListLoading ? (
          <li className="px-4 py-3 text-xs text-muted-foreground">載入中…</li>
        ) : null}
        {!ctx.chatListLoading && ctx.visibleRecentChats.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-muted-foreground">
            還沒有對話紀錄。點選左上角 + 開始第一則對話。
          </li>
        ) : null}
        {ctx.visibleRecentChats.map((chat) => {
          const active = ctx.chatId === chat.id;
          return (
            <li key={chat.id} className="border-b border-border/60 last:border-b-0">
              <div
                className={[
                  "group flex items-start gap-2 px-4 py-3",
                  active ? "bg-accent" : "hover:bg-accent/40",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => {
                    ctx.selectChat(chat.id, chat.model);
                    closeDrawer();
                  }}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <div className="flex items-center gap-2">
                    {chat.metadata?.pinned ? (
                      <Pin
                        aria-label="Pinned"
                        className="h-3 w-3 flex-none text-primary"
                        strokeWidth={2}
                        fill="currentColor"
                      />
                    ) : null}
                    <span className="truncate text-sm text-foreground">
                      {chat.title || "未命名對話"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex gap-2 text-2xs text-muted-foreground">
                    <span>{chat.model}</span>
                    <span aria-hidden="true">·</span>
                    <span>{new Date(chat.updated_at).toLocaleDateString()}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => ctx.handleOpenChatMenu(e, chat)}
                  aria-label={`More actions for ${chat.title || "未命名對話"}`}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true">⋯</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </LeftDrawer>
  );
}
