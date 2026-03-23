export type ExportableMessage = {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt?: string;
  model?: string;
  metadata?: Record<string, unknown>;
};

export type ExportableThread = {
  chatId: string;
  userId?: string;
  title?: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  createdAt?: string;
  exportedAt: string;
  tokenUsage?: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
  };
  messages: ExportableMessage[];
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function exportThreadAsJson(thread: ExportableThread) {
  const payload = {
    ...thread,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chat-${thread.chatId}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
