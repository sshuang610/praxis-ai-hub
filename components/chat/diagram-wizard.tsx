"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, X, BarChart2 } from "lucide-react";
import { MermaidBlock } from "./mermaid-block";
import { useResearchContext } from "@/lib/research-context";

type DiagramType =
  | "flowchart"
  | "sequenceDiagram"
  | "erDiagram"
  | "gantt"
  | "mindmap"
  | "classDiagram";

const DIAGRAM_TYPES: { id: DiagramType; label: string; hint: string }[] = [
  { id: "flowchart",       label: "流程圖", hint: "Flowchart"       },
  { id: "mindmap",         label: "心智圖", hint: "Mind map"        },
  { id: "sequenceDiagram", label: "時序圖", hint: "Sequence"        },
  { id: "erDiagram",       label: "ER 圖",  hint: "Entity-relation" },
  { id: "classDiagram",    label: "類別圖", hint: "Class diagram"   },
  { id: "gantt",           label: "甘特圖", hint: "Gantt chart"     },
];

type WizardStep = "config" | "generating" | "result" | "error";

type DiagramPanelProps = {
  conversationSummary: string;
  onClose: () => void;
};

// Inline expanding panel — mounts between ContextActions and Composer so the
// user can still see the conversation above while choosing diagram options.
function DiagramPanel({ conversationSummary, onClose }: DiagramPanelProps) {
  const researchCtx = useResearchContext();
  const [diagramType, setDiagramType] = useState<DiagramType>("flowchart");
  const [focusOverride, setFocusOverride] = useState("");
  const [step, setStep] = useState<WizardStep>("config");
  const [mermaidCode, setMermaidCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleClose = () => {
    setStep("config");
    setMermaidCode("");
    setErrorMsg("");
    onClose();
  };

  const handleGenerate = async () => {
    setStep("generating");
    const parts: string[] = [];
    if (conversationSummary) parts.push(`Conversation context:\n${conversationSummary}`);
    if (focusOverride.trim()) parts.push(`Focus on: ${focusOverride.trim()}`);
    const description = parts.join("\n\n") || "general overview";
    try {
      const res = await fetch("/api/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "generateMermaid",
          params: { description, diagramType },
        }),
      });
      const data = (await res.json()) as {
        result?: { mermaidCode?: string; error?: string };
        error?: string;
      };
      const code = data.result?.mermaidCode;
      if (code) {
        setMermaidCode(code);
        setStep("result");
      } else {
        setErrorMsg(data.result?.error ?? data.error ?? "Unknown error");
        setStep("error");
      }
    } catch (err) {
      setErrorMsg(String(err));
      setStep("error");
    }
  };

  const handleInsert = () => {
    researchCtx.setPendingDiagram({ code: mermaidCode, diagramType });
    handleClose();
  };

  const handleCopy = () => {
    void navigator.clipboard.writeText(mermaidCode);
  };

  return (
    <div
      className="mx-6 mb-2 overflow-hidden rounded-lg border border-border bg-background shadow-md"
      role="region"
      aria-label="產生圖表"
    >
      <header className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <BarChart2 aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
          產生圖表
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="p-4">
        {step === "config" ? (
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                圖表類型
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {DIAGRAM_TYPES.map((dt) => (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => setDiagramType(dt.id)}
                    className={[
                      "flex flex-col items-center rounded-md border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      diagramType === dt.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    ].join(" ")}
                  >
                    <span className="text-xs font-medium">{dt.label}</span>
                    <span className="mt-0.5 text-2xs opacity-60">{dt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="diagram-focus" className="mb-1 block text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                聚焦主題 <span className="normal-case font-normal">（選填）</span>
              </label>
              <textarea
                id="diagram-focus"
                value={focusOverride}
                onChange={(e) => setFocusOverride(e.target.value)}
                placeholder={
                  conversationSummary
                    ? conversationSummary.slice(0, 100) + "…"
                    : "描述你想要聚焦的主題或關係…"
                }
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-7 items-center rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                className="inline-flex h-7 items-center rounded bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                產生 →
              </button>
            </div>
          </div>
        ) : step === "generating" ? (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">正在產生圖表…</span>
          </div>
        ) : step === "result" ? (
          <div className="space-y-3">
            <div className="max-h-64 overflow-auto rounded-lg">
              <MermaidBlock code={mermaidCode} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("config")}
                className="inline-flex h-7 items-center rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                重試
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex h-7 items-center rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                複製代碼
              </button>
              <button
                type="button"
                onClick={handleInsert}
                className="inline-flex h-7 items-center rounded bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                插入對話
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-destructive">產生失敗：{errorMsg}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("config")}
                className="inline-flex h-7 items-center rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                重試
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-7 items-center rounded border border-border bg-background px-3 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                關閉
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrapper with AnimatePresence so the panel slides in/out smoothly.
export function DiagramWizard({
  open,
  onClose,
  conversationSummary,
}: {
  open: boolean;
  onClose: () => void;
  conversationSummary: string;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="diagram-panel"
          initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: -4, scaleY: 0.95 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4, scaleY: 0.95 }}
          transition={{ duration: prefersReduced ? 0 : 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={{ originY: 0 }}
        >
          <DiagramPanel conversationSummary={conversationSummary} onClose={onClose} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
