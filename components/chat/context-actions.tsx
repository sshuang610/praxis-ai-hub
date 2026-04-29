"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, Search, BarChart2 } from "lucide-react";

type ContextActionsProps = {
  messageCount: number;
  isLoading: boolean;
  isResearching: boolean;
  isAtBottom: boolean;
  onResearch: () => void;
  onDiagram: () => void;
};

export function ContextActions({
  messageCount,
  isLoading,
  isResearching,
  isAtBottom,
  onResearch,
  onDiagram,
}: ContextActionsProps) {
  const prefersReduced = useReducedMotion();

  if (messageCount < 2 || isLoading) return null;

  return (
    <div
      role="toolbar"
      aria-label="Context actions"
      className="px-6 pb-3 transition-opacity duration-200"
      style={{ opacity: isAtBottom ? 1 : 0.25, pointerEvents: isAtBottom ? "auto" : "none" }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key="context-actions"
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
          transition={{ duration: prefersReduced ? 0 : 0.12 }}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={onResearch}
            disabled={isResearching}
            aria-label="Search related repositories, papers, and articles"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-xs text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResearching ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <Search aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            )}
            <span>{isResearching ? "搜尋中…" : "搜尋相關資料"}</span>
          </button>

          <button
            type="button"
            onClick={onDiagram}
            aria-label="Generate a diagram from conversation context"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 text-xs text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BarChart2 aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
            <span>產生圖表</span>
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
