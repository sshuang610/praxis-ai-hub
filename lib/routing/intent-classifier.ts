import { generateText } from "ai";
import { dashscope } from "@/lib/providers/dashscope";

export type RoutableModel =
  | "qwen-flash-2025-07-28"
  | "qwen-max"
  | "qwen-plus-2025-07-14"
  | "qwen3-vl-plus";

export interface IntentResult {
  model: RoutableModel;
  reason: string;
  confidence: "high" | "low";
  tier: 1 | 2;
}

const VALID_MODELS: RoutableModel[] = [
  "qwen-flash-2025-07-28", "qwen-max", "qwen-plus-2025-07-14", "qwen3-vl-plus",
];

const CODE_PATTERN =
  /\b(function|class|def |import |#include|const |let |var |=>|===|!=|<\?php|namespace|struct |template|typedef|async |await |@decorator)\b|```[\w+]/i;
const RESEARCH_PATTERN =
  /\b(research|explain|analyze|analyse|compare|derive|prove|theorem|algorithm|architecture|design|evaluate|survey|literature)\b/i;
// Unicode flag required for \p{} property escapes — covers CJK, Hiragana, Katakana
const SIMPLE_PATTERN =
  /^[\P{L}]*[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-zA-Z\s,!?.，！？。]{1,40}[\P{L}]*$/u;

export async function classifyIntent(
  text: string,
  hasImages: boolean
): Promise<IntentResult> {
  if (hasImages) {
    return { model: "qwen3-vl-plus", reason: "Image attachment detected", confidence: "high", tier: 1 };
  }
  if (CODE_PATTERN.test(text)) {
    return { model: "qwen-plus-2025-07-14", reason: "Code keywords detected", confidence: "high", tier: 1 };
  }
  if (RESEARCH_PATTERN.test(text)) {
    return { model: "qwen-max", reason: "Research/analysis intent detected", confidence: "high", tier: 1 };
  }
  if (SIMPLE_PATTERN.test(text.trim())) {
    return { model: "qwen-flash-2025-07-28", reason: "Short conversational message", confidence: "high", tier: 1 };
  }

  try {
    const { text: rawJson } = await generateText({
      model: dashscope("qwen-flash-2025-07-28"),
      system:
        'You are a model router. Reply ONLY with JSON: {"model":"<choice>","reason":"<1 sentence>"}\n' +
        'Choices: qwen-flash-2025-07-28 (simple/chat/general), qwen-max (research/analysis), qwen-plus-2025-07-14 (code/debug), qwen3-vl-plus (images).',
      prompt: text.slice(0, 400),
      maxTokens: 80,
      temperature: 0,
    });

    const match = rawJson.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { model?: string; reason?: string };
      const model = VALID_MODELS.includes(parsed.model as RoutableModel)
        ? (parsed.model as RoutableModel)
        : "qwen-flash-2025-07-28";
      return { model, reason: parsed.reason || "LLM classification", confidence: "low", tier: 2 };
    }
  } catch {
    // fall through to default
  }

  return { model: "qwen-flash-2025-07-28", reason: "Default model", confidence: "low", tier: 1 };
}
