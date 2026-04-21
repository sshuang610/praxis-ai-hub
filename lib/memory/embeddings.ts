import { embed, embedMany } from "ai";
import { dashscopeEmbedding } from "@/lib/providers/dashscope";

const BATCH_SIZE = 25;

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: dashscopeEmbedding, value: text });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) => embedMany({ model: dashscopeEmbedding, values: batch }))
  );
  return results.flatMap((r) => r.embeddings);
}

// Small chunks (400 chars) tuned for vector embedding and cosine similarity.
// File/context chunking in route.ts uses larger chunks (3000+ chars) for LLM context — those are intentionally separate.
export function chunkText(
  text: string,
  chunkSize = 400,
  overlap = 50
): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}
