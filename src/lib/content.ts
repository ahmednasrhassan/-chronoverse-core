import { client } from "../sanity/client";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { getReadingTime } from "./readingTime";




declare const process: {
  cwd(): string;
};

export interface ContentItem {
  slug: string;
  title: string;
  date: string;
  category: string;
  categorySlug?: string;
  keywords: string[];
  content: string;
  legacyBody?: string;
  imageUrl?: string;
  author?: string;
}

interface SanityRawPost {
  slug: string | null;
  title: string | null;
  date: string | null;
  category: string | null;
  categorySlug: string | null;
  keywords: string[] | null;
  content: string | unknown;
  legacyBody: string | null;
  imageUrl: string | null;
  author: string | null;
}


/**
 * Strips HTML tags safely from a string.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "");
}

/**
 * Sanitizes HTML to prevent XSS (Cross-Site Scripting) attacks by removing dangerous tags and attributes.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  
  // Remove script tags and their content
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  
  // Remove iframe tags and their content
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  
  // Remove inline event handlers (e.g., onload, onerror, onclick, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, "");
  
  // Sanitize javascript: URIs in href and src attributes
  clean = clean.replace(/href\s*=\s*['"]javascript:[^'"]*['"]/gi, 'href="#"');
  clean = clean.replace(/src\s*=\s*['"]javascript:[^'"]*['"]/gi, 'src=""');
  
  return clean;
}

/**
 * Calculates the estimated read time in minutes.
 * Ensures accurate calculation by ignoring empty strings and spaces.
 */
export function calculateReadTime(text: string): number {
  return getReadingTime(text);
}


// 1. Fetch a single article by its slug with fallback to local content
export async function getSanityArticleBySlug(slug: string): Promise<ContentItem | null> {
  const query = `*[_type == "post" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    keywords,
    "content": body,
    legacyBody,
    "imageUrl": mainImage.asset->url,
    "author": author->name
  }`;

  try {
    const post = await client.fetch<SanityRawPost | null>(query, { slug });
    if (post) {
      return {
        slug: post.slug || "",
        title: post.title || "Untitled",
        date: post.date ? new Date(post.date).toISOString().split("T")[0] : "2026-08-01",
        category: post.category || "Articles",
        categorySlug: post.categorySlug || undefined,
        keywords: post.keywords || ["macro", "finance"],
        content: typeof post.content === "string" ? post.content : "Article content from Sanity...",
        legacyBody: post.legacyBody || "",
        imageUrl: post.imageUrl || "/images/articles/deglobalization-impact/1767774882.webp",
        author: post.author || "Ahmed Abdel-Fattah",
      };
    }
  } catch (error) {
    console.warn(`Sanity fetch for slug "${slug}" failed, falling back to local content:`, error);
  }


  // Fallback to local content search
  const localArticles = getLocalContent();
  return localArticles.find((item) => item.slug === slug) || null;
}

// 2. Fetch articles directly from Sanity CMS
export async function getSanityArticles(): Promise<ContentItem[]> {
  const query = `*[_type == "post"] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    keywords,
    "content": body,
    legacyBody,
    "imageUrl": mainImage.asset->url,
    "author": author->name
  }`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query);
    if (posts && posts.length > 0) {
      return posts.map((post) => ({
        slug: post.slug || "",
        title: post.title || "Untitled",
        date: post.date ? new Date(post.date).toISOString().split("T")[0] : "2026-08-01",
        category: post.category || "Articles",
        categorySlug: post.categorySlug || undefined,
        keywords: post.keywords || ["macro", "finance"],
        content: typeof post.content === "string" ? post.content : "Article content from Sanity...",
        legacyBody: post.legacyBody || "",
        imageUrl: post.imageUrl || "/images/articles/deglobalization-impact/1767774882.webp",
        author: post.author || "Ahmed Abdel-Fattah",
      }));
    }
  } catch (error) {
    console.warn("Sanity fetch failed, falling back to local content:", error);
  }

  return getLocalContent();
}

/**
 * Fetch all articles belonging to a specific category, matched by the
 * category document's slug (which should mirror the imported Blogger
 * label). Falls back to filtering local content by category name if the
 * Sanity query fails or returns nothing.
 */
export async function getSanityArticlesByCategorySlug(categorySlug: string): Promise<ContentItem[]> {
  const query = `*[_type == "post" && category->slug.current == $categorySlug] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current,
    keywords,
    "content": body,
    legacyBody,
    "imageUrl": mainImage.asset->url,
    "author": author->name
  }`;

  try {
    const posts = await client.fetch<SanityRawPost[]>(query, { categorySlug });
    if (posts && posts.length > 0) {
      return posts.map((post) => ({
        slug: post.slug || "",
        title: post.title || "Untitled",
        date: post.date ? new Date(post.date).toISOString().split("T")[0] : "2026-08-01",
        category: post.category || "Articles",
        categorySlug: post.categorySlug || undefined,
        keywords: post.keywords || ["macro", "finance"],
        content: typeof post.content === "string" ? post.content : "Article content from Sanity...",
        legacyBody: post.legacyBody || "",
        imageUrl: post.imageUrl || "/images/articles/deglobalization-impact/1767774882.webp",
        author: post.author || "Ahmed Abdel-Fattah",
      }));
    }
  } catch (error) {
    console.warn(`Sanity fetch for category "${categorySlug}" failed, falling back to local content:`, error);
  }

  // Fallback: filter local content by matching category name (slugified)
  return getLocalContent().filter(
    (item) => item.category.toLowerCase().replace(/\s+/g, "-") === categorySlug.toLowerCase()
  );
}

/**
 * Fetch all distinct categories (title + slug) currently defined in Sanity.
 * Used to build static params for the /category/[slug] route and to
 * populate category filter UI.
 */
export async function getAllCategories(): Promise<{ title: string; slug: string }[]> {
  const query = `*[_type == "category" && defined(slug.current)] | order(title asc) {
    title,
    "slug": slug.current
  }`;

  try {
    const categories = await client.fetch<{ title: string; slug: string }[]>(query);
    return categories || [];
  } catch (error) {
    console.warn("Sanity fetch for categories failed:", error);
    return [];
  }
}


// 3. Fallback local content reader
export function getLocalContent(): ContentItem[] {
  const contentDirectory = path.join(process.cwd(), "content");
  const categories = ["articles", "books", "guides", "premium"];
  const allItems: ContentItem[] = [];

  try {
    categories.forEach((cat) => {
      const catDir = path.join(contentDirectory, cat);
      if (fs.existsSync(catDir)) {
        const files = fs.readdirSync(catDir);
        files.forEach((file: string) => {
          if (file.endsWith(".mdx") || file.endsWith(".md")) {
            const filePath = path.join(catDir, file);
            const fileContent = fs.readFileSync(filePath, "utf8");
            const { data, content } = matter(fileContent) as {
              data: {
                title?: string;
                date?: string;
                keywords?: string[];
                imageUrl?: string;
                author?: string;
              };
              content: string;
            };

            allItems.push({
              slug: file.replace(/\.mdx?$/, ""),
              title: data.title || file.replace(/\.mdx?$/, "").replace(/-/g, " "),
              date: data.date || "2026-08-01",
              category: cat.toUpperCase(),
              keywords: data.keywords || [cat, "macro", "finance"],
              content: content,
              legacyBody: "",
              imageUrl: data.imageUrl || "/images/articles/deglobalization-impact/1767774882.webp",
              author: data.author || "Ahmed Abdel-Fattah",
            });
          }
        });
      }
    });
  } catch (e) {
    console.warn("Failed to read local files:", e);
  }

  return allItems.sort((a, b) => (a.date < b.date ? 1 : -1));
}
