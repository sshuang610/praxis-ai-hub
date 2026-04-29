"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ChatMessage, ToolInvocation } from "@/hooks/useChatOrchestrator";
import { useDrawer } from "./drawers/drawer-context";
import { FEATURE_META } from "./feature-icons";

// Meta-line sits under a completed assistant message. Four entries act as
// retrospective entry points (how did this response come to be?):
//   routing  → inline routing trace              (GitBranch icon)
//   memory   → inline memory snippets            (BookOpen icon)
//   tools    → inline tool I/O                   (Wrench icon)
//   artifact → opens right Artifacts drawer      (FileCode icon)
//
// Icons match those used on the rail + status strip so users learn the mapping
// once. Each chip carries a text label (count + unit) so identity is never
// conveyed by color alone. Reduced-motion collapses the 180ms reveal to instant.

type ExpandedKey = "routing" | "memory" | "tools" | null;

function countArtifacts(content: string): number {
  const regex = /```[a-zA-Z0-9_+-]*\n[\s\S]*?```/g;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) count += 1;
  return count;
}

export function MetaLine({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState<ExpandedKey>(null);
  const { openDrawer } = useDrawer();
  const prefersReduced = useReducedMotion();

  if (message.role !== "assistant") return null;

  const hasRouting = Boolean(message.routing);
  const memoryCount = message.memorySources?.length ?? 0;
  const toolCount = message.toolInvocations?.length ?? 0;
  const artifactCount = useMemo(
    () => countArtifacts(String(message.content || "")),
    [message.content],
  );

  if (!hasRouting && memoryCount === 0 && toolCount === 0 && artifactCount === 0) {
    return null;
  }

  const toggle = (key: ExpandedKey) =>
    setExpanded((prev) => (prev === key ? null : key));

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {hasRouting ? (
          <FeatureChip
            Icon={FEATURE_META.routing.Icon}
            tone={FEATURE_META.routing.tone}
            label={message.routing!.model}
            expanded={expanded === "routing"}
            onClick={() => toggle("routing")}
          />
        ) : null}

        {memoryCount > 0 ? (
          <FeatureChip
            Icon={FEATURE_META.memory.Icon}
            tone={FEATURE_META.memory.tone}
            label={`${memoryCount} 條記憶`}
            expanded={expanded === "memory"}
            onClick={() => toggle("memory")}
          />
        ) : null}

        {toolCount > 0 ? (
          <FeatureChip
            Icon={FEATURE_META.tools.Icon}
            tone={FEATURE_META.tools.tone}
            label={`${toolCount} 個工具`}
            expanded={expanded === "tools"}
            onClick={() => toggle("tools")}
          />
        ) : null}

        {artifactCount > 0 ? (
          <button
            type="button"
            onClick={() => openDrawer("artifacts")}
            aria-label={`Open artifacts panel (${artifactCount})`}
            className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <FEATURE_META.artifact.Icon
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${FEATURE_META.artifact.tone}`}
              strokeWidth={2}
            />
            <span>
              {artifactCount} 個產出
            </span>
            <span aria-hidden="true" className="opacity-60">
              ↗
            </span>
          </button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {expanded === "routing" && hasRouting ? (
          <Expand prefersReduced={prefersReduced}>
            <RoutingExpand message={message} />
          </Expand>
        ) : null}
        {expanded === "memory" && memoryCount > 0 ? (
          <Expand prefersReduced={prefersReduced}>
            <MemoryExpand message={message} />
          </Expand>
        ) : null}
        {expanded === "tools" && toolCount > 0 ? (
          <Expand prefersReduced={prefersReduced}>
            <ToolsExpand message={message} />
          </Expand>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FeatureChip({
  Icon,
  tone,
  label,
  expanded,
  onClick,
}: {
  Icon: LucideIcon;
  tone: string;
  label: string;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="inline-flex items-center gap-1.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Icon
        aria-hidden="true"
        className={`h-3.5 w-3.5 ${tone}`}
        strokeWidth={2}
      />
      <span>{label}</span>
      <span aria-hidden="true" className={expanded ? "opacity-90" : "opacity-50"}>
        {expanded ? "▾" : "▸"}
      </span>
    </button>
  );
}

function Expand({
  prefersReduced,
  children,
}: {
  prefersReduced: boolean | null;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={prefersReduced ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-2 pl-4 pt-1 text-xs text-foreground/90">
        {children}
      </div>
    </motion.div>
  );
}

function RoutingExpand({ message }: { message: ChatMessage }) {
  const r = message.routing!;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Model</dt>
      <dd className="text-foreground">{r.model}</dd>
      <dt className="text-muted-foreground">Reason</dt>
      <dd className="text-foreground">{r.reason}</dd>
    </dl>
  );
}

function MemoryExpand({ message }: { message: ChatMessage }) {
  const sources = message.memorySources ?? [];
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.id} className="space-y-1">
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={`tabular-nums ${FEATURE_META.memory.tone}`}>
                相似度 {s.similarity.toFixed(2)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{s.sourceType}</span>
            </span>
            {s.chatId ? (
              <span className="truncate opacity-70">
                來自對話 · {s.chatId.slice(0, 6)}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-foreground/90">
            {s.preview.slice(0, 220)}
            {s.preview.length > 220 ? "…" : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ToolsExpand({ message }: { message: ChatMessage }) {
  const tools = message.toolInvocations ?? [];
  const ToolIcon = FEATURE_META.tools.Icon;
  return (
    <ul className="space-y-3">
      {tools.map((inv) => (
        <li key={inv.toolCallId} className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <ToolIcon
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${FEATURE_META.tools.tone}`}
              strokeWidth={2}
            />
            <span className="font-medium text-foreground">{inv.toolName}</span>
            <span className="text-2xs text-muted-foreground">
              · {inv.state === "call" ? "執行中" : "完成"}
            </span>
          </div>
          {inv.args ? (
            <ToolPre label="參數">{formatToolPayload(inv.args)}</ToolPre>
          ) : null}
          {inv.result !== undefined ? (
            <ToolPre label="結果">{formatToolPayload(inv.result)}</ToolPre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ToolPre({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="text-2xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <pre className="mt-1 max-h-[180px] overflow-auto rounded border border-border bg-background p-2 font-mono text-2xs text-foreground">
        {children}
      </pre>
    </details>
  );
}

function formatToolPayload(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type { ToolInvocation };
