"use client";

import { CSSProperties, FormEvent, MutableRefObject, ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { CodeBlock } from "./code-block";
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

type Artifact = {
  id: string;
  language: string;
  code: string;
};

type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
};

type RealtimeRole = "system" | "user" | "assistant";

type RecentChat = {
  id: string;
  title: string;
  model: string;
  updated_at: string;
  created_at: string;
  metadata?: {
    pinned?: boolean;
  };
};

type ChatMenuState = {
  chat: RecentChat;
  x: number;
  y: number;
} | null;

type ParameterPreset = {
  id: "fast" | "balanced" | "deep";
  label: string;
  temperature: number;
  topP: number;
  maxTokens: number;
};

type PromptTemplate = {
  id: string;
  label: string;
  value: string;
  isCustom?: boolean;
};

const PARAMETER_PRESETS: ParameterPreset[] = [
  {
    id: "fast",
    label: "Fast",
    temperature: 0.45,
    topP: 0.9,
    maxTokens: 1024,
  },
  {
    id: "balanced",
    label: "Balanced",
    temperature: 0.7,
    topP: 1,
    maxTokens: 4096,
  },
  {
    id: "deep",
    label: "Deep",
    temperature: 0.85,
    topP: 0.95,
    maxTokens: 8192,
  },
];

const BUILTIN_SYSTEM_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "general",
    label: "General Assistant",
    value: "You are a practical AI assistant. Clarify requirements, provide concise steps, and highlight trade-offs.",
  },
  {
    id: "coding",
    label: "Coding Mentor",
    value: "You are a senior coding assistant focused on C/C++, Python, and modern Web development. Give production-safe code and explain key decisions briefly.",
  },
  {
    id: "analyst",
    label: "Analyst",
    value: "You are a structured analyst. Ask precise follow-up questions when needed, then provide options with pros/cons and a recommendation.",
  },
];

function extractArtifacts(messages: Array<{ role: string; content: string }>): Artifact[] {
  const artifacts: Artifact[] = [];
  const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;

  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = regex.exec(message.content)) !== null) {
      const language = match[1] || "text";
      const code = (match[2] || "").trim();
      artifacts.push({
        id: `m${index}-b${blockIndex}`,
        language,
        code,
      });
      blockIndex += 1;
    }
  });

  return artifacts;
}

function getModelOptions() {
  const envModels = process.env.NEXT_PUBLIC_ALLOWED_MODELS || "qwen-turbo,qwen-plus,qwen-max,qwen-coder-plus,qwen-vl-max";
  return envModels
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function toFriendlyErrorMessage(rawError: string) {
  const normalized = rawError.trim();
  if (!normalized) return "Request failed. Please retry.";
  if (/missing dashscope_api_key/i.test(normalized)) return "Server is missing API key configuration.";
  if (/unauthorized|401/i.test(normalized)) return "Authentication failed. Please sign in again.";
  if (/429|rate limit|quota/i.test(normalized)) return "Rate limit reached. Please wait a moment and retry.";
  if (/timeout|timed out|504/i.test(normalized)) return "The model timed out. Try a smaller prompt or another model.";
  return normalized.length > 200 ? "Request failed. Please retry." : normalized;
}

function renderMarkdownCode(props: { className?: string; children?: ReactNode; inline?: boolean }) {
  const { className, children, inline } = props;
  const raw = String(children || "").replace(/\n$/, "");
  const language = (className?.replace("language-", "") || "text").toLowerCase();
  const hasLanguageClass = Boolean(className?.includes("language-"));
  const isMultiline = raw.includes("\n");
  const isBlockCode = inline === false || hasLanguageClass || isMultiline;
  const isPlainTextBlock = /^(text|txt|plaintext)$/.test(language);
  const isTinySnippet = raw.length <= 64 && raw.split("\n").length <= 2;

  if (!isBlockCode || (isPlainTextBlock && isTinySnippet)) {
    return <code className="rounded-md bg-zinc-800/90 px-1.5 py-0.5 text-[13px] text-zinc-100">{raw}</code>;
  }

  return <CodeBlock language={language} code={raw.trim()} showActions={!isPlainTextBlock} />;
}

const MARKDOWN_COMPONENTS = {
  code: renderMarkdownCode,
};

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];

const ChatMessages = memo(function ChatMessages({
  messages,
  chatScrollRef,
  bottomAnchorRef,
}: {
  messages: ChatMessage[];
  chatScrollRef: MutableRefObject<HTMLDivElement | null>;
  bottomAnchorRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={chatScrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
      {messages.map((message) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={["flex", message.role === "user" ? "justify-end" : "justify-start"].join(" ")}
        >
          <div
            className={[
              "w-full max-w-[92%] rounded-2xl px-4 py-3 sm:px-5",
              message.role === "user"
                ? "max-w-[84%] border border-emerald-600/35 bg-emerald-900/20"
                : "border border-zinc-800/90 bg-zinc-900/65",
            ].join(" ")}
          >
            <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              {message.role === "user" ? "You" : "Assistant"}
            </div>
            <div className="chat-md text-zinc-100">
              <ReactMarkdown
                remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
                components={MARKDOWN_COMPONENTS}
              >
                {String(message.content)}
              </ReactMarkdown>
            </div>
          </div>
        </motion.div>
      ))}
      <div ref={bottomAnchorRef} />
    </div>
  );
});

ChatMessages.displayName = "ChatMessages";

export function ChatInterface({
  userId,
  userEmail,
  onSignOut,
}: {
  userId: string;
  userEmail?: string;
  onSignOut?: () => void;
}) {
  const modelOptions = useMemo(() => getModelOptions(), []);
  const defaultModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL || modelOptions[0] || "qwen-max";

  const [chatId, setChatId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const saved = localStorage.getItem("my-gpt-chat-id");
    return saved || crypto.randomUUID();
  });
  const [model, setModel] = useState<string>(defaultModel);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(1);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [memoryTurns, setMemoryTurns] = useState<number>(8);
  const [systemPrompt, setSystemPrompt] = useState<string>(
    "You are a senior coding assistant focused on C/C++, Python, and modern Web development.",
  );
  const [showArtifactsOnMobile, setShowArtifactsOnMobile] = useState<boolean>(false);
  const [uploadedFilesByChat, setUploadedFilesByChat] = useState<Record<string, File[]>>({});
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatListLoading, setChatListLoading] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(420);
  const [chatMenu, setChatMenu] = useState<ChatMenuState>(null);
  const [artifactDiffMode, setArtifactDiffMode] = useState<"auto" | "manual">("auto");
  const [manualDiffBaseId, setManualDiffBaseId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customPromptTemplates, setCustomPromptTemplates] = useState<PromptTemplate[]>([]);

  const supabaseRef = useRef(createSupabaseBrowserClient());
  const isHydratedRef = useRef(false);
  const lastPersistedAssistantIdRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isResizingSidebarRef = useRef(false);
  const latestSidebarWidthRef = useRef(300);
  const isResizingRightSidebarRef = useRef(false);
  const latestRightSidebarWidthRef = useRef(420);
  const layoutGridRef = useRef<HTMLDivElement | null>(null);
  const lastDraftRef = useRef<{ chatId: string; text: string; files: File[] } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canRetryLastRequest, setCanRetryLastRequest] = useState(false);

  const uploadedFiles = useMemo(() => uploadedFilesByChat[chatId] || [], [chatId, uploadedFilesByChat]);

  const setUploadedFilesForCurrentChat = useCallback(
    (files: File[]) => {
      setUploadedFilesByChat((prev) => ({
        ...prev,
        [chatId]: files,
      }));
    },
    [chatId],
  );

  const appendUploadedFilesForCurrentChat = useCallback(
    (incomingFiles: File[]) => {
      if (incomingFiles.length === 0) return;
      setUploadedFilesByChat((prev) => {
        const current = prev[chatId] || [];
        const existingKeys = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
        const merged = [...current];
        for (const file of incomingFiles) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (!existingKeys.has(key)) {
            merged.push(file);
            existingKeys.add(key);
          }
        }
        return {
          ...prev,
          [chatId]: merged,
        };
      });
    },
    [chatId],
  );

  const clearNativeFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

  useEffect(() => {
    localStorage.setItem("my-gpt-chat-id", chatId);
  }, [chatId]);

  useEffect(() => {
    clearNativeFileInput();
  }, [chatId, clearNativeFileInput]);

  useEffect(() => {
    const raw = localStorage.getItem("my-gpt-settings");
    if (!raw) {
      isHydratedRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        model?: string;
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        memoryTurns?: number;
        systemPrompt?: string;
        selectedTemplateId?: string;
        customPromptTemplates?: PromptTemplate[];
        streamingEnabled?: boolean;
        controlsCollapsed?: boolean;
        leftPanelCollapsed?: boolean;
        rightPanelCollapsed?: boolean;
        sidebarWidth?: number;
        rightSidebarWidth?: number;
      };

      if (parsed.model && modelOptions.includes(parsed.model)) setModel(parsed.model);
      if (typeof parsed.temperature === "number") setTemperature(parsed.temperature);
      if (typeof parsed.topP === "number") setTopP(parsed.topP);
      if (typeof parsed.maxTokens === "number") setMaxTokens(parsed.maxTokens);
      if (typeof parsed.memoryTurns === "number") setMemoryTurns(Math.max(1, Math.min(20, Math.round(parsed.memoryTurns))));
      if (parsed.systemPrompt) setSystemPrompt(parsed.systemPrompt);
      if (typeof parsed.selectedTemplateId === "string") setSelectedTemplateId(parsed.selectedTemplateId);
      if (Array.isArray(parsed.customPromptTemplates)) {
        const safeTemplates = parsed.customPromptTemplates
          .filter((item) => typeof item?.id === "string" && typeof item?.label === "string" && typeof item?.value === "string")
          .map((item) => ({ ...item, isCustom: true }));
        setCustomPromptTemplates(safeTemplates);
      }
      if (typeof parsed.streamingEnabled === "boolean") setStreamingEnabled(parsed.streamingEnabled);
      if (typeof parsed.controlsCollapsed === "boolean") setControlsCollapsed(parsed.controlsCollapsed);
      if (typeof parsed.leftPanelCollapsed === "boolean") setLeftPanelCollapsed(parsed.leftPanelCollapsed);
      if (typeof parsed.rightPanelCollapsed === "boolean") setRightPanelCollapsed(parsed.rightPanelCollapsed);
      if (typeof parsed.sidebarWidth === "number") {
        const nextWidth = Math.min(420, Math.max(240, parsed.sidebarWidth));
        setSidebarWidth(nextWidth);
        latestSidebarWidthRef.current = nextWidth;
      }
      if (typeof parsed.rightSidebarWidth === "number") {
        const nextWidth = Math.min(640, Math.max(300, parsed.rightSidebarWidth));
        setRightSidebarWidth(nextWidth);
        latestRightSidebarWidthRef.current = nextWidth;
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

  const allPromptTemplates = useMemo(
    () => [...BUILTIN_SYSTEM_PROMPT_TEMPLATES, ...customPromptTemplates],
    [customPromptTemplates],
  );

  const selectedTemplate = useMemo(
    () => allPromptTemplates.find((template) => template.id === selectedTemplateId),
    [allPromptTemplates, selectedTemplateId],
  );

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const selected = allPromptTemplates.find((item) => item.id === templateId);
    if (selected) {
      setSystemPrompt(selected.value);
    }
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

    setCustomPromptTemplates((prev) => {
      const updated = [...prev, nextTemplate];
      return updated;
    });
    setSelectedTemplateId(nextTemplate.id);
  };

  const handleDeletePromptTemplate = () => {
    if (!selectedTemplate?.isCustom) return;
    const confirmed = window.confirm(`Delete template "${selectedTemplate.label}"?`);
    if (!confirmed) return;

    setCustomPromptTemplates((prev) => prev.filter((template) => template.id !== selectedTemplate.id));
    setSelectedTemplateId("");
  };

  useEffect(() => {
    void refreshRecentChats();
  }, [refreshRecentChats]);

  useEffect(() => {
    // Retry applies only to the originating chat to avoid cross-thread replay.
    if (!lastDraftRef.current || lastDraftRef.current.chatId === chatId) return;
    setCanRetryLastRequest(false);
  }, [chatId]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (isResizingSidebarRef.current) {
        const gridRect = layoutGridRef.current?.getBoundingClientRect();
        if (!gridRect) return;
        const nextWidth = Math.min(420, Math.max(240, event.clientX - gridRect.left));
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

  useEffect(() => {
    const closeMenu = () => setChatMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
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

  useEffect(() => {
    let active = true;
    setMessages([]);
    lastPersistedAssistantIdRef.current = null;

    void (async () => {
      try {
        const history = await getChatMessagesAction(chatId);
        if (!active) return;
        setMessages(history);
        const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
        lastPersistedAssistantIdRef.current = lastAssistant?.id ?? null;
      } catch {
        if (!active) return;
        setMessages([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [chatId, setMessages]);

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
          const row = payload.new as { role: RealtimeRole; content: string; id: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            if (prev.some((m) => m.role === row.role && String(m.content).trim() === row.content.trim())) {
              return prev;
            }
            return [...prev, { id: row.id, role: row.role, content: row.content }];
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, setMessages]);

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

  useEffect(() => {
    if (isLoading || messages.length === 0) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    if (!lastAssistant.id || lastPersistedAssistantIdRef.current === lastAssistant.id) return;

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
      .catch(() => {
        // no-op
      });
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

  const visibleRecentChats = useMemo(() => {
    const query = chatSearch.trim().toLowerCase();
    return recentChats
      .filter((chat) => {
        if (!query) return true;
        return (chat.title || "").toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const pinDiff = Number(Boolean(b.metadata?.pinned)) - Number(Boolean(a.metadata?.pinned));
        if (pinDiff !== 0) return pinDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [chatSearch, recentChats]);

  const currentChat = useMemo(() => recentChats.find((chat) => chat.id === chatId), [chatId, recentChats]);

  const artifacts = useMemo(
    () => extractArtifacts(messages.map((m) => ({ role: m.role, content: String(m.content) }))),
    [messages],
  );

  const artifactDiffBaseById = useMemo(() => {
    const lastIndexByLanguage = new Map<string, number>();
    const result = new Map<string, { code: string; index: number }>();

    artifacts.forEach((artifact, idx) => {
      const normalizedLanguage = artifact.language.toLowerCase();
      const previousIndex = lastIndexByLanguage.get(normalizedLanguage);
      if (typeof previousIndex === "number") {
        const previousArtifact = artifacts[previousIndex];
        result.set(artifact.id, {
          code: previousArtifact.code,
          index: previousIndex,
        });
      }
      lastIndexByLanguage.set(normalizedLanguage, idx);
    });

    return result;
  }, [artifacts]);

  const artifactIndexById = useMemo(() => {
    const indexMap = new Map<string, number>();
    artifacts.forEach((artifact, idx) => {
      indexMap.set(artifact.id, idx);
    });
    return indexMap;
  }, [artifacts]);

  const manualDiffBaseArtifact = useMemo(() => {
    if (!manualDiffBaseId) return undefined;
    return artifacts.find((artifact) => artifact.id === manualDiffBaseId);
  }, [artifacts, manualDiffBaseId]);

  useEffect(() => {
    if (artifacts.length === 0) {
      if (manualDiffBaseId) setManualDiffBaseId("");
      return;
    }

    if (manualDiffBaseId && artifacts.some((artifact) => artifact.id === manualDiffBaseId)) {
      return;
    }

    setManualDiffBaseId(artifacts[0].id);
  }, [artifacts, manualDiffBaseId]);

  const tokenUsage = useMemo(() => {
    const allText = messages.map((m) => String(m.content)).join("\n");
    const estimated = estimateTokens(allText);
    const costPer1k = model.includes("max") ? 0.02 : model.includes("plus") ? 0.01 : 0.005;
    const estimatedCost = (estimated / 1000) * costPer1k;
    return {
      estimated,
      estimatedCost,
    };
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

  const sendMessage = async (userText: string, filesSnapshot?: File[]) => {
    const userContent = userText;
    const filesToUpload = filesSnapshot ?? uploadedFiles;
    const optimisticUser = {
      id: crypto.randomUUID(),
      role: "user" as const,
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
    formData.append("model", model);
    formData.append("temperature", String(temperature));
    formData.append("topP", String(topP));
    formData.append("maxTokens", String(maxTokens));
    formData.append("memoryTurns", String(memoryTurns));
    formData.append("systemPrompt", systemPrompt);
    formData.append("streaming", String(streamingEnabled));
    for (const file of filesToUpload) {
      formData.append("files", file);
    }

    const fallbackPayload = {
      chatId,
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

      let accumulated = "";
      if (streamingEnabled) {
        if (!response.body) {
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticAssistantId ? { ...m, content: "No response body." } : m)),
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === optimisticAssistantId ? { ...m, content: accumulated } : m)),
          );
        }

        accumulated += decoder.decode();

        if (!accumulated.trim()) {
          const fallbackResponse = await fetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(fallbackPayload),
            signal: abortControllerRef.current.signal,
          });

          if (fallbackResponse.ok) {
            const data = (await fallbackResponse.json()) as { text?: string; error?: string };
            accumulated = data.text || data.error || "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === optimisticAssistantId
                  ? { ...m, content: accumulated || "No text returned from model." }
                  : m,
              ),
            );
          }
        }
      } else {
        const data = (await response.json()) as { text?: string; error?: string };
        accumulated = data.text || "";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticAssistantId
              ? { ...m, content: accumulated || data.error || "Request failed. Please retry." }
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
        assistantMessage: accumulated,
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
          m.id === optimisticAssistantId
            ? { ...m, content: failureText }
            : m,
        ),
      );
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }

    setUploadedFilesForCurrentChat([]);
    clearNativeFileInput();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const currentInput = input;
    const currentFiles = [...uploadedFiles];
    lastDraftRef.current = { chatId, text: currentInput, files: currentFiles };
    setInput("");
    await sendMessage(currentInput, currentFiles);
  };

  const retryLastRequest = async () => {
    if (isLoading || !lastDraftRef.current?.text?.trim()) return;
    if (lastDraftRef.current.chatId !== chatId) {
      setCanRetryLastRequest(false);
      window.alert("Retry is only available in the original conversation.");
      return;
    }
    const files = [...lastDraftRef.current.files];
    setUploadedFilesForCurrentChat(files);
    await sendMessage(lastDraftRef.current.text, files);
  };

  const stop = () => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
  };

  const onExport = () => {
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
  };

  const handleCreateChat = async () => {
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
  };

  const handleRenameChat = async (targetChat: RecentChat) => {
    setChatMenu(null);
    const nextTitle = window.prompt("Rename conversation", targetChat.title || "New Chat");
    if (nextTitle === null) return;
    await renameChatAction(targetChat.id, nextTitle);
    await refreshRecentChats();
  };

  const handleTogglePinChat = async (targetChat: RecentChat) => {
    setChatMenu(null);
    await togglePinChatAction(targetChat.id, !targetChat.metadata?.pinned);
    await refreshRecentChats();
  };

  const handleDeleteChat = async (targetChat: RecentChat) => {
    setChatMenu(null);
    const confirmed = window.confirm(`Delete conversation \"${targetChat.title || "Untitled"}\"?`);
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
      if (nextChats[0]?.id) {
        setChatId(nextChats[0].id);
      } else {
        await handleCreateChat();
      }
    }
    clearNativeFileInput();
    await refreshRecentChats();
  };

  const handleResetCurrentChat = async () => {
    const confirmed = window.confirm("Clear all messages in current conversation?");
    if (!confirmed) return;
    await clearChatMessagesAction(chatId);
    setMessages([]);
    lastPersistedAssistantIdRef.current = null;
    await refreshRecentChats();
  };

  const handleOpenChatMenu = (event: React.MouseEvent<HTMLButtonElement>, targetChat: RecentChat) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 170, Math.max(8, rect.right - 150));
    const y = Math.min(window.innerHeight - 140, rect.bottom + 6);
    setChatMenu({
      chat: targetChat,
      x,
      y,
    });
  };

  const handleStartSidebarResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingSidebarRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const handleStartRightSidebarResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingRightSidebarRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const handlePickFilesClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveQueuedFile = (targetFile: File) => {
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
  };

  return (
    <div
      className="h-screen overflow-hidden bg-zinc-950 text-zinc-100"
      onClick={() => {
        if (chatMenu) setChatMenu(null);
      }}
    >
      <div
        className="mx-auto grid h-full max-w-[1720px] grid-cols-1 gap-4 p-4"
      >
        <div
          ref={layoutGridRef}
          className={[
            "grid min-h-0 grid-cols-1 gap-4",
            leftPanelCollapsed && rightPanelCollapsed
              ? "lg:grid-cols-[56px_minmax(0,1fr)_56px]"
              : leftPanelCollapsed
                ? "lg:grid-cols-[56px_minmax(0,1fr)_var(--right-sidebar-width)]"
                : rightPanelCollapsed
                  ? "lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_56px]"
                  : "lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)_var(--right-sidebar-width)]",
          ].join(" ")}
          style={{
            "--sidebar-width": `${sidebarWidth}px`,
            "--right-sidebar-width": `${rightSidebarWidth}px`,
          } as CSSProperties}
        >
          <aside
            className={[
              "relative min-h-0 rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4 backdrop-blur-sm lg:overflow-hidden",
              leftPanelCollapsed ? "hidden lg:flex lg:items-stretch lg:justify-center lg:px-2 lg:py-4" : "block",
            ].join(" ")}
          >
          {leftPanelCollapsed ? (
            <div className="flex h-full w-full flex-col items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 py-3">
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(false)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                title="Expand Chat list & Control panel"
              >
                {'>'}
              </button>
              <span className="[writing-mode:vertical-rl] text-[10px] uppercase tracking-widest text-zinc-500">Chat list & Control</span>
            </div>
          ) : (
          <>
          <div className="h-full overflow-y-auto pr-1">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-sm uppercase tracking-[0.2em] text-zinc-300">My own GPT</div>
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(true)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                title="Collapse Chat list & Control panel"
              >
                Hide
              </button>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">Developer workspace</div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Account</div>
            <div className="mt-2 text-sm text-zinc-300">{userEmail || userId}</div>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-3 w-full rounded-md border border-zinc-700 px-3 py-2 text-xs hover:bg-zinc-800"
            >
              Sign Out
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-400">Recent Chats</h2>
              <button
                type="button"
                onClick={() => void handleCreateChat()}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
              >
                New
              </button>
            </div>

            <input
              type="text"
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search conversations..."
              className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500"
            />

            <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {chatListLoading ? <div className="text-xs text-zinc-500">Loading chats...</div> : null}
              {!chatListLoading && visibleRecentChats.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 p-3 text-xs text-zinc-500">
                  No chats yet.
                </div>
              ) : null}
              {visibleRecentChats.map((chat) => (
                <div
                  key={chat.id}
                  className={[
                    "w-full rounded-lg border px-3 py-2",
                    chatId === chat.id
                      ? "border-emerald-700 bg-emerald-950/40"
                      : "border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChatId(chat.id);
                        if (chat.model) setModel(chat.model);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2 truncate text-xs text-zinc-200">
                        {chat.metadata?.pinned ? <span title="Pinned">PIN</span> : null}
                        <span className="truncate">{chat.title || "Untitled"}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {chat.model} · {new Date(chat.updated_at).toLocaleString()}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => handleOpenChatMenu(event, chat)}
                      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                      aria-label="More chat actions"
                    >
                      ...
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-400">Controls</h2>
              <button
                type="button"
                onClick={() => setControlsCollapsed((prev) => !prev)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
              >
                {controlsCollapsed ? "Show" : "Hide"}
              </button>
            </div>

            {!controlsCollapsed ? (
              <>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-500">Quick Presets</div>
              <div className="grid grid-cols-3 gap-2">
                {PARAMETER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setTemperature(preset.temperature);
                      setTopP(preset.topP);
                      setMaxTokens(preset.maxTokens);
                    }}
                    className={[
                      "rounded-md border px-2 py-1 text-xs",
                      activePresetId === preset.id
                        ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                    ].join(" ")}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-zinc-300">Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                {modelOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">Temperature: {temperature.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">Top P: {topP.toFixed(2)}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={topP}
                onChange={(e) => setTopP(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">Max Tokens: {maxTokens.toLocaleString()}</span>
              <input
                type="range"
                value={maxTokens}
                min={256}
                max={32000}
                step={256}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">Short Memory Turns: {memoryTurns}</span>
              <input
                type="range"
                value={memoryTurns}
                min={1}
                max={20}
                step={1}
                onChange={(e) => setMemoryTurns(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-[11px] text-zinc-500">Includes up to {shortMemoryMessageLimit} recent messages per request.</div>
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">System Prompt Template</span>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              >
                <option value="">Choose a template...</option>
                {BUILTIN_SYSTEM_PROMPT_TEMPLATES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} (Built-in)
                  </option>
                ))}
                {customPromptTemplates.length > 0 ? (
                  <optgroup label="Custom Templates">
                    {customPromptTemplates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSavePromptTemplate}
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Save as Template
                </button>
                <button
                  type="button"
                  onClick={handleDeletePromptTemplate}
                  disabled={!selectedTemplate?.isCustom}
                  className="rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 hover:bg-red-950 disabled:opacity-50"
                >
                  Delete Selected
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-zinc-300">System Prompt</span>
              <textarea
                rows={5}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
              />
            </label>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              <div>Token Tracker</div>
              <div className="mt-1">Estimated Tokens: {tokenUsage.estimated.toLocaleString()}</div>
              <div>Estimated Cost: ${tokenUsage.estimatedCost.toFixed(4)}</div>
            </div>

                <button
                  type="button"
                  onClick={onExport}
                  className="w-full rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-emerald-200 hover:bg-emerald-900"
                >
                  Export Thread JSON
                </button>

                <button
                  type="button"
                  onClick={() => void handleResetCurrentChat()}
                  disabled={!currentChat}
                  className="w-full rounded-lg border border-red-800 bg-red-950 px-3 py-2 text-red-300 hover:bg-red-900 disabled:opacity-50"
                >
                  Reset Current Chat
                </button>
              </>
            ) : null}
          </div>
          </div>

            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={handleStartSidebarResize}
              className="absolute -right-2 top-0 z-20 hidden h-full w-3 cursor-col-resize lg:block"
              title="Drag to resize sidebar"
            >
              <div className="mx-auto h-full w-[2px] rounded-full bg-zinc-700/60" />
            </div>
          </>
          )}
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/35 shadow-[0_12px_36px_rgba(0,0,0,0.35)] lg:h-full lg:overflow-hidden">
          <div className="border-b border-zinc-800/80 px-5 py-4">
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-zinc-700 px-2 py-1 text-xs lg:hidden"
                  onClick={() => setShowArtifactsOnMobile((v) => !v)}
                >
                  {showArtifactsOnMobile ? "Hide Artifacts" : "Show Artifacts"}
                </button>
              </div>
            </div>
          </div>

          <ChatMessages messages={messages} chatScrollRef={chatScrollRef} bottomAnchorRef={bottomAnchorRef} />

          <form onSubmit={onSubmit} className="space-y-3 border-t border-zinc-800/80 bg-zinc-900/70 p-4 backdrop-blur sm:px-5">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Type your message here... | Ctrl+Enter to send"
                className="min-h-[108px] w-full rounded-2xl border border-zinc-700/90 bg-zinc-950/90 px-4 py-3 pr-28 font-mono text-sm leading-6 text-zinc-100 placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute bottom-3 right-3 rounded-xl border border-zinc-700 bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-300 disabled:opacity-60"
              >
                {isLoading ? "Thinking..." : "Send"}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={streamingEnabled}
                  onChange={(e) => setStreamingEnabled(e.target.checked)}
                  className="accent-emerald-500"
                />
                Streaming
              </label>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".c,.cpp,.h,.hpp,.py,.js,.ts,.tsx,.pdf,.txt,.md,.json,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  appendUploadedFilesForCurrentChat(files);
                  // Reset native input so the same file can be selected again if needed.
                  e.currentTarget.value = "";
                }}
                className="hidden"
              />

              <button
                type="button"
                onClick={handlePickFilesClick}
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Upload Files
              </button>

              {isLoading ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-xl border border-red-800 bg-red-950 px-4 py-2 text-sm text-red-300"
                >
                  Stop
                </button>
              ) : null}

              {!isLoading && canRetryLastRequest ? (
                <button
                  type="button"
                  onClick={() => void retryLastRequest()}
                  className="rounded-xl border border-amber-700 bg-amber-950 px-4 py-2 text-sm text-amber-300"
                >
                  Retry Last
                </button>
              ) : null}
            </div>

            {uploadedFiles.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{uploadedFiles.length} file(s) queued for this chat.</span>
                  <button
                    type="button"
                    onClick={() => setUploadedFilesForCurrentChat([])}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((file) => {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;
                    return (
                      <div key={key} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200">
                        <span className="max-w-[180px] truncate" title={file.name}>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveQueuedFile(file)}
                          className="rounded border border-zinc-700 px-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                          aria-label={`Remove ${file.name}`}
                        >
                          x
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </form>
          </main>

          <aside
            className={[
              "relative min-h-0 min-w-0 rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-4",
              rightPanelCollapsed
                ? "hidden lg:flex lg:items-stretch lg:justify-center lg:px-2 lg:py-4"
                : showArtifactsOnMobile
                  ? "block lg:block"
                  : "hidden lg:block",
              "lg:overflow-hidden",
            ].join(" ")}
          >
          {rightPanelCollapsed ? (
            <div className="flex h-full w-full flex-col items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 py-3">
              <button
                type="button"
                onClick={() => setRightPanelCollapsed(false)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                title="Expand right panel"
              >
                {'<'}
              </button>
              <span className="[writing-mode:vertical-rl] text-[10px] uppercase tracking-widest text-zinc-500">Artifacts</span>
            </div>
          ) : (
          <>
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleStartRightSidebarResize}
            onDoubleClick={() => {
              setRightSidebarWidth(420);
              latestRightSidebarWidthRef.current = 420;
            }}
            className="absolute left-0 top-0 z-30 hidden h-full w-4 cursor-col-resize lg:block"
            title="Drag to resize artifacts panel"
          >
            <div className="ml-0.5 h-full w-[2px] rounded-full bg-zinc-700/80" />
          </div>
          <div className="h-full overflow-y-auto pl-2 pr-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm uppercase tracking-widest text-zinc-300">Artifacts</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{artifacts.length} blocks</span>
              <button
                type="button"
                onClick={() => setRightPanelCollapsed(true)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-800"
                title="Collapse right panel"
              >
                Hide
              </button>
            </div>
          </div>

          {artifacts.length > 0 ? (
            <div className="mb-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setArtifactDiffMode("auto")}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px]",
                    artifactDiffMode === "auto"
                      ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                  ].join(" ")}
                >
                  Auto Diff
                </button>
                <button
                  type="button"
                  onClick={() => setArtifactDiffMode("manual")}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px]",
                    artifactDiffMode === "manual"
                      ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                  ].join(" ")}
                >
                  Manual Base
                </button>
              </div>
              {artifactDiffMode === "manual" ? (
                <select
                  value={manualDiffBaseId}
                  onChange={(e) => setManualDiffBaseId(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                >
                  {artifacts.map((artifact, idx) => (
                    <option key={artifact.id} value={artifact.id}>
                      #{idx + 1} · {artifact.language}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          <div className="min-w-0 space-y-4">
            {artifacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                Code blocks generated by the assistant will appear here.
              </div>
            ) : null}

            {artifacts.map((artifact, idx) => {
              const autoDiffBase = artifactDiffBaseById.get(artifact.id);
              const manualDiffBaseIndex = manualDiffBaseArtifact ? artifactIndexById.get(manualDiffBaseArtifact.id) : undefined;
              const diffBase =
                artifactDiffMode === "manual"
                  ? manualDiffBaseArtifact && manualDiffBaseArtifact.id !== artifact.id
                    ? { code: manualDiffBaseArtifact.code, index: manualDiffBaseIndex ?? -1 }
                    : undefined
                  : autoDiffBase;

              return (
                <div key={artifact.id} className="space-y-2">
                  <div className="text-xs text-zinc-500">
                    Artifact #{idx + 1} · {artifact.language}
                    {diffBase && diffBase.index >= 0 ? ` · diff vs #${diffBase.index + 1}` : ""}
                  </div>
                  <CodeBlock
                    language={artifact.language}
                    code={artifact.code}
                    originalCode={diffBase?.code}
                  />
                </div>
              );
            })}
          </div>
          </div>
          </>
          )}
          </aside>
        </div>

        {chatMenu ? (
          <div
            className="fixed z-50 min-w-[140px] rounded-lg border border-zinc-700 bg-zinc-950/95 p-1 shadow-2xl"
            style={{ left: chatMenu.x, top: chatMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void handleTogglePinChat(chatMenu.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
            >
              {chatMenu.chat.metadata?.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => void handleRenameChat(chatMenu.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteChat(chatMenu.chat)}
              className="block w-full rounded px-3 py-1.5 text-left text-xs text-red-300 hover:bg-red-950"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
