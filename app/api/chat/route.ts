import { streamText, generateText, convertToCoreMessages, UIMessage, CoreMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatPayload = {
  chatId: string;
  userId?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  memoryTurns?: number;
  systemPrompt?: string;
  streaming?: boolean;
  messages: UIMessage[];
};

const qwen = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
}

function chunkText(content: string, chunkSize = 3000, overlap = 300) {
  const chunks: string[] = [];
  const text = normalizeText(content);
  if (!text) return chunks;

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

async function extractPdfText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return normalizeText(result.text || "");
}

function getAllowedModels() {
  const raw = process.env.ALLOWED_MODELS || "qwen-turbo,qwen-plus,qwen-max,qwen-coder-plus,qwen-vl-max";
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getMaxTurns(requested?: number) {
  const envDefault = Math.max(1, Number(process.env.MAX_TURNS || 8));
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return envDefault;
  }
  return Math.round(clamp(requested, 1, 20));
}

function trimConversationHistory(messages: UIMessage[], maxTurns: number) {
  const maxMessages = maxTurns * 2;
  if (!Array.isArray(messages) || messages.length <= maxMessages) {
    return Array.isArray(messages) ? messages : [];
  }
  return messages.slice(-maxMessages);
}

function injectImagesIntoLatestUserMessage(coreMessages: CoreMessage[], imageBase64: string[]): CoreMessage[] {
  if (!imageBase64.length || !coreMessages.length) return coreMessages;

  const latestUserIndex = [...coreMessages]
    .reverse()
    .findIndex((message) => message.role === "user");

  if (latestUserIndex < 0) {
    return coreMessages;
  }

  const targetIndex = coreMessages.length - 1 - latestUserIndex;
  const targetMessage = coreMessages[targetIndex];
  if (targetMessage.role !== "user") return coreMessages;

  const currentContent = targetMessage.content;
  const textContent = typeof currentContent === "string" ? currentContent : "";

  const multimodalParts = [] as Array<{ type: "text"; text: string } | { type: "image"; image: string }>;
  if (textContent.trim()) {
    multimodalParts.push({
      type: "text",
      text: textContent,
    });
  }

  imageBase64.forEach((image) => {
    multimodalParts.push({
      type: "image",
      image,
    });
  });

  if (multimodalParts.length === 0) return coreMessages;

  const nextMessages = [...coreMessages];
  nextMessages[targetIndex] = {
    ...targetMessage,
    content: multimodalParts,
  };

  return nextMessages;
}

async function parseUploadedFiles(files: File[]) {
  const textChunks: string[] = [];
  const imageBase64: string[] = [];

  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();

    if (mimeType.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(lowerName)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      imageBase64.push(`data:${file.type || "image/png"};base64,${buffer.toString("base64")}`);
      continue;
    }

    if (/\.(c|cpp|h|hpp|py|js|ts|tsx|md|txt|json|yml|yaml)$/i.test(lowerName)) {
      const content = await file.text();
      const chunks = chunkText(content, 4000, 500).slice(0, 8);
      const rendered = chunks
        .map((chunk, idx) => `#### Chunk ${idx + 1}\n\n${chunk}`)
        .join("\n\n");
      textChunks.push(`### File: ${file.name}\n\n${rendered}`);
      continue;
    }

    if (/\.pdf$/i.test(lowerName)) {
      try {
        const pdfText = await extractPdfText(file);
        const chunks = chunkText(pdfText, 3500, 400).slice(0, 10);
        const rendered = chunks.length
          ? chunks.map((chunk, idx) => `#### PDF Chunk ${idx + 1}\n\n${chunk}`).join("\n\n")
          : "[No extractable text found in PDF.]";
        textChunks.push(`### File: ${file.name}\n\n${rendered}`);
      } catch {
        textChunks.push(`### File: ${file.name}\n\n[Failed to parse PDF text.]`);
      }
      continue;
    }

    textChunks.push(`### File: ${file.name}\n\n[Unsupported file type received]`);
  }

  return {
    textContext: textChunks.join("\n\n---\n\n"),
    imageBase64,
  };
}

export async function POST(req: Request) {
  try {
    if (!process.env.DASHSCOPE_API_KEY) {
      return new Response("Missing DASHSCOPE_API_KEY", { status: 500 });
    }

    const contentType = req.headers.get("content-type") || "";

    let payload: ChatPayload;
    let fileContext = "";
    let uploadedImages: string[] = [];
    let isMultipart = false;

    if (contentType.includes("multipart/form-data")) {
      isMultipart = true;
      const formData = await req.formData();
      const messages = JSON.parse(String(formData.get("messages") || "[]")) as UIMessage[];
      const chatId = String(formData.get("chatId") || crypto.randomUUID());
      const model = String(formData.get("model") || "qwen-max");
      const userId = String(formData.get("userId") || "");
      const systemPrompt = String(formData.get("systemPrompt") || "");
      const temperature = Number(formData.get("temperature") || 0.6);
      const topP = Number(formData.get("topP") || 1);
      const maxTokens = Number(formData.get("maxTokens") || 4096);
      const memoryTurns = Number(formData.get("memoryTurns") || 8);
      const streaming = String(formData.get("streaming") || "true") !== "false";
      const files = formData.getAll("files") as File[];

      const parsed = await parseUploadedFiles(files);
      fileContext = parsed.textContext;
      uploadedImages = parsed.imageBase64;

      payload = {
        chatId,
        userId: userId || undefined,
        model,
        systemPrompt: systemPrompt || undefined,
        temperature,
        topP,
        maxTokens,
        memoryTurns,
        streaming,
        messages,
      };
    } else {
      payload = (await req.json()) as ChatPayload;
    }

    const allowedModels = getAllowedModels();
    const requestedModel = payload.model || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "qwen-max";
    const model = allowedModels.includes(requestedModel) ? requestedModel : allowedModels[0] || "qwen-max";
    const temperature = clamp(payload.temperature ?? 0.6, 0, 2);
    const topP = clamp(payload.topP ?? 1, 0, 1);
    const maxTokens = Math.round(clamp(payload.maxTokens ?? 4096, 128, 32000));
    const memoryTurns = getMaxTurns(payload.memoryTurns);
    const streaming = payload.streaming !== false;
    const systemPrompt = payload.systemPrompt?.trim();

    const injectedContext = [
      fileContext ? `Uploaded file context:\n\n${fileContext}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const finalSystemPrompt = [
      systemPrompt || "You are an expert software engineering assistant for C/C++, Python, and Web development.",
      injectedContext,
    ]
      .filter(Boolean)
      .join("\n\n");

    const trimmedMessages = trimConversationHistory(payload.messages || [], memoryTurns);
    const coreMessages = convertToCoreMessages(trimmedMessages);
    const multimodalMessages = injectImagesIntoLatestUserMessage(coreMessages, uploadedImages);

    if (!streaming) {
      const result = await generateText({
        model: qwen(model),
        messages: multimodalMessages,
        system: finalSystemPrompt,
        temperature,
        topP,
        maxTokens,
      });

      return Response.json({ text: result.text });
    }

    const result = streamText({
      model: qwen(model),
      messages: multimodalMessages,
      system: finalSystemPrompt,
      temperature,
      topP,
      maxTokens,
    });

    if (isMultipart) {
      return result.toTextStreamResponse();
    }

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[chat_route_error]", error);
    return new Response("Failed to process chat request", { status: 500 });
  }
}
