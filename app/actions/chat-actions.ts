"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { storeMemoryChunk } from "@/lib/memory/rag";

type SaveConversationTurnInput = {
  chatId: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  systemPrompt?: string;
  userMessage: string;
  assistantMessage: string;
  promptTokens?: number;
  completionTokens?: number;
};

type StoredMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  created_at: string;
};

type StoredChat = {
  id: string;
  title: string;
  model: string;
  updated_at: string;
  created_at: string;
  metadata?: {
    pinned?: boolean;
  } | null;
};

function normalizeTitleFromUserMessage(input: string) {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) return "New Chat";

  const sentence = compact.split(/[.!?\n。！？]/)[0]?.trim() || compact;
  return sentence.slice(0, 120) || "New Chat";
}

async function requireAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return { supabase, user };
}

export async function saveConversationTurnAction(input: SaveConversationTurnInput) {
  const { supabase, user } = await requireAuthenticatedUser();

  const inferredTitle = normalizeTitleFromUserMessage(input.userMessage);

  const { data: existingChat } = await supabase
    .from("chats")
    .select("title")
    .eq("id", input.chatId)
    .eq("user_id", user.id)
    .maybeSingle();

  const shouldOverwriteTitle = !existingChat?.title || existingChat.title === "New Chat";

  await supabase.from("chats").upsert(
    {
      id: input.chatId,
      user_id: user.id,
      title: shouldOverwriteTitle ? inferredTitle : existingChat.title,
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      system_prompt: input.systemPrompt || null,
    },
    { onConflict: "id" },
  );

  const rows = [] as Array<Record<string, unknown>>;

  if (input.userMessage.trim()) {
    rows.push({
      chat_id: input.chatId,
      user_id: user.id,
      role: "user",
      content: input.userMessage,
      model: input.model,
      tokens_input: input.promptTokens ?? null,
      metadata: {},
    });
  }

  if (input.assistantMessage.trim()) {
    rows.push({
      chat_id: input.chatId,
      user_id: user.id,
      role: "assistant",
      content: input.assistantMessage,
      model: input.model,
      tokens_output: input.completionTokens ?? null,
      metadata: {},
    });
  }

  if (rows.length > 0) {
    await supabase.from("messages").insert(rows);
  }

  // Fire-and-forget: store assistant reply as a memory chunk for future RAG
  if (input.assistantMessage.trim().length >= 100) {
    const adminClient = getSupabaseAdminClient();
    storeMemoryChunk(adminClient, {
      userId: user.id,
      chatId: input.chatId,
      content: input.assistantMessage,
      sourceType: "conversation",
      metadata: { model: input.model },
    }).catch((err) => console.error("[RAG] background store failed:", err));
  }

  return { ok: true };
}

export async function getChatMessagesAction(chatId: string) {
  if (!chatId) {
    return [] as Array<{ id: string; role: "system" | "user" | "assistant"; content: string }>;
  }

  const { supabase, user } = await requireAuthenticatedUser();
  const { data } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("chat_id", chatId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return ((data || []) as StoredMessage[]).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
  }));
}

export async function getRecentChatsAction() {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data } = await supabase
    .from("chats")
    .select("id, title, model, updated_at, created_at, metadata")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  return ((data || []) as StoredChat[])
    .map((chat) => ({
      ...chat,
      metadata: {
        pinned: Boolean(chat.metadata?.pinned),
      },
    }))
    .sort((a, b) => {
      const pinDiff = Number(Boolean(b.metadata?.pinned)) - Number(Boolean(a.metadata?.pinned));
      if (pinDiff !== 0) return pinDiff;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
}

export async function createChatAction(input?: {
  title?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  systemPrompt?: string;
}) {
  const { supabase, user } = await requireAuthenticatedUser();

  const payload = {
    user_id: user.id,
    title: input?.title?.trim() || "New Chat",
    model: input?.model || "qwen-max",
    temperature: input?.temperature ?? 0.6,
    max_tokens: input?.maxTokens ?? 4096,
    system_prompt: input?.systemPrompt || null,
    metadata: {
      pinned: false,
      sampling: {
        topP: input?.topP ?? 1,
      },
    },
  };

  const { data, error } = await supabase.from("chats").insert(payload).select("id").single();
  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create chat");
  }

  return { id: data.id };
}

export async function renameChatAction(chatId: string, nextTitle: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const title = nextTitle.trim().slice(0, 120) || "New Chat";

  const { error } = await supabase
    .from("chats")
    .update({ title })
    .eq("id", chatId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message || "Failed to rename chat");
  }

  return { ok: true };
}

export async function togglePinChatAction(chatId: string, pinned: boolean) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: row, error: readError } = await supabase
    .from("chats")
    .select("metadata")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .single();

  if (readError) {
    throw new Error(readError.message || "Failed to load chat metadata");
  }

  const metadata = {
    ...((row?.metadata as Record<string, unknown>) || {}),
    pinned,
  };

  const { error: writeError } = await supabase
    .from("chats")
    .update({ metadata })
    .eq("id", chatId)
    .eq("user_id", user.id);

  if (writeError) {
    throw new Error(writeError.message || "Failed to update pin status");
  }

  return { ok: true };
}

export async function deleteChatAction(chatId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { error } = await supabase.from("chats").delete().eq("id", chatId).eq("user_id", user.id);

  if (error) {
    throw new Error(error.message || "Failed to delete chat");
  }

  return { ok: true };
}

export async function clearChatMessagesAction(chatId: string) {
  const { supabase, user } = await requireAuthenticatedUser();

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("chat_id", chatId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message || "Failed to clear chat messages");
  }

  return { ok: true };
}
