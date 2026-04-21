import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, embedTexts, chunkText } from "./embeddings";

export interface MemoryChunk {
  id: string;
  content: string;
  source_type: "conversation" | "file" | "summary";
  chat_id: string | null;
  similarity: number;
  metadata: Record<string, unknown>;
}

interface StoreOptions {
  userId: string;
  chatId?: string;
  content: string;
  sourceType?: "conversation" | "file" | "summary";
  metadata?: Record<string, unknown>;
}

export async function storeMemoryChunk(
  supabase: SupabaseClient,
  opts: StoreOptions
): Promise<void> {
  if (!opts.content || opts.content.trim().length < 100) return;

  const chunks = chunkText(opts.content.trim(), 400, 50);
  const embeddings = await embedTexts(chunks);

  const rows = chunks.map((chunk, i) => ({
    user_id: opts.userId,
    chat_id: opts.chatId ?? null,
    source_type: opts.sourceType ?? "conversation",
    content: chunk,
    embedding: JSON.stringify(embeddings[i]),
    metadata: opts.metadata ?? {},
  }));

  const { error } = await supabase.from("memory_chunks").insert(rows);
  if (error) console.error("[RAG] store error:", error.message);
}

export async function retrieveMemory(
  supabase: SupabaseClient,
  opts: { userId: string; queryText: string; k?: number; threshold?: number }
): Promise<MemoryChunk[]> {
  try {
    const queryEmbedding = await embedText(opts.queryText);
    const { data, error } = await supabase.rpc("match_memory", {
      query_embedding: queryEmbedding,
      target_user_id: opts.userId,
      match_k: opts.k ?? 5,
      match_threshold: opts.threshold ?? 0.70,
    });
    if (error) {
      console.error("[RAG] retrieve error:", error.message);
      return [];
    }
    return (data as MemoryChunk[]) ?? [];
  } catch (err) {
    console.error("[RAG] retrieve exception:", err);
    return [];
  }
}

export function buildMemorySystemPrompt(chunks: MemoryChunk[]): string {
  if (chunks.length === 0) return "";
  const formatted = chunks
    .map((c) => {
      const tag =
        c.source_type === "file"
          ? "[file]"
          : c.source_type === "summary"
          ? "[summary]"
          : "[conv]";
      return `${tag} ${c.content.trim()}`;
    })
    .join("\n\n");
  return `--- Long-term Memory (retrieved from past sessions) ---\n${formatted}\n--- End of Memory ---\n\n`;
}
