"use client";

import { createContext, ReactNode, useContext } from "react";

// Shape-glyph-aligned drawer identity. Each feature on the left rail maps 1:1.
export type DrawerId = "chats" | "memory" | "routing" | "tools" | "artifacts" | "research";

export type DrawerAPI = {
  activeDrawer: DrawerId | null;
  openDrawer: (id: DrawerId) => void;
  closeDrawer: () => void;
  toggleDrawer: (id: DrawerId) => void;
};

const DrawerContext = createContext<DrawerAPI | null>(null);

export function DrawerProvider({
  value,
  children,
}: {
  value: DrawerAPI;
  children: ReactNode;
}) {
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerAPI {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
