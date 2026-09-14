import { client } from "@/sanity/client";

export interface ArchivePost {
  slug: string;
  title: string;
  date: string | null;
  category: string | null;
  categorySlug: string | null;
}

export const ARCHIVE_PAGE_SIZE = 50;
const MAX_ARCHIVE_PAGE = 1000;

type ArchivePostLoader = (
  query: string,
  params: { start: number; end: number },
) => Promise<ArchivePost[] | null | undefined>;

export function parseArchivePage(
  value: string | string[] | undefined,
): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 1;
  return Math.min(parsed, MAX_ARCHIVE_PAGE);
}

export async function getArchivePage(
  page: number,
  loadPosts: ArchivePostLoader = (query, params) =>
    client.fetch<ArchivePost[]>(query, params),
): Promise<{ posts: ArchivePost[]; hasNext: boolean }> {
  const start = (page - 1) * ARCHIVE_PAGE_SIZE;
  const end = start + ARCHIVE_PAGE_SIZE + 1;
  const query = `*[
    _type == "post" &&
    defined(slug.current) &&
    defined(publishedAt) &&
    publishedAt <= now() &&
    !(_id in path('drafts.**'))
  ] | order(publishedAt desc) [$start...$end] {
    "slug": slug.current,
    title,
    "date": publishedAt,
    "category": category->title,
    "categorySlug": category->slug.current
  }`;

  const posts = (await loadPosts(query, { start, end })) || [];
  const boundedPosts = posts.slice(0, ARCHIVE_PAGE_SIZE + 1);

  return {
    posts: boundedPosts.slice(0, ARCHIVE_PAGE_SIZE),
    hasNext: boundedPosts.length > ARCHIVE_PAGE_SIZE,
  };
}
