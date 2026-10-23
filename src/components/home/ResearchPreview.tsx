import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { getLatestSanityArticles, type ContentItem } from "@/lib/content";
import { getReadingTime } from "@/lib/readingTime";

export function ResearchPreview() {
  return (
    <Suspense
      fallback={
        <section
          className="cv-container cv-research"
          aria-label="Loading research"
        >
          <p className="cv-eyebrow">Loading published research…</p>
        </section>
      }
    >
      <LatestResearch />
    </Suspense>
  );
}

async function LatestResearch() {
  const articles = await getLatestSanityArticles(3);
  return <ResearchArticles articles={articles} />;
}

export function ResearchArticles({
  articles,
}: {
  articles: readonly ContentItem[];
}) {
  return (
    <section className="cv-research" aria-labelledby="latest-research-title">
      <div className="cv-container">
        <div className="cv-research-heading">
          <div>
            <p className="cv-eyebrow">03 / The editorial desk</p>
            <h2 id="latest-research-title">
              Ideas worth
              <br />
              <span>thinking through.</span>
            </h2>
          </div>
          <div>
            <p>
              Independent research on markets, monetary systems and the forces
              shaping our world.
            </p>
            <Link href="/reports" className="cv-text-link">
              View all research <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        {articles.length === 0 ? (
          <p className="cv-empty-research">
            No published research is available right now.
          </p>
        ) : (
          <div className="cv-article-grid">
            {articles.map((article) => (
              <article className="cv-article" key={article.slug}>
                <Link
                  href={`/${article.slug}`}
                  className="cv-article-image-link"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <div className="cv-article-image">
                    {article.cardImageUrl || article.imageUrl ? (
                      <Image
                        src={
                          article.cardImageUrl
                            ? `/api/research-image?url=${encodeURIComponent(article.cardImageUrl)}`
                            : article.imageUrl!
                        }
                        alt={article.imageAlt || ""}
                        fill
                        sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                        loading="lazy"
                        decoding="async"
                        className="cv-article-photo"
                      />
                    ) : (
                      <span
                        className="cv-article-placeholder"
                        aria-hidden="true"
                      >
                        C / V
                      </span>
                    )}
                  </div>
                </Link>
                <div className="cv-article-meta">
                  <span>{article.category}</span>
                  <time dateTime={article.date}>{article.date}</time>
                </div>
                <h3>
                  <Link href={`/${article.slug}`}>{article.title}</Link>
                </h3>
                {article.seoDescription ? (
                  <p>{article.seoDescription}</p>
                ) : null}
                <div className="cv-article-foot">
                  <span>
                    {getReadingTime(
                      article.bodyContent || article.content || "",
                    )}{" "}
                    min read
                  </span>
                  <span aria-hidden="true">↗</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
