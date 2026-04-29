"use client";

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { ToolInvocation } from "@/hooks/useChatOrchestrator";
import { FEATURE_META } from "./feature-icons";

// In-flight tool card shown inside an assistant message while a tool is
// streaming. Running uses a spinning Loader2; done uses the Wrench icon
// (same as rail / meta-line / tools drawer). Identity never conveyed by
// color alone — text labels carry the semantic.
const TOOL_LABELS: Record<string, string> = {
  webSearch: "Web Search",
  generateMermaid: "Generate Diagram",
  generateImage: "Generate Image",
  read_file: "Read File",
  list_directory: "List Directory",
  search_files: "Search Files",
};

function describeTool(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

export function ToolExecutionStatus({
  invocations,
}: {
  invocations: ToolInvocation[];
}) {
  const prefersReducedMotion = useReducedMotion();
  if (!invocations || invocations.length === 0) return null;

  const ToolIcon = FEATURE_META.tools.Icon;

  return (
    <div className="mb-2 space-y-1.5" role="status" aria-live="polite">
      {invocations.map((inv) => {
        const label = describeTool(inv.toolName);
        const isRunning = inv.state === "call";
        return (
          <motion.div
            key={inv.toolCallId}
            initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : undefined}
            className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs"
          >
            {isRunning ? (
              <Loader2
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin text-info"
                strokeWidth={2}
              />
            ) : (
              <ToolIcon
                aria-hidden="true"
                className={`h-3.5 w-3.5 ${FEATURE_META.tools.tone}`}
                strokeWidth={2}
              />
            )}
            <span className="font-medium text-foreground">{label}</span>
            <span className="text-muted-foreground">· {isRunning ? "執行中" : "完成"}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
