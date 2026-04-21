import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const EMBEDDING_MODEL = "text-embedding-v3";
const BATCH_SIZE = 25; // DashScope limit per call

const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: process.env.DASHSCOPE_BASE_URL!,
});

const embeddingModel = dashscope.embedding(EMBEDDING_MODEL);

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: text,
  });
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model: embeddingModel,
      values: batch,
    });
    results.push(...embeddings);
  }
  return results;
}

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
