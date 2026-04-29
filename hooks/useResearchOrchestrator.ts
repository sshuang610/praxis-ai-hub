"use client";

import { useCallback, useState } from "react";
import type { GitHubRepo } from "@/lib/search/github";
import type { ArxivPaper } from "@/lib/search/arxiv";
import type { ChatMessage } from "@/hooks/useChatOrchestrator";

export type WebArticle = {
  title: string;
  url: string;
  content: string | null;
  score: number;
};

export type SelectedItem =
  | { type: "repo";    data: GitHubRepo }
  | { type: "paper";   data: ArxivPaper }
  | { type: "article"; data: WebArticle };

export function itemKey(item: SelectedItem): string {
  if (item.type === "repo")  return `repo:${item.data.html_url}`;
  if (item.type === "paper") return `paper:${item.data.id}`;
  return `article:${item.data.url}`;
}

export type LtmMemory = {
  id: string;
  content: string;
};

export type ResearchResults = {
  keywords: string[];
  repos: GitHubRepo[];
  papers: ArxivPaper[];
  articles: WebArticle[];
  ltmMemories?: LtmMemory[];
};

export type PendingDiagram = {
  code: string;
  diagramType: string;
};

export type ResearchOrchestrator = {
  // Search
  isResearching: boolean;
  results: ResearchResults | null;
  researchError: string | null;
  triggerResearch: (messages: ChatMessage[]) => Promise<void>;
  clearResearch: () => void;
  ltmMemories: LtmMemory[];

  // Diagram wizard
  isDiagramWizardOpen: boolean;
  conversationSummary: string;
  openDiagramWizard: (messages: ChatMessage[]) => void;
  closeDiagramWizard: () => void;

  // Pending diagram (composer chip)
  pendingDiagram: PendingDiagram | null;
  setPendingDiagram: (d: PendingDiagram) => void;
  clearPendingDiagram: () => void;

  // Shopping cart (Epic 3)
  selectedItems: SelectedItem[];
  isSelected: (item: SelectedItem) => boolean;
  toggleItem: (item: SelectedItem) => void;
  clearSelection: () => void;

  // Literature review export (Epic 4)
  pendingLiteratureReview: string | null;
  isExportingLiterature: boolean;
  exportLiteratureReview: () => Promise<void>;
  clearLiteratureReview: () => void;

  // Research trajectory diagram (Epic 1)
  trajectoryDiagram: string | null;
  isGeneratingTrajectory: boolean;
  generateTrajectory: () => Promise<void>;
  clearTrajectory: () => void;
};

export function useResearchOrchestrator(): ResearchOrchestrator {
  const [isResearching, setIsResearching] = useState(false);
  const [results, setResults] = useState<ResearchResults | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [ltmMemories, setLtmMemories] = useState<LtmMemory[]>([]);

  const [isDiagramWizardOpen, setIsDiagramWizardOpen] = useState(false);
  const [conversationSummary, setConversationSummary] = useState("");

  const [pendingDiagram, setPendingDiagramState] = useState<PendingDiagram | null>(null);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const [pendingLiteratureReview, setPendingLiteratureReviewState] = useState<string | null>(null);
  const [isExportingLiterature, setIsExportingLiterature] = useState(false);

  const [trajectoryDiagram, setTrajectoryDiagramState] = useState<string | null>(null);
  const [isGeneratingTrajectory, setIsGeneratingTrajectory] = useState(false);

  // ── Search ────────────────────────────────────────────────────────────────

  const triggerResearch = useCallback(async (messages: ChatMessage[]) => {
    setIsResearching(true);
    setResearchError(null);
    try {
      const serialized = messages.slice(-10).map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, 500),
      }));
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: serialized }),
      });
      if (!res.ok) throw new Error(`Research request failed: ${res.status}`);
      const data: ResearchResults = await res.json();
      setResults(data);
      setLtmMemories(data.ltmMemories ?? []);
    } catch (err) {
      setResearchError(String(err));
    } finally {
      setIsResearching(false);
    }
  }, []);

  const clearResearch = useCallback(() => {
    setResults(null);
    setResearchError(null);
    setLtmMemories([]);
  }, []);

  // ── Diagram wizard ────────────────────────────────────────────────────────

  const openDiagramWizard = useCallback((messages: ChatMessage[]) => {
    const summary = messages
      .slice(-8)
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${String(m.content).slice(0, 400)}`)
      .join("\n");
    setConversationSummary(summary);
    setIsDiagramWizardOpen(true);
  }, []);

  const closeDiagramWizard = useCallback(() => {
    setIsDiagramWizardOpen(false);
  }, []);

  const setPendingDiagram = useCallback((d: PendingDiagram) => {
    setPendingDiagramState(d);
  }, []);

  const clearPendingDiagram = useCallback(() => {
    setPendingDiagramState(null);
  }, []);

  // ── Shopping cart (Epic 3) ────────────────────────────────────────────────

  const isSelected = useCallback(
    (item: SelectedItem) =>
      selectedItems.some((i) => itemKey(i) === itemKey(item)),
    [selectedItems],
  );

  const toggleItem = useCallback((item: SelectedItem) => {
    const key = itemKey(item);
    setSelectedItems((prev) =>
      prev.some((i) => itemKey(i) === key)
        ? prev.filter((i) => itemKey(i) !== key)
        : [...prev, item],
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  // ── Literature review export (Epic 4) ────────────────────────────────────

  const exportLiteratureReview = useCallback(async () => {
    if (selectedItems.length === 0) return;
    setIsExportingLiterature(true);
    try {
      const res = await fetch("/api/literature-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selectedItems }),
      });
      if (!res.ok) throw new Error(`Literature review failed: ${res.status}`);
      const data = (await res.json()) as { markdown: string };
      setPendingLiteratureReviewState(data.markdown);
    } catch (err) {
      console.error("[LiteratureReview]", err);
    } finally {
      setIsExportingLiterature(false);
    }
  }, [selectedItems]);

  const clearLiteratureReview = useCallback(() => {
    setPendingLiteratureReviewState(null);
  }, []);

  // ── Research trajectory (Epic 1) ─────────────────────────────────────────

  const generateTrajectory = useCallback(async () => {
    setIsGeneratingTrajectory(true);
    try {
      const res = await fetch("/api/trajectory", { method: "POST" });
      if (!res.ok) throw new Error(`Trajectory failed: ${res.status}`);
      const data = (await res.json()) as { mermaidCode?: string; error?: string };
      if (data.mermaidCode) setTrajectoryDiagramState(data.mermaidCode);
    } catch (err) {
      console.error("[Trajectory]", err);
    } finally {
      setIsGeneratingTrajectory(false);
    }
  }, []);

  const clearTrajectory = useCallback(() => {
    setTrajectoryDiagramState(null);
  }, []);

  return {
    isResearching,
    results,
    researchError,
    triggerResearch,
    clearResearch,
    ltmMemories,

    isDiagramWizardOpen,
    conversationSummary,
    openDiagramWizard,
    closeDiagramWizard,

    pendingDiagram,
    setPendingDiagram,
    clearPendingDiagram,

    selectedItems,
    isSelected,
    toggleItem,
    clearSelection,

    pendingLiteratureReview,
    isExportingLiterature,
    exportLiteratureReview,
    clearLiteratureReview,

    trajectoryDiagram,
    isGeneratingTrajectory,
    generateTrajectory,
    clearTrajectory,
  };
}
