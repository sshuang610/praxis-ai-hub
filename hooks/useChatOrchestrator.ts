"use client";

import {
  FormEvent,
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { estimateTokens, exportThreadAsJson } from "@/lib/utils/export";
import {
  clearChatMessagesAction,
  createChatAction,
  deleteChatAction,
  getChatMessagesAction,
  getRecentChatsAction,
  renameChatAction,
  saveConversationTurnAction,
  togglePinChatAction,
} from "@/app/actions/chat-actions";

// ───────────────────── Types ─────────────────────

export type ChatRole = "system" | "user" | "assistant";

export type MemorySource = {
  id: string;
  similarity: number;
  sourceType: "conversation" | "file" | "summary";
  chatId: string | null;
  preview: string;
};

export type RoutingInfo = {
  model: string;
  reason: string;
};

export type ToolInvocation = {
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
  state: "call" | "result";
};

export type DirectToolResult = {
  toolName: string;
  params: Record<string, unknown>;
  result: unknown;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  routing?: RoutingInfo;
  memorySources?: MemorySource[];
  toolInvocations?: ToolInvocation[];
  directToolResult?: DirectToolResult;
};

export type RecentChat = {
  id: string;
  title: string;
  model: string;
  updated_at: string;
  created_at: string;
  metadata?: { pinned?: boolean };
};

export type ChatMenuState = {
  chat: RecentChat;
  x: number;
  y: number;
} | null;

export type ParameterPreset = {
  id: "fast" | "balanced" | "deep";
  label: string;
  temperature: number;
  topP: number;
  maxTokens: number;
};

export type PromptTemplate = {
  id: string;
  label: string;
  value: string;
  isCustom?: boolean;
};

// ───────────────────── Constants ─────────────────────

export const PARAMETER_PRESETS: ParameterPreset[] = [
  { id: "fast", label: "Fast", temperature: 0.45, topP: 0.9, maxTokens: 1024 },
  { id: "balanced", label: "Balanced", temperature: 0.7, topP: 1, maxTokens: 4096 },
  { id: "deep", label: "Deep", temperature: 0.85, topP: 0.95, maxTokens: 8192 },
];

export const BUILTIN_SYSTEM_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "general",
    label: "General Assistant",
    value:
      "You are a practical AI assistant. Clarify requirements, provide concise steps, and highlight trade-offs.",
  },
  {
    id: "coding",
    label: "Coding Mentor",
    value:
      "You are a senior coding assistant focused on C/C++, Python, and modern Web development. Give production-safe code and explain key decisions briefly.",
  },
  {
    id: "analyst",
    label: "Analyst",
    value:
      "You are a structured analyst. Ask precise follow-up questions when needed, then provide options with pros/cons and a recommendation.",
  },
  {
    id: "researcher",
    label: "Research Agent",
    value:
      "You are Praxis AI — a research-grade agent. Use web search for recent information, cite sources, and produce Mermaid diagrams when illustrating architectures.",
  },
];

// ───────────────────── Utilities ─────────────────────

// Parses Vercel AI SDK data-stream format.
//   0:"text" → plain text delta
//   9:{...}  → tool-call
//   a:{...}  → tool-result
function parseDataStream(raw: string): {
  text: string;
  toolInvocations: ToolInvocation[];
  foundStreamLine: boolean;
} {
  let text = "";
  let foundStreamLine = false;
  const toolMap = new Map<string, ToolInvocation>();

  for (const line of raw.split("\n")) {
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const prefix = line.slice(0, colonIdx);
    const payload = line.slice(colonIdx + 1);

    try {
      if (prefix === "0") {
        foundStreamLine = true;
        text += JSON.parse(payload);
      } else if (prefix === "9") {
        foundStreamLine = true;
        const parsed = JSON.parse(payload) as {
          toolCallId: string;
          toolName: string;
          args?: unknown;
        };
        toolMap.set(parsed.toolCallId, {
          toolCallId: parsed.toolCallId,
          toolName: parsed.toolName,
          args: parsed.args,
          state: "call",
        });
      } else if (prefix === "a") {
        foundStreamLine = true;
        const parsed = JSON.parse(payload) as {
          toolCallId: string;
          result?: unknown;
        };
        const existing = toolMap.get(parsed.toolCallId);
        toolMap.set(parsed.toolCallId, {
          toolCallId: parsed.toolCallId,
          toolName: existing?.toolName ?? "(unknown tool)",
          args: existing?.args,
          result: parsed.result,
          state: "result",
        });
      }
    } catch {
      // Skip partial/malformed line; decoder will replay on next chunk.
    }
  }

  return { text, toolInvocations: Array.from(toolMap.values()), foundStreamLine };
}

function toFriendlyErrorMessage(rawError: string) {
  const normalized = rawError.trim();
  if (!normalized) return "Request failed. Please retry.";
  if (/missing dashscope_api_key/i.test(normalized))
    return "Server is missing API key configuration.";
  if (/unauthorized|401/i.test(normalized))
    return "Authentication failed. Please sign in again.";
  if (/429|rate limit|quota/i.test(normalized))
    return "Rate limit reached. Please wait a moment and retry.";
  if (/timeout|timed out|504/i.test(normalized))
    return "The model timed out. Try a smaller prompt or another model.";
  return normalized.length > 200 ? "Request failed. Please retry." : normalized;
}

function getModelOptions() {
  const envModels =
    process.env.NEXT_PUBLIC_ALLOWED_MODELS ||
    "qwen-turbo,qwen-plus,qwen-max,qwen-coder-plus,qwen-vl-max";
  return envModels.split(",").map((m) => m.trim()).filter(Boolean);
}

// ───────────────────── Hook ─────────────────────

export type ChatOrchestrator = ReturnType<typeof useChatOrchestrator>;

export function useChatOrchestrator(params: {
  userId: string;
  userEmail?: string;
  onSignOut?: () => void;
}) {
  const { userId, userEmail, onSignOut } = params;

  const modelOptions = useMemo(() => ["auto", ...getModelOptions()], []);

  // ── Core state
  const [chatId, setChatId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const saved = localStorage.getItem("my-gpt-chat-id");
    return saved || crypto.randomUUID();
  });
  const [model, setModel] = useState<string>("auto");
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(1);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [memoryTurns, setMemoryTurns] = useState<number>(8);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are a senior coding assistant focused on C/C++, Python, and modern Web development.",
  );

  // ── UI state
  const [showArtifactsOnMobile, setShowArtifactsOnMobile] = useState(false);
  const [uploadedFilesByChat, setUploadedFilesByChat] = useState<Record<string, File[]>>({});
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatListLoading, setChatListLoading] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(440);
  const [chatMenu, setChatMenu] = useState<ChatMenuState>(null);
  const [artifactDiffMode, setArtifactDiffMode] = useState<"auto" | "manual">("auto");
  const [manualDiffBaseId, setManualDiffBaseId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customPromptTemplates, setCustomPromptTemplates] = useState<PromptTemplate[]>([]);
  const [historyTab, setHistoryTab] = useState<"chats" | "memory">("chats");

  // ── Chat content
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canRetryLastRequest, setCanRetryLastRequest] = useState(false);

  // ── Refs
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const isHydratedRef = useRef(false);
  const lastPersistedAssistantIdRef = useRef<string | null>(null);
  const isLoadingHistoryRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isResizingSidebarRef = useRef(false);
  const latestSidebarWidthRef = useRef(320);
  const isResizingRightSidebarRef = useRef(false);
  const latestRightSidebarWidthRef = useRef(440);
  const layoutGridRef = useRef<HTMLDivElement | null>(null);
  const lastDraftRef = useRef<{ chatId: string; text: string; files: File[] } | null>(null);

  // ── Derived state
  const uploadedFiles = useMemo(
    () => uploadedFilesByChat[chatId] || [],
    [chatId, uploadedFilesByChat],
  );

  const setUploadedFilesForCurrentChat = useCallback(
    (files: File[]) => {
      setUploadedFilesByChat((prev) => ({ ...prev, [chatId]: files }));
    },
    [chatId],
  );

  const appendUploadedFilesForCurrentChat = useCallback(
    (incomingFiles: File[]) => {
      if (incomingFiles.length === 0) return;
      setUploadedFilesByChat((prev) => {
        const current = prev[chatId] || [];
        const existingKeys = new Set(
          current.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
        );
        const merged = [...current];
        for (const file of incomingFiles) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (!existingKeys.has(key)) {
            merged.push(file);
            existingKeys.add(key);
          }
        }
        return { ...prev, [chatId]: merged };
      });
    },
    [chatId],
  );

  const clearNativeFileInput = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const refreshRecentChats = useCallback(async () => {
    setChatListLoading(true);
    try {
      const chats = await getRecentChatsAction();
      setRecentChats(chats as RecentChat[]);
    } catch {
      setRecentChats([]);
    } finally {
      setChatListLoading(false);
    }
  }, []);

  // ── Persist chatId
  useEffect(() => {
    localStorage.setItem("my-gpt-chat-id", chatId);
  }, [chatId]);

  useEffect(() => {
    clearNativeFileInput();
  }, [chatId, clearNativeFileInput]);

  // ── Hydrate preferences
  useEffect(() => {
    const raw = localStorage.getItem("my-gpt-settings");
    if (!raw) {
      isHydratedRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.model === "string" && modelOptions.includes(parsed.model))
        setModel(parsed.model);
      if (typeof parsed.temperature === "number") setTemperature(parsed.temperature);
      if (typeof parsed.topP === "number") setTopP(parsed.topP);
      if (typeof parsed.maxTokens === "number") setMaxTokens(parsed.maxTokens);
      if (typeof parsed.memoryTurns === "number")
        setMemoryTurns(Math.max(1, Math.min(20, Math.round(parsed.memoryTurns))));
      if (typeof parsed.systemPrompt === "string") setSystemPrompt(parsed.systemPrompt);
      if (typeof parsed.selectedTemplateId === "string")
        setSelectedTemplateId(parsed.selectedTemplateId);
      if (Array.isArray(parsed.customPromptTemplates)) {
        const safeTemplates = (parsed.customPromptTemplates as PromptTemplate[])
          .filter(
            (item) =>
              typeof item?.id === "string" &&
              typeof item?.label === "string" &&
              typeof item?.value === "string",
          )
          .map((item) => ({ ...item, isCustom: true }));
        setCustomPromptTemplates(safeTemplates);
      }
      if (typeof parsed.streamingEnabled === "boolean")
        setStreamingEnabled(parsed.streamingEnabled);
      if (typeof parsed.controlsCollapsed === "boolean")
        setControlsCollapsed(parsed.controlsCollapsed);
      if (typeof parsed.leftPanelCollapsed === "boolean")
        setLeftPanelCollapsed(parsed.leftPanelCollapsed);
      if (typeof parsed.rightPanelCollapsed === "boolean")
        setRightPanelCollapsed(parsed.rightPanelCollapsed);
      if (typeof parsed.sidebarWidth === "number") {
        const w = Math.min(460, Math.max(240, parsed.sidebarWidth));
        setSidebarWidth(w);
        latestSidebarWidthRef.current = w;
      }
      if (typeof parsed.rightSidebarWidth === "number") {
        const w = Math.min(640, Math.max(300, parsed.rightSidebarWidth));
        setRightSidebarWidth(w);
        latestRightSidebarWidthRef.current = w;
      }
    } catch {
      // no-op
    } finally {
      isHydratedRef.current = true;
    }
  }, [modelOptions]);

  useEffect(() => {
    if (!isHydratedRef.current) return;
    localStorage.setItem(
      "my-gpt-settings",
      JSON.stringify({
        model,
        temperature,
        topP,
        maxTokens,
        memoryTurns,
        systemPrompt,
        selectedTemplateId,
        customPromptTemplates,
        streamingEnabled,
        controlsCollapsed,
        leftPanelCollapsed,
        rightPanelCollapsed,
        sidebarWidth,
        rightSidebarWidth,
      }),
    );
  }, [
    controlsCollapsed,
    leftPanelCollapsed,
    maxTokens,
    memoryTurns,
    model,
    rightPanelCollapsed,
    sidebarWidth,
    rightSidebarWidth,
    selectedTemplateId,
    streamingEnabled,
    customPromptTemplates,
    systemPrompt,
    temperature,
    topP,
  ]);

  // ── Prompt templates
  const allPromptTemplates = useMemo(
    () => [...BUILTIN_SYSTEM_PROMPT_TEMPLATES, ...customPromptTemplates],
    [customPromptTemplates],
  );

  const selectedTemplate = useMemo(
    () => allPromptTemplates.find((t) => t.id === selectedTemplateId),
    [allPromptTemplates, selectedTemplateId],
  );

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const selected = allPromptTemplates.find((i) => i.id === templateId);
    if (selected) setSystemPrompt(selected.value);
  };

  const handleSavePromptTemplate = () => {
    const promptContent = systemPrompt.trim();
    if (!promptContent) {
      window.alert("System prompt is empty. Please write content first.");
      return;
    }
    const rawLabel = window.prompt("Template name", "My Template");
    if (rawLabel === null) return;
    const label = rawLabel.trim();
    if (!label) {
      window.alert("Template name cannot be empty.");
      return;
    }
    const nextTemplate: PromptTemplate = {
      id: `custom-${Date.now()}`,
      label: label.slice(0, 40),
      value: promptContent,
      isCustom: true,
    };
    setCustomPromptTemplates((prev) => [...prev, nextTemplate]);
    setSelectedTemplateId(nextTemplate.id);
  };

  const handleDeletePromptTemplate = () => {
    if (!selectedTemplate?.isCustom) return;
    const confirmed = window.confirm(`Delete template "${selectedTemplate.label}"?`);
    if (!confirmed) return;
    setCustomPromptTemplates((prev) =>
      prev.filter((t) => t.id !== selectedTemplate.id),
    );
    setSelectedTemplateId("");
  };

  // ── Recent chats fetch
  useEffect(() => {
    void refreshRecentChats();
  }, [refreshRecentChats]);

  // ── Retry gate
  useEffect(() => {
    if (!lastDraftRef.current || lastDraftRef.current.chatId === chatId) return;
    setCanRetryLastRequest(false);
  }, [chatId]);

  // ── Sidebar resize
  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (isResizingSidebarRef.current) {
        const gridRect = layoutGridRef.current?.getBoundingClientRect();
        if (!gridRect) return;
        const nextWidth = Math.min(460, Math.max(240, event.clientX - gridRect.left));
        latestSidebarWidthRef.current = nextWidth;
        setSidebarWidth(nextWidth);
        return;
      }
      if (isResizingRightSidebarRef.current) {
        const gridRect = layoutGridRef.current?.getBoundingClientRect();
        if (!gridRect) return;
        const widthFromRight = gridRect.right - event.clientX;
        const nextWidth = Math.min(640, Math.max(300, widthFromRight));
        latestRightSidebarWidthRef.current = nextWidth;
        setRightSidebarWidth(nextWidth);
      }
    };
    const onMouseUp = () => {
      if (!isResizingSidebarRef.current && !isResizingRightSidebarRef.current) return;
      isResizingSidebarRef.current = false;
      isResizingRightSidebarRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Chat menu close on scroll/resize/escape
  useEffect(() => {
    const closeMenu = () => setChatMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // ── Load chat history
  useEffect(() => {
    let active = true;
    isLoadingHistoryRef.current = true;
    setMessages([]);
    lastPersistedAssistantIdRef.current = null;

    void (async () => {
      try {
        const history = await getChatMessagesAction(chatId);
        if (!active) return;
        setMessages(history as ChatMessage[]);
        const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
        lastPersistedAssistantIdRef.current = lastAssistant?.id ?? null;
      } catch {
        if (!active) return;
        setMessages([]);
      } finally {
        if (active) isLoadingHistoryRef.current = false;
      }
    })();

    return () => {
      active = false;
    };
  }, [chatId]);

  // ── Realtime subscribe
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`messages-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const row = payload.new as { role: ChatRole; content: string; id: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            if (
              prev.some(
                (m) => m.role === row.role && String(m.content).trim() === row.content.trim(),
              )
            )
              return prev;
            return [...prev, { id: row.id, role: row.role, content: row.content }];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId]);

  // ── Auto-scroll
  useEffect(() => {
    const container = chatScrollRef.current;
    const anchor = bottomAnchorRef.current;
    if (!container || !anchor) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceToBottom < 160;
    if (isNearBottom || isLoading) {
      anchor.scrollIntoView({ behavior: isLoading ? "auto" : "smooth", block: "end" });
    }
  }, [isLoading, messages]);

  // ── Persist conversation turn (background)
  useEffect(() => {
    if (isLoadingHistoryRef.current) return;
    if (isLoading || messages.length === 0) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant || !lastAssistant.id) return;
    if (lastAssistant.directToolResult) return; // direct tool calls are ephemeral
    if (lastPersistedAssistantIdRef.current === lastAssistant.id) return;
    const assistantIndex = messages.findIndex((m) => m.id === lastAssistant.id);
    const preceding = assistantIndex > 0 ? messages.slice(0, assistantIndex) : messages;
    const lastUser = [...preceding].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    lastPersistedAssistantIdRef.current = lastAssistant.id;
    void saveConversationTurnAction({
      chatId,
      model,
      temperature,
      topP,
      maxTokens,
      systemPrompt,
      userMessage: String(lastUser.content),
      assistantMessage: String(lastAssistant.content),
    })
      .then(() => refreshRecentChats())
      .catch(() => {});
  }, [
    chatId,
    isLoading,
    maxTokens,
    messages,
    model,
    refreshRecentChats,
    systemPrompt,
    temperature,
    topP,
  ]);

  // ── Derived data
  const visibleRecentChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return recentChats
      .filter((chat) => (query ? (chat.title || "").toLowerCase().includes(query) : true))
      .sort((a, b) => {
        const pinDiff =
          Number(Boolean(b.metadata?.pinned)) - Number(Boolean(a.metadata?.pinned));
        if (pinDiff !== 0) return pinDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [chatSearch, recentChats]);

  const currentChat = useMemo(
    () => recentChats.find((chat) => chat.id === chatId),
    [chatId, recentChats],
  );

  const tokenUsage = useMemo(() => {
    const allText = messages.map((m) => String(m.content)).join("\n");
    const estimated = estimateTokens(allText);
    const costPer1k = model.includes("max")
      ? 0.02
      : model.includes("plus")
        ? 0.01
        : 0.005;
    const estimatedCost = (estimated / 1000) * costPer1k;
    return { estimated, estimatedCost };
  }, [messages, model]);

  const activePresetId = useMemo(() => {
    const matched = PARAMETER_PRESETS.find(
      (preset) =>
        Math.abs(preset.temperature - temperature) < 0.0001 &&
        Math.abs(preset.topP - topP) < 0.0001 &&
        preset.maxTokens === maxTokens,
    );
    return matched?.id;
  }, [maxTokens, temperature, topP]);

  const shortMemoryMessageLimit = useMemo(() => memoryTurns * 2, [memoryTurns]);

  // ── Send message
  const sendMessage = useCallback(
    async (userText: string, filesSnapshot?: File[]) => {
      const userContent = userText;
      const filesToUpload = filesSnapshot ?? uploadedFiles;
      const optimisticUser: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
      };

      const optimisticAssistantId = crypto.randomUUID();
      setIsLoading(true);
      setMessages((prev) => [
        ...prev,
        optimisticUser,
        { id: optimisticAssistantId, role: "assistant", content: "" },
      ]);

      const formData = new FormData();
      const nextMessages = [...messages, optimisticUser];
      formData.append("messages", JSON.stringify(nextMessages));
      formData.append("chatId", chatId);
      formData.append("userId", userId);
      formData.append("model", model);
      formData.append("temperature", String(temperature));
      formData.append("topP", String(topP));
      formData.append("maxTokens", String(maxTokens));
      formData.append("memoryTurns", String(memoryTurns));
      formData.append("systemPrompt", systemPrompt);
      formData.append("streaming", String(streamingEnabled));
      for (const file of filesToUpload) formData.append("files", file);

      const fallbackPayload = {
        chatId,
        userId,
        model,
        temperature,
        topP,
        maxTokens,
        memoryTurns,
        systemPrompt,
        streaming: false,
        messages: nextMessages,
      };

      try {
        abortControllerRef.current = new AbortController();
        const response = await fetch("/api/chat", {
          method: "POST",
          body: formData,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = toFriendlyErrorMessage(await response.text());
          setCanRetryLastRequest(true);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticAssistantId
                ? { ...m, content: `Request failed: ${errorText || "Please retry."}` }
                : m,
            ),
          );
          return;
        }

        // Extract routing & memory metadata from response headers
        const routingModel = response.headers.get("x-routing-model");
        const routingReasonRaw = response.headers.get("x-routing-reason");
        const memorySourcesRaw = response.headers.get("x-memory-sources");

        const routing: RoutingInfo | undefined = routingModel
          ? {
              model: routingModel,
              reason: routingReasonRaw ? decodeURIComponent(routingReasonRaw) : "User selected",
            }
          : undefined;

        let memorySources: MemorySource[] | undefined;
        if (memorySourcesRaw) {
          try {
            memorySources = JSON.parse(decodeURIComponent(memorySourcesRaw)) as MemorySource[];
          } catch {
            memorySources = undefined;
          }
        }

        if (routing || (memorySources && memorySources.length > 0)) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticAssistantId ? { ...m, routing, memorySources } : m,
            ),
          );
        }

        let accumulated = "";
        let finalText = "";
        if (streamingEnabled) {
          if (!response.body) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticAssistantId ? { ...m, content: "No response body." } : m,
              ),
            );
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let lastRenderTime = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            const parsed = parseDataStream(accumulated);
            finalText = parsed.text || finalText;
            const now = Date.now();
            if (now - lastRenderTime >= 40) {
              lastRenderTime = now;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimisticAssistantId
                    ? {
                        ...m,
                        content: parsed.text || m.content,
                        toolInvocations:
                          parsed.toolInvocations.length > 0
                            ? parsed.toolInvocations
                            : m.toolInvocations,
                      }
                    : m,
                ),
              );
            }
          }

          accumulated += decoder.decode();
          const finalParse = parseDataStream(accumulated);
          finalText = finalParse.text || finalText;

          if (!finalText.trim()) {
            // Re-use FormData so attached files are included in the fallback too.
            const fallbackForm = new FormData();
            fallbackForm.append("messages", JSON.stringify(nextMessages));
            fallbackForm.append("chatId", chatId);
            fallbackForm.append("userId", userId);
            fallbackForm.append("model", model);
            fallbackForm.append("temperature", String(temperature));
            fallbackForm.append("topP", String(topP));
            fallbackForm.append("maxTokens", String(maxTokens));
            fallbackForm.append("memoryTurns", String(memoryTurns));
            fallbackForm.append("systemPrompt", systemPrompt);
            fallbackForm.append("streaming", "false");
            for (const file of filesToUpload) fallbackForm.append("files", file);
            const fallbackResponse = await fetch("/api/chat", {
              method: "POST",
              body: fallbackForm,
              signal: abortControllerRef.current.signal,
            });

            if (fallbackResponse.ok) {
              const data = (await fallbackResponse.json()) as {
                text?: string;
                error?: string;
                routing?: RoutingInfo;
                memory?: { sources?: MemorySource[] };
              };
              finalText = data.text || data.error || "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === optimisticAssistantId
                    ? {
                        ...m,
                        content: finalText || "No text returned from model.",
                        routing: data.routing ?? m.routing,
                        memorySources: data.memory?.sources ?? m.memorySources,
                      }
                    : m,
                ),
              );
            }
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticAssistantId
                  ? {
                      ...m,
                      content: finalText,
                      toolInvocations:
                        finalParse.toolInvocations.length > 0
                          ? finalParse.toolInvocations
                          : m.toolInvocations,
                    }
                  : m,
              ),
            );
          }
        } else {
          const data = (await response.json()) as {
            text?: string;
            error?: string;
            routing?: RoutingInfo;
            memory?: { sources?: MemorySource[] };
          };
          finalText = data.text || "";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticAssistantId
                ? {
                    ...m,
                    content: finalText || data.error || "Request failed. Please retry.",
                    routing: data.routing ?? m.routing,
                    memorySources: data.memory?.sources ?? m.memorySources,
                  }
                : m,
            ),
          );
        }

        setCanRetryLastRequest(false);
        lastPersistedAssistantIdRef.current = optimisticAssistantId;
        await saveConversationTurnAction({
          chatId,
          model,
          temperature,
          topP,
          maxTokens,
          systemPrompt,
          userMessage: userContent,
          assistantMessage: finalText,
        });
        await refreshRecentChats();
      } catch (error) {
        const interrupted = error instanceof DOMException && error.name === "AbortError";
        const failureText = interrupted
          ? "Generation stopped by user. You can retry the same request."
          : "Request interrupted or failed. Please retry.";
        setCanRetryLastRequest(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticAssistantId ? { ...m, content: failureText } : m,
          ),
        );
      } finally {
        abortControllerRef.current = null;
        setIsLoading(false);
      }

      setUploadedFilesForCurrentChat([]);
      clearNativeFileInput();
    },
    [
      chatId,
      clearNativeFileInput,
      maxTokens,
      memoryTurns,
      messages,
      model,
      refreshRecentChats,
      setUploadedFilesForCurrentChat,
      streamingEnabled,
      systemPrompt,
      temperature,
      topP,
      uploadedFiles,
      userId,
    ],
  );

  const runTool = useCallback(
    async (toolName: string, params: Record<string, unknown>) => {
      if (isLoading) return;

      const label: Record<string, string> = {
        webSearch: `🔍 Search: ${params.query ?? ""}`,
        generateImage: `🖼️ Image: ${params.prompt ?? ""}`,
        generateMermaid: `📊 Diagram: ${params.description ?? ""}`,
        read_file: `📄 Read: ${params.path ?? ""}`,
        list_directory: `📁 List: ${params.path ?? ""}`,
      };
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: label[toolName] ?? `🔧 ${toolName}`,
      };
      const assistantId = crypto.randomUUID();
      setIsLoading(true);
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      try {
        const res = await fetch("/api/tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: toolName, params }),
        });
        const data = (await res.json()) as { result?: unknown; error?: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  directToolResult: {
                    toolName,
                    params,
                    result: data.result ?? { error: data.error ?? "No result" },
                  },
                }
              : m,
          ),
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Tool error: ${String(err)}` }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const currentFiles = [...uploadedFiles];
      if (!input.trim() && currentFiles.length === 0) return;
      // When the user sends only files with no text, show a neutral placeholder
      // in the chat bubble so the message isn't visually empty.
      const currentInput = input.trim() || `（附加 ${currentFiles.length} 個檔案）`;
      lastDraftRef.current = { chatId, text: currentInput, files: currentFiles };
      setInput("");
      await sendMessage(currentInput, currentFiles);
    },
    [chatId, input, sendMessage, uploadedFiles],
  );

  const retryLastRequest = useCallback(async () => {
    if (isLoading || !lastDraftRef.current?.text?.trim()) return;
    if (lastDraftRef.current.chatId !== chatId) {
      setCanRetryLastRequest(false);
      window.alert("Retry is only available in the original conversation.");
      return;
    }
    const files = [...lastDraftRef.current.files];
    setUploadedFilesForCurrentChat(files);
    await sendMessage(lastDraftRef.current.text, files);
  }, [chatId, isLoading, sendMessage, setUploadedFilesForCurrentChat]);

  const stop = useCallback(() => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
  }, []);

  const onExport = useCallback(() => {
    exportThreadAsJson({
      chatId,
      userId,
      model,
      temperature,
      maxTokens,
      systemPrompt,
      exportedAt: new Date().toISOString(),
      tokenUsage: {
        estimatedInputTokens: tokenUsage.estimated,
        estimatedOutputTokens: Math.ceil(tokenUsage.estimated * 0.6),
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as "system" | "user" | "assistant" | "tool",
        content: String(m.content),
        createdAt: new Date().toISOString(),
        metadata: {},
      })),
    });
  }, [chatId, maxTokens, messages, model, systemPrompt, temperature, tokenUsage, userId]);

  const handleCreateChat = useCallback(async () => {
    const created = await createChatAction({
      title: "New Chat",
      model,
      temperature,
      topP,
      maxTokens,
      systemPrompt,
    });
    setChatId(created.id);
    setMessages([]);
    setInput("");
    clearNativeFileInput();
    await refreshRecentChats();
  }, [clearNativeFileInput, maxTokens, model, refreshRecentChats, systemPrompt, temperature, topP]);

  const handleRenameChat = useCallback(
    async (targetChat: RecentChat) => {
      setChatMenu(null);
      const nextTitle = window.prompt("Rename conversation", targetChat.title || "New Chat");
      if (nextTitle === null) return;
      await renameChatAction(targetChat.id, nextTitle);
      await refreshRecentChats();
    },
    [refreshRecentChats],
  );

  const handleTogglePinChat = useCallback(
    async (targetChat: RecentChat) => {
      setChatMenu(null);
      await togglePinChatAction(targetChat.id, !targetChat.metadata?.pinned);
      await refreshRecentChats();
    },
    [refreshRecentChats],
  );

  const handleDeleteChat = useCallback(
    async (targetChat: RecentChat) => {
      setChatMenu(null);
      const confirmed = window.confirm(
        `Delete conversation "${targetChat.title || "Untitled"}"?`,
      );
      if (!confirmed) return;
      await deleteChatAction(targetChat.id);
      setUploadedFilesByChat((prev) => {
        if (!prev[targetChat.id]) return prev;
        const next = { ...prev };
        delete next[targetChat.id];
        return next;
      });
      const nextChats = recentChats.filter((chat) => chat.id !== targetChat.id);
      if (targetChat.id === chatId) {
        if (nextChats[0]?.id) setChatId(nextChats[0].id);
        else await handleCreateChat();
      }
      clearNativeFileInput();
      await refreshRecentChats();
    },
    [chatId, clearNativeFileInput, handleCreateChat, recentChats, refreshRecentChats],
  );

  const handleResetCurrentChat = useCallback(async () => {
    const confirmed = window.confirm("Clear all messages in current conversation?");
    if (!confirmed) return;
    await clearChatMessagesAction(chatId);
    setMessages([]);
    lastPersistedAssistantIdRef.current = null;
    await refreshRecentChats();
  }, [chatId, refreshRecentChats]);

  const handleOpenChatMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, targetChat: RecentChat) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.min(window.innerWidth - 170, Math.max(8, rect.right - 150));
      const y = Math.min(window.innerHeight - 140, rect.bottom + 6);
      setChatMenu({ chat: targetChat, x, y });
    },
    [],
  );

  const handleStartSidebarResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      isResizingSidebarRef.current = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  const handleStartRightSidebarResize = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      isResizingRightSidebarRef.current = true;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  const handlePickFilesClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleRemoveQueuedFile = useCallback(
    (targetFile: File) => {
      setUploadedFilesForCurrentChat(
        uploadedFiles.filter(
          (file) =>
            !(
              file.name === targetFile.name &&
              file.size === targetFile.size &&
              file.lastModified === targetFile.lastModified
            ),
        ),
      );
    },
    [setUploadedFilesForCurrentChat, uploadedFiles],
  );

  const selectChat = useCallback((nextChatId: string, chatModel?: string) => {
    setChatId(nextChatId);
    if (chatModel) setModel(chatModel);
  }, []);

  return {
    // identity
    userId,
    userEmail,
    onSignOut,

    // config
    modelOptions,
    model,
    setModel,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens,
    memoryTurns,
    setMemoryTurns,
    systemPrompt,
    setSystemPrompt,
    streamingEnabled,
    setStreamingEnabled,

    // templates
    allPromptTemplates,
    customPromptTemplates,
    selectedTemplateId,
    selectedTemplate,
    handleSelectTemplate,
    handleSavePromptTemplate,
    handleDeletePromptTemplate,

    // presets
    activePresetId,

    // chat content
    messages,
    input,
    setInput,
    isLoading,
    canRetryLastRequest,
    sendMessage,
    runTool,
    onSubmit,
    retryLastRequest,
    stop,

    // chat metadata
    chatId,
    currentChat,
    recentChats,
    visibleRecentChats,
    chatSearch,
    setChatSearch,
    chatListLoading,
    refreshRecentChats,
    selectChat,
    handleCreateChat,
    handleRenameChat,
    handleTogglePinChat,
    handleDeleteChat,
    handleResetCurrentChat,
    handleOpenChatMenu,
    chatMenu,
    setChatMenu,

    // files
    uploadedFiles,
    uploadedFilesByChat,
    setUploadedFilesForCurrentChat,
    appendUploadedFilesForCurrentChat,
    handlePickFilesClick,
    handleRemoveQueuedFile,
    fileInputRef,

    // layout
    showArtifactsOnMobile,
    setShowArtifactsOnMobile,
    controlsCollapsed,
    setControlsCollapsed,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    rightPanelCollapsed,
    setRightPanelCollapsed,
    sidebarWidth,
    rightSidebarWidth,
    setRightSidebarWidth,
    latestRightSidebarWidthRef,
    layoutGridRef,
    handleStartSidebarResize,
    handleStartRightSidebarResize,

    // chat pane refs
    chatScrollRef,
    bottomAnchorRef,

    // artifacts
    artifactDiffMode,
    setArtifactDiffMode,
    manualDiffBaseId,
    setManualDiffBaseId,

    // history tab
    historyTab,
    setHistoryTab,

    // computed
    tokenUsage,
    shortMemoryMessageLimit,

    // misc
    onExport,
  };
}

// Export helper so external code can derive artifacts consistently.
export type { ChatMessage as OrchestratorMessage };

export function __useChatOrchestratorCallableRefs() {
  return null as MutableRefObject<null> | null;
}
