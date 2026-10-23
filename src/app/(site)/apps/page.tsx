import type { Metadata } from "next";
import { AppDiscovery } from "@/components/applications/AppDiscovery";
import { applications, applicationUrl } from "@/config/applications";

export const metadata: Metadata = {
  title: "Applications",
  description:
    "Explore original Chronoverse software. Browse the catalog freely and find clear product features, system requirements and release availability. No applications released yet.",
  alternates: { canonical: applicationUrl() },
  openGraph: {
    title: "Original applications | Chronoverse Capital",
    description:
      "Independent software, purposefully built. Discover the Chronoverse applications catalog.",
    url: applicationUrl(),
    siteName: "Chronoverse Capital",
    type: "website",
  },
};

export default function ApplicationsPage() {
  return (
    <div className="cv-platform">
      <section className="cv-catalog-hero cv-container">
        <p className="cv-eyebrow">Chronoverse / Software catalog</p>
        <div className="cv-catalog-title-row">
          <h1>
            Tools, with a<br />
            <span>point of view.</span>
          </h1>
          <div>
            <p className="cv-hero-intro">
              Original software from an independent studio. A focused
              collection, built one thoughtful release at a time.
            </p>
            <p className="cv-hero-note">
              FREE TO BROWSE <span aria-hidden="true">/</span> NO ACCOUNT
              REQUIRED
            </p>
          </div>
        </div>
      </section>
      <AppDiscovery applications={applications} />
      <section
        className="cv-catalog-guide cv-container"
        aria-labelledby="catalog-guide-title"
      >
        <div>
          <p className="cv-eyebrow">A considered choice</p>
          <h2 id="catalog-guide-title">
            Know your tools.
            <br />
            <span>Before you download.</span>
          </h2>
        </div>
        <div className="cv-guide-items">
          {[
            [
              "Purpose & features",
              "Understand what an application does and whether it fits the task you have in mind.",
            ],
            [
              "Platforms & requirements",
              "Check supported systems, file formats and requirements on each product page.",
            ],
            [
              "Release availability",
              "See clearly whether a release is available. Downloads appear only when they are ready.",
            ],
          ].map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="cv-catalog-contact cv-container">
        <p>Questions about the platform?</p>
        <a
          href="https://chronoversecapital.com/contact"
          className="cv-text-link"
        >
          Talk to Chronoverse <span aria-hidden="true">↗</span>
        </a>
      </div>
    </div>
  );
}
