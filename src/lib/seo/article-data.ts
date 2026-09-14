import { cache } from "react";
import { notFound } from "next/navigation";

import {
  getSanityArticleBySlug,
  getSanityPageBySlug,
  type ContentItem,
  type PageContentItem,
} from "@/lib/content";

/** Shares one Sanity article lookup within a single React server render. */
export const getArticleForRoute = cache(getSanityArticleBySlug);

/** Shares one Sanity Page fallback lookup within a single server render. */
export const getPageForRoute = cache(getSanityPageBySlug);

export type RootContentResolution =
  | { readonly kind: "post"; readonly post: ContentItem }
  | { readonly kind: "page"; readonly page: PageContentItem }
  | null;

/**
 * Preserves the public root-route priority: a Post wins over a Page with the
 * same slug. Rejected provider promises deliberately propagate unchanged.
 */
export async function resolveRootContent(
  postResult: Promise<ContentItem | null>,
  loadPage: () => Promise<PageContentItem | null>,
): Promise<RootContentResolution> {
  const post = await postResult;
  if (post) return { kind: "post", post };

  const page = await loadPage();
  return page ? { kind: "page", page } : null;
}

export function requireRootContent(
  content: RootContentResolution,
): Exclude<RootContentResolution, null> {
  if (!content) notFound();
  return content;
}
