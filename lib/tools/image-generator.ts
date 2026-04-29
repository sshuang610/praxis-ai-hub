import { tool } from "ai";
import { z } from "zod";

export const generateImageTool = tool({
  description:
    "Generate an image from a text description. Use when the user asks to draw, create, or generate an image.",
  parameters: z.object({
    prompt: z.string().describe("Detailed description of the image to generate"),
    size: z
      .enum(["1024x1024", "720x1280", "1280x720"])
      .default("1024x1024")
      .describe("Image dimensions — square, portrait, or landscape"),
  }),
  execute: async ({ prompt, size }) => {
    // Wanx image models are only available on the domestic DashScope endpoint,
    // not on dashscope-intl. Use a dedicated env var or fall back to domestic.
    const baseUrl =
      process.env.DASHSCOPE_IMAGE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    try {
      const res = await fetch(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "wanx2.1-t2i-turbo",
          prompt,
          n: 1,
          size,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { error: `Image generation failed (${res.status}): ${text}` };
      }
      const data = (await res.json()) as { data?: Array<{ url?: string }> };
      const imageUrl = data.data?.[0]?.url;
      if (!imageUrl) return { error: "No image URL returned by API" };
      return { imageUrl, prompt };
    } catch (err) {
      return { error: String(err) };
    }
  },
});
