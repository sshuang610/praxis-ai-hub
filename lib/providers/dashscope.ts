import { createOpenAI } from "@ai-sdk/openai";

const BASE_URL =
  process.env.DASHSCOPE_BASE_URL ||
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export const dashscope = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: BASE_URL,
});

export const dashscopeEmbedding = dashscope.embedding("text-embedding-v3");
