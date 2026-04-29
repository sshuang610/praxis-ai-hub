"use client";

import { createContext, ReactNode, useContext } from "react";
import type { ResearchOrchestrator } from "@/hooks/useResearchOrchestrator";

const ResearchContext = createContext<ResearchOrchestrator | null>(null);

export function ResearchProvider({
  value,
  children,
}: {
  value: ResearchOrchestrator;
  children: ReactNode;
}) {
  return (
    <ResearchContext.Provider value={value}>{children}</ResearchContext.Provider>
  );
}

export function useResearchContext(): ResearchOrchestrator {
  const ctx = useContext(ResearchContext);
  if (!ctx) {
    throw new Error("useResearchContext must be used within a ResearchProvider");
  }
  return ctx;
}
