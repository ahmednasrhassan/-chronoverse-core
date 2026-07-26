import { client } from "../../sanity/client";
import ArchiveClientWrapper from "./ArchiveFilters";

async function getArchiveArticles() {
  const query = `*[_type == "post"] | order(publishedAt desc) {
    "id": _id,
    title,
    "slug": slug.current,
    publishedAt,
    "category": category->title,
    "excerpt": excerpt
  }`;

  try {
    const articles = await client.fetch(query);
    return articles || [];
  } catch (error) {
    console.error("Error fetching articles from Sanity:", error);
    return [];
  }
}

export const revalidate = 60; // Revalidate data every 60 seconds

export default async function ArchivePage() {
  const articles = await getArchiveArticles();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-screen">
      <ArchiveClientWrapper initialArticles={articles} />
    </main>
  );
}