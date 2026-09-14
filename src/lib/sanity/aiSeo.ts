import "server-only";

import {
  generateFallbackSeo,
  htmlToText,
  portableTextToPlainText,
} from "./textUtils";

export interface SeoGenerationInput {
  title: string;
  body?: unknown;
  bodyRaw?: string;
}

export interface SeoGenerationResult {
  excerpt: string;
  seoDescription: string;
  source: "gemini" | "fallback";
}

function extractSourceText(input: SeoGenerationInput): string {
  return portableTextToPlainText(input.body) || htmlToText(input.bodyRaw || "");
}

async function generateWithGemini(
  apiKey: string,
  title: string,
  sourceText: string,
): Promise<SeoGenerationResult | null> {
  const prompt = `You are an expert financial/macro editor writing for "Chronoverse Capital".
Given the article title and content below, produce:
1. "excerpt": a factual 2-3 sentence summary (max 320 characters) suitable as an article preview.
2. "seoDescription": a factual SEO meta description (max 160 characters).

Use only facts in the supplied title and content. Respond strictly as JSON with keys "excerpt" and "seoDescription".

Title: ${title}

Content:
${sourceText.slice(0, 6000)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 300,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn("[aiSeo] Gemini request failed with status", response.status);
      return null;
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) return null;

    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const excerptValue = (parsed as { excerpt?: unknown }).excerpt;
    const descriptionValue = (parsed as { seoDescription?: unknown })
      .seoDescription;
    if (
      typeof excerptValue !== "string" ||
      typeof descriptionValue !== "string"
    ) {
      return null;
    }

    const excerpt = excerptValue.trim().slice(0, 320);
    const seoDescription = descriptionValue.trim().slice(0, 160);
    if (!excerpt || !seoDescription) return null;

    return { excerpt, seoDescription, source: "gemini" };
  } catch (error) {
    console.warn("[aiSeo] Gemini generation failed; using the local fallback:", error);
    return null;
  }
}

export async function generateSeoForArticle(
  input: SeoGenerationInput,
): Promise<SeoGenerationResult> {
  const title = input.title.trim().slice(0, 200);
  const sourceText = extractSourceText(input);
  if (!title || !sourceText) {
    throw new Error("SEO generation requires a factual title and article body");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const generated = await generateWithGemini(apiKey, title, sourceText);
    if (generated) return generated;
  }

  return { ...generateFallbackSeo(sourceText), source: "fallback" };
}
