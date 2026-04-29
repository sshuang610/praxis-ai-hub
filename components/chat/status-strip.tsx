"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useChatContext } from "@/lib/chat-context";
import { FEATURE_META } from "./feature-icons";

// Live state during a turn. Sits above the composer, disappears when idle.
// Wording is verbal (「構思中」、「召回記憶中」) not mechanical (「loading…」).
// Icons pull from FEATURE_META so identity matches rail ↔ meta-line.

const TOOL_DISPLAY: Record<string, string> = {
  webSearch:      "網路搜尋",
  generateMermaid: "繪製圖表",
  generateImage:  "生成圖片",
  read_file:      "讀取檔案",
  list_directory: "列出目錄",
  search_files:   "搜尋檔案",
};
//
// State inference from orchestrator:
//   isLoading + no tool calls yet        → "構思中"
//   isLoading + tool call in "call"      → "執行 <tool>"
//   isLoading + last tool "result"       → "整理結果中"
//   isLoading + memory > 0               → "召回記憶中" prefix
export function StatusStrip() {
  const ctx = useChatContext();
  const prefersReduced = useReducedMotion();

  const lastMessage = ctx.messages[ctx.messages.length - 1];
  const assistantInFlight =
    lastMessage && lastMessage.role === "assistant" ? lastMessage : null;
  const activeTool = assistantInFlight?.toolInvocations?.find(
    (t) => t.state === "call",
  );
  const finishedTools =
    assistantInFlight?.toolInvocations?.filter((t) => t.state === "result") ?? [];
  const memoryCount = assistantInFlight?.memorySources?.length ?? 0;

  const phrase = activeTool
    ? `執行 ${TOOL_DISPLAY[activeTool.toolName] ?? activeTool.toolName}`
    : finishedTools.length > 0
      ? "整理結果中"
      : memoryCount > 0
        ? "召回記憶中"
        : "構思中";

  const activeMeta = activeTool
    ? FEATURE_META.tools
    : memoryCount > 0
      ? FEATURE_META.memory
      : FEATURE_META.routing;
  const ActiveIcon = activeMeta.Icon;
  const RoutingIcon = FEATURE_META.routing.Icon;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none px-6"
    >
      <AnimatePresence initial={false}>
        {ctx.isLoading ? (
          <motion.div
            key="strip"
            initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -2 }}
            transition={{ duration: prefersReduced ? 0 : 0.12 }}
            className="flex items-center gap-2 border-b border-dashed border-border/70 pb-2 text-2xs text-muted-foreground"
          >
            <ActiveIcon
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${activeMeta.tone}`}
              strokeWidth={2}
            />
            <span className="font-medium text-foreground/80">{phrase}</span>
            {!prefersReduced ? (
              <span aria-hidden="true" className="flex items-center gap-0.5">
                <motion.span
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                  className="h-0.5 w-0.5 rounded-full bg-current"
                />
                <motion.span
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                  className="h-0.5 w-0.5 rounded-full bg-current"
                />
                <motion.span
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                  className="h-0.5 w-0.5 rounded-full bg-current"
                />
              </span>
            ) : null}
            <span
              aria-hidden="true"
              className="ml-auto inline-flex items-center gap-1 opacity-70"
            >
              <RoutingIcon className="h-3 w-3 text-routing" strokeWidth={2} />
              {ctx.model}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
