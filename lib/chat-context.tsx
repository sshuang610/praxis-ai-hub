"use client";

import { createContext, ReactNode, useContext } from "react";
import type { ChatOrchestrator } from "@/hooks/useChatOrchestrator";

const ChatContext = createContext<ChatOrchestrator | null>(null);

export function ChatProvider({
  value,
  children,
}: {
  value: ChatOrchestrator;
  children: ReactNode;
}) {
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatOrchestrator {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return ctx;
}
