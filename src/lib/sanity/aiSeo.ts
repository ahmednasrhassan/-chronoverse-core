/**
 * Auto SEO & Description Generation.
 *
 * Generates a professional SEO meta description and a rich excerpt summary
 * for an article. When `OPENAI_API_KEY` is configured, generation is
 * delegated to OpenAI's Chat Completions API; otherwise a deterministic,
 * dependency-free fallback summarizer (see `textUtils.ts`) is used so the
 * feature always works out of the box.
 */

import { htmlToText, portableTextToPlainText, generateFallbackSeo } from "./textUtils";

export interface SeoGenerationInput {
  title: string;
  /** Portable Text body (Sanity block content), if available. */
  body?: unknown;
  /** Legacy raw HTML body (from Blogger migration), if available. */
  bodyRaw?: string;
}

export interface SeoGenerationResult {
  excerpt: string;
  seoDescription: string;
  source: "openai" | "fallback";
}

function extractSourceText(input: SeoGenerationInput): string {
  const fromBody = portableTextToPlainText(input.body);
  if (fromBody) return fromBody;

  const fromRaw = htmlToText(input.bodyRaw || "");
  return fromRaw;
}

async function generateWithOpenAI(
  apiKey: string,
  title: string,
  sourceText: string
): Promise<SeoGenerationResult | null> {
  const truncated = sourceText.slice(0, 6000);

  const prompt = `You are an expert financial/macro editor writing for "ChronoVerse Capital".
Given the article title and content below, produce:
1. "excerpt": a compelling 2-3 sentence summary (max ~320 characters) suitable as an article preview.
2. "seoDescription": a concise, professional SEO meta description (max 160 characters) optimized for search engines.

Respond strictly as JSON with keys "excerpt" and "seoDescription", no markdown, no extra commentary.

Title: ${title}

Content:
${truncated}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a precise assistant that only outputs valid JSON, with no markdown formatting or commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      console.warn("[aiSeo] OpenAI request failed with status", response.status);
      return null;
    }

    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonString) as { excerpt?: string; seoDescription?: string };

    if (!parsed.excerpt || !parsed.seoDescription) return null;

    return {
      excerpt: parsed.excerpt.trim(),
      seoDescription: parsed.seoDescription.trim().slice(0, 160),
      source: "openai",
    };
  } catch (err) {
    console.warn("[aiSeo] OpenAI generation failed, falling back:", err);
    return null;
  }
}

/**
 * Generates a meta description and excerpt for the given article content.
 * Uses OpenAI when `OPENAI_API_KEY` is set and reachable, otherwise falls
 * back to a deterministic local summarizer.
 */
export async function generateSeoForArticle(input: SeoGenerationInput): Promise<SeoGenerationResult> {
  const sourceText = extractSourceText(input);
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    const aiResult = await generateWithOpenAI(apiKey, input.title, sourceText);
    if (aiResult) return aiResult;
  }

  const fallback = generateFallbackSeo(sourceText, input.title);
  return { ...fallback, source: "fallback" };
}
