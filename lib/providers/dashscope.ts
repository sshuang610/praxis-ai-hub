import { createOpenAI } from "@ai-sdk/openai";

const BASE_URL =
  process.env.DASHSCOPE_BASE_URL ||
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: BASE_URL,
});

// text-embedding-v3 outputs 1024 dims — schema must use vector(1024).
// Run supabase/v3-embedding-migration.sql before deploying.
export const dashscopeEmbedding = dashscope.embedding("text-embedding-v3");
